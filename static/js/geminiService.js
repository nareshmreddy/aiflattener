// Gemini Service
import { GoogleGenAI } from "@google/genai";
import { DataType, SemanticRole } from "./types.js";

// We will initialize this dynamically with the key
let ai = null;
const MODEL_NAME = 'gemini-2.5-flash';

export const initAI = (apiKey) => {
    ai = new GoogleGenAI({ apiKey: apiKey });
};

function parseAndHydrate(jsonText, sheetName) {
  const tables = JSON.parse(jsonText);
  return tables.map((t, idx) => ({
    ...t,
    id: `${sheetName}-table-${idx}`,
    columns: t.columns.map((c, cIdx) => ({
      ...c,
      id: `${sheetName}-table-${idx}-col-${cIdx}`,
      sampleValues: []
    }))
  }));
}

function serializeGrid(grid) {
  return grid.map((row, idx) => {
    const rowStr = row.map(cell => {
      if (cell === null || cell === undefined) return "";
      const s = String(cell).replace(/\s+/g, " ").trim();
      return s.length > 40 ? s.substring(0, 37) + "..." : s;
    }).join(" | ");
    return `Row ${idx}: | ${rowStr} |`;
  }).join("\n");
}

/**
 * Renders the 2D grid data to a base64 PNG image using the Canvas API.
 */
async function renderSheetToBase64(grid) {
  const CELL_WIDTH = 120;
  const CELL_HEIGHT = 30;
  const HEADER_SIZE = 30;

  if (!grid || grid.length === 0) return "";

  const rows = grid.length;
  // Calculate max cols safely
  const cols = Math.max(...grid.map(r => r ? r.length : 0));

  const width = HEADER_SIZE + (cols * CELL_WIDTH);
  const height = HEADER_SIZE + (rows * CELL_HEIGHT);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) return "";

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const drawText = (text, x, y, color = "#000", font = "11px sans-serif") => {
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.fillText(text, x, y);
  };

  ctx.fillStyle = "#f1f5f9";
  ctx.fillRect(HEADER_SIZE, 0, width - HEADER_SIZE, HEADER_SIZE);
  ctx.strokeStyle = "#cbd5e1";
  ctx.beginPath();

  for (let c = 0; c < cols; c++) {
    const x = HEADER_SIZE + (c * CELL_WIDTH);
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    const letter = String.fromCharCode(65 + (c % 26));
    const label = c >= 26 ? `${String.fromCharCode(65 + Math.floor(c/26) - 1)}${letter}` : letter;
    drawText(label, x + 50, 20, "#64748b", "bold 12px sans-serif");
  }

  ctx.fillStyle = "#f1f5f9";
  ctx.fillRect(0, HEADER_SIZE, HEADER_SIZE, height - HEADER_SIZE);

  for (let r = 0; r < rows; r++) {
    const y = HEADER_SIZE + (r * CELL_HEIGHT);
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    drawText(String(r + 1), 5, y + 20, "#64748b", "bold 11px sans-serif");
  }
  ctx.stroke();

  for (let r = 0; r < rows; r++) {
    if (!grid[r]) continue;
    for (let c = 0; c < grid[r].length; c++) {
      const cell = grid[r][c];
      if (cell !== null && cell !== undefined && cell !== "") {
        const x = HEADER_SIZE + (c * CELL_WIDTH) + 5;
        const y = HEADER_SIZE + (r * CELL_HEIGHT) + 20;
        let val = String(cell);
        if (val.length > 18) val = val.substring(0, 16) + "..";
        drawText(val, x, y, "#0f172a");
      }
    }
  }

  const dataUrl = canvas.toDataURL("image/png");
  return dataUrl.split(',')[1];
}

