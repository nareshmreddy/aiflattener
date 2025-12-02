import pandas as pd
import openpyxl
from io import BytesIO
import difflib
import re

class ExcelAgent:
    def __init__(self):
        self.steps = []
        self.output_df = pd.DataFrame()
        self.instructions = ""

    def log(self, step_name, details, status="success"):
        self.steps.append({
            "step": step_name,
            "details": details,
            "status": status
        })

    def analyze_file(self, file_content, instructions=""):
        """Main entry point to analyze the excel file."""
        self.steps = []
        self.instructions = instructions.lower()

        try:
            self.log("Initialization", f"Received instructions: {instructions}" if instructions else "No instructions provided.")

            # 1. Sheet Identification
            xls = pd.ExcelFile(BytesIO(file_content), engine='openpyxl')
            sheet_names = xls.sheet_names
            self.log("Sheet Identification", f"Detected {len(sheet_names)} sheets: {', '.join(sheet_names)}")

            all_blocks = []

            for sheet_name in sheet_names:
                # Instruction check: Ignore specific sheets
                if f"ignore {sheet_name.lower()}" in self.instructions:
                    self.log(f"Processing Sheet: {sheet_name}", "Skipping based on user instructions.", "warning")
                    continue

                self.log(f"Processing Sheet: {sheet_name}", "Starting analysis...")

                # Load sheet
                df = pd.read_excel(xls, sheet_name=sheet_name, header=None)

                # 2. Extract Metadata (Title rows, etc.)
                metadata_rows = []
                data_start_idx = 0
                for idx, row in df.iterrows():
                    non_null_count = row.count()
                    if non_null_count < 2:
                         metadata_rows.append(row.dropna().to_dict())
                    else:
                        data_start_idx = idx
                        break

                if metadata_rows:
                    self.log(f"Metadata - {sheet_name}", f"Found potential metadata in first {data_start_idx} rows.")

                # 3. Block Structure Understanding
                sheet_data = df.iloc[data_start_idx:].reset_index(drop=True)
                blocks = self._detect_blocks(sheet_data, sheet_name)

                for i, block in enumerate(blocks):
                    self.log(f"Block Analysis - {sheet_name} - Block {i+1}",
                             f"Dimensions: {block.shape}. Detecting orientation...")

                    # 4. Data Orientation Analysis
                    processed_block = self._process_block(block)
                    if processed_block is not None:
                         all_blocks.append(processed_block)

            # 5. Flattening Process
            if all_blocks:
                self.log("Flattening", f"Merging {len(all_blocks)} detected blocks.")

                # Align Headers before concat
                aligned_blocks = self._align_headers(all_blocks)

                self.output_df = pd.concat(aligned_blocks, ignore_index=True)
                self.log("Flattening", "Merge complete.", "success")
            else:
                self.log("Flattening", "No valid data blocks found.", "warning")

            return self.steps, self.output_df

        except Exception as e:
            self.log("Error", str(e), "error")
            return self.steps, pd.DataFrame()

    def _detect_blocks(self, df, sheet_name):
        """Splits a dataframe into blocks based on empty rows."""
        blocks = []
        current_block_start = 0
        in_block = False

        is_empty_row = df.isnull().all(axis=1)

        for i in range(len(df)):
            if not is_empty_row[i]:
                if not in_block:
                    current_block_start = i
                    in_block = True
            else:
                if in_block:
                    blocks.append(df.iloc[current_block_start:i].copy())
                    in_block = False

        if in_block:
            blocks.append(df.iloc[current_block_start:].copy())

        valid_blocks = []
        for b in blocks:
             b = b.dropna(axis=1, how='all')
             if not b.empty and b.shape[0] > 1 and b.shape[1] > 1:
                 valid_blocks.append(b)

        if valid_blocks:
            self.log(f"Block Detection - {sheet_name}", f"Found {len(valid_blocks)} potential data blocks.")

        return valid_blocks

    def _process_block(self, block):
        """Analyzes orientation, sets headers, identifies types."""
        block = block.reset_index(drop=True)

        # Orientation Check: Transposition
        # Heuristic: If we have many columns but few rows, and column headers look like dates or sequential?
        # Or simple check: if we have instructions to "transpose"
        if "transpose" in self.instructions:
            # Very basic check: do we want to apply to all blocks? Let's assume yes if keyword present
            block = block.T
            block = block.reset_index(drop=True)
            self.log("Orientation", "Transposed block based on instructions.")

        new_header = block.iloc[0]
        block = block[1:]
        block.columns = new_header

        # Cleanup headers
        block = block.loc[:, block.columns.notnull()]

        # Normalize headers for internal processing (strip spaces)
        block.columns = [str(c).strip() for c in block.columns]

        dimensions = []
        metrics = []
        for col in block.columns:
            try:
                pd.to_numeric(block[col], errors='raise')
                metrics.append(str(col))
            except:
                dimensions.append(str(col))

        self.log("Column Analysis", f"Dimensions: {dimensions}, Metrics: {metrics}")

        return block

    def _align_headers(self, blocks):
        """
        Aligns headers across blocks using simple fuzzy matching or instructions.
        """
        if not blocks:
            return blocks

        # Collect all unique headers
        all_headers = set()
        for b in blocks:
            all_headers.update(b.columns)

        all_headers = list(all_headers)
        header_map = {h: h for h in all_headers}

        # 1. Instruction-based mapping
        # Parse instructions like "Map Sales to Revenue" or "Align Sales with Revenue"
        # Regex for "map X to Y" or "align X with Y"
        # We need to look for patterns in the instructions string
        if self.instructions:
            # Pattern: "align [col1] with [col2]"
            matches = re.findall(r"align\s+['\"]?([\w\s]+)['\"]?\s+(?:with|to)\s+['\"]?([\w\s]+)['\"]?", self.instructions)
            for source, target in matches:
                # Find closest match in headers for source and target
                # This allows user to say "align sales with revenue" even if headers are "Sales Value" and "Total Revenue"
                real_source = difflib.get_close_matches(source, all_headers, n=1, cutoff=0.4)
                real_target = difflib.get_close_matches(target, all_headers, n=1, cutoff=0.4)

                if real_source and real_target:
                    src, tgt = real_source[0], real_target[0]
                    # We map source to target
                    header_map[src] = tgt
                    self.log("Header Alignment", f"Mapped '{src}' to '{tgt}' based on instructions.")

        # 2. Heuristic mapping (Synonyms) if not explicitly instructed
        # Common synonyms
        synonyms = [
            {'revenue', 'sales', 'amount', 'total'},
            {'cost', 'expense', 'expenditure'},
            {'profit', 'net income', 'margin'},
            {'region', 'area', 'zone', 'location'},
            {'date', 'period', 'time', 'month', 'year'}
        ]

        # Apply synonyms: if two headers belong to the same set, map them to the first one found in the set
        # This is risky without user confirmation, but "AI" implies some inference.
        # We only do this if they are detected in different blocks but not in the same block (to avoid colliding columns)

        # Let's simplify: Just apply the map we built
        aligned_blocks = []
        for b in blocks:
            b_copy = b.copy()
            new_cols = []
            for col in b_copy.columns:
                new_cols.append(header_map.get(col, col))
            b_copy.columns = new_cols
            aligned_blocks.append(b_copy)

        return aligned_blocks
