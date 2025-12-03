// File Processing Service
import * as XLSX from 'xlsx';

/**
 * Helper to fill merged cells with their top-left value (Stage 1: Normalization)
 */
const unmergeAndFillCells = (sheet) => {
  if (!sheet['!merges']) return 0;

  const merges = sheet['!merges'];
  let count = 0;

  merges.forEach((merge) => {
    // Get the value of the top-left cell in the merge range
    const startCellRef = XLSX.utils.encode_cell(merge.s);
    const startCell = sheet[startCellRef];
    const val = startCell ? startCell.v : null;

    // Fill all cells in the range with this value
    for (let r = merge.s.r; r <= merge.e.r; r++) {
      for (let c = merge.s.c; c <= merge.e.c; c++) {
        const cellRef = XLSX.utils.encode_cell({ r, c });
        // If cell doesn't exist, create it
        if (!sheet[cellRef]) {
          sheet[cellRef] = { t: 's', v: val };
        } else {
          // If it exists (usually empty in a merge), overwrite value
          sheet[cellRef].v = val;
        }
      }
    }
    count++;
  });

  // Remove merges metadata so XLSX treats them as individual filled cells
  delete sheet['!merges'];
  return count;
};

export const parseFile = async (file, onLog) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    const log = (msg, type, attachment) => {
      if (onLog) onLog(msg, type, attachment);
    };

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        log("Reading binary data stream...", 'info');
        const workbook = XLSX.read(data, { type: 'array' });

        const sheetsData = {};

        // Access visibility metadata
        const sheetsVisibility = workbook.Workbook?.Sheets || [];

        workbook.SheetNames.forEach((sheetName, idx) => {
          // 1. Strict Visibility Check
          const sheetMeta = sheetsVisibility[idx];
          if (sheetMeta && sheetMeta.Hidden !== 0) {
            log(`Skipping hidden sheet: "${sheetName}"`, 'warning');
            return;
          }

          const sheet = workbook.Sheets[sheetName];

          // 2. Normalize: Unmerge and Fill (Stage 1 of Pipeline)
          const mergedCount = unmergeAndFillCells(sheet);
          if (mergedCount > 0) {
            log(`[Stage 1] Normalized ${mergedCount} merged regions in "${sheetName}"`, 'success');
          }

          // 3. Identify Hidden Columns
          const hiddenColIndices = new Set();
          if (sheet['!cols']) {
            sheet['!cols'].forEach((col, colIdx) => {
              if (col && col.hidden) {
                hiddenColIndices.add(colIdx);
              }
            });
          }

          // 4. Convert to JSON Matrix
          const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

          // 5. Filter Hidden Columns
          let finalData = jsonData;
          if (hiddenColIndices.size > 0) {
            log(`[Stage 1] Dropped ${hiddenColIndices.size} hidden columns in "${sheetName}"`, 'info');
            finalData = jsonData.map(row =>
              row.filter((_, colIdx) => !hiddenColIndices.has(colIdx))
            );
          }

          // 6. Prune empty rows at the end
          while (finalData.length > 0 && finalData[finalData.length - 1].every(c => c === null || c === "")) {
            finalData.pop();
          }

          sheetsData[sheetName] = finalData;
        });

        resolve(sheetsData);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};

export const sampleSheetData = (grid, rowLimit = 50, colLimit = 40) => {
  return grid.slice(0, rowLimit).map(row => row.slice(0, colLimit));
};