export const analyzeSheetChunk = async (
  sheetName,
  rawRows,
  onLog
) => {
  if (!ai) {
      throw new Error("Gemini API Key not initialized.");
  }

  const log = (msg, type, attachment) => {
    if (onLog) onLog(msg, type, attachment);
  };

  log(`[Stage 2] Preparing Analysis for "${sheetName}"...`, 'info');

  // 1. Prepare Text Context
  const textContext = serializeGrid(rawRows);
  log(`[Stage 2] Serialized ${rawRows.length} rows to text stream.`, 'info');

  // 2. Prepare Vision Context
  log(`[Stage 2] Rendering visual snapshot for Vision Model...`, 'info');
  const imageBase64 = await renderSheetToBase64(rawRows);
  log(`[Stage 2] Snapshot generated (${(imageBase64.length / 1024).toFixed(1)} KB).`, 'ai', {
    type: 'image',
    data: imageBase64,
    label: `Vision Snapshot: ${sheetName}`
  });

  // 3. Robust "Stage 2-4" Pipeline Prompt
  const prompt = `
    You are an expert Data Engineer implementing a robust schema ingestion pipeline.

    INPUT CONTEXT:
    - Sheet Name: "${sheetName}"
    - Image: Visual layout of the first 50x40 cells.
    - Text: Exact values in pipe-delimited format.
    - NORMALIZATION: Merged cells have already been 'filled down/right'. If you see repeated values in headers (e.g., "Q1 | Q1 | Q1"), it indicates a previous merge over 3 columns.

    YOUR TASKS (Pipeline Stages 2-4):

    1. **Structure Detection (Stage 2)**:
       - Identify logical tables. Look for headers, sparse blocks (islands of data), and cross-tabs.
       - A "Table" must have a clear header row.
       - If multiple identical blocks exist (e.g. monthly reports stacked vertically), treat them as ONE logical table if schema is identical.

    2. **Schema Inference (Stage 4)**:
       - For each column, determine:
         - **Name**: Flatten multi-row headers if needed (e.g. "Region" + "City" -> "Region_City").
         - **Type**: String, Number, Boolean, Date.
         - **Role**: Dimension, Metric, Entity, Timestamp, or Hierarchy.
       - **Hierarchy Discovery**: If a column acts as a parent to another (e.g. Region -> City), mark it as 'Hierarchy'.
       - **Time Dimensions**: If columns look like "Jan", "Feb" or "Q1 2024", "Q2 2024", identify this structure in the table description.

    OUTPUT FORMAT:
    Return a strictly valid JSON array of Table objects.
    Fields:
    - name: string
    - startRow: number (0-based)
    - endRow: number (inclusive)
    - description: string (Explain structure)
    - confidence: number (0-1)
    - columns: Array of objects (originalName, suggestedName, dataType, semanticRole, confidence, reasoning)

    CONSTRAINTS:
    - Be concise in 'reasoning'.
    - Ignore empty columns.
    - If no data found, return [].
  `;

  try {
    log(`[Stage 3] Sending multimodal payload to Gemini 2.5...`, 'ai');

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: "image/png", data: imageBase64 } },
            { text: `RAW NORMALIZED DATA:\n${textContext}` }
          ]
        }
      ],
      config: {
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        // Note: The schema format here needs to be plain object for JS SDK if typed is not fully supported,
        // but recent SDKs support JSON schema.
      }
    });

    const text = response.text() || "[]";
    let results = [];

    try {
      results = parseAndHydrate(text, sheetName);
      log(`[Stage 4] Successfully parsed schema for "${sheetName}".`, 'success', {
        type: 'json',
        data: results,
        label: `Parsed Schema: ${sheetName}`
      });
    } catch (parseError) {
      log(`[Stage 4] JSON Error: ${parseError}. Attempting repair...`, 'warning');
      let repairedText = text.trim();
      // Simple repair attempt
      if (repairedText.startsWith('[') && !repairedText.endsWith(']')) {
         const lastObjectEnd = repairedText.lastIndexOf('}');
         if (lastObjectEnd !== -1) {
             repairedText = repairedText.substring(0, lastObjectEnd + 1) + ']';
             try {
                 results = parseAndHydrate(repairedText, sheetName);
                 log(`[Stage 4] JSON Repair Successful.`, 'success');
             } catch (retryError) {
                log(`[Stage 4] Repair failed.`, 'error');
             }
         }
      }
      if (results.length === 0) {
        // Fallback or re-throw
        // Often Gemini wraps json in ```json ... ```
        const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
        if (jsonMatch) {
             try {
                 results = parseAndHydrate(jsonMatch[1], sheetName);
                 log(`[Stage 4] Cleaned markdown and parsed.`, 'success');
             } catch(e) {
                 throw new Error(`Failed to parse AI response: ${text.substring(0, 100)}...`);
             }
        } else {
             throw new Error(`Failed to parse AI response.`);
        }
      }
    }

    // Detailed Reasoning Logs for the User
    results.forEach(table => {
      log(`Detected Table: "${table.name}" (Confidence: ${(table.confidence * 100).toFixed(0)}%)`, 'ai');
      log(`📝 Description: ${table.description}`, 'info');

      let hierarchyCount = 0;
      let timeCount = 0;

      table.columns.forEach(col => {
        if (col.semanticRole === SemanticRole.HIERARCHY) {
          log(`  ↳ 🌳 Detected Hierarchy: "${col.suggestedName}" (${col.reasoning})`, 'success');
          hierarchyCount++;
        }
        if (col.semanticRole === SemanticRole.TIMESTAMP || (col.reasoning && col.reasoning.toLowerCase().includes('time'))) {
           log(`  ↳ 📅 Detected Time Dimension: "${col.suggestedName}"`, 'success');
           timeCount++;
        }
        if (col.confidence < 0.6) {
           log(`  ↳ ⚠ Low Confidence on col "${col.originalName}": ${col.reasoning}`, 'warning');
        }
      });

      if (hierarchyCount === 0 && timeCount === 0) {
        log(`  ↳ Standard tabular schema detected.`, 'info');
      }
    });

    return results;

  } catch (error) {
    log(`Analysis failed: ${error.message}`, 'error');
    throw error;
  }
};
