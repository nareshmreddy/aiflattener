import { parseFile, sampleSheetData } from './fileService.js';
import { analyzeSheetChunk, initAI } from './geminiService.js';
import { renderLog, renderSchemaEditor } from './ui.js';

// State
let phase = 'upload'; // upload, scanning, analyzing, review, export
let logs = [];
let sheetAnalyses = [];
let isProcessing = false;

// DOM Elements
const fileInput = document.getElementById('file-upload');
const apiKeyInput = document.getElementById('api-key');
const btnFinalize = document.getElementById('btn-finalize');

// Views
const viewUpload = document.getElementById('view-upload');
const viewProcessing = document.getElementById('view-processing');
const viewReview = document.getElementById('view-review');

// Nav
const navUpload = document.getElementById('nav-upload');
const navAnalyze = document.getElementById('nav-analyze');
const navReview = document.getElementById('nav-review');

// Helpers
const addLog = (message, type = 'info', attachment) => {
    const log = {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: Date.now(),
        message,
        type,
        attachment
    };
    logs.push(log);
    renderLog(log);
};

const setPhase = (newPhase) => {
    phase = newPhase;

    // Update View Visibility
    viewUpload.classList.add('hidden');
    viewProcessing.classList.add('hidden');
    viewReview.classList.add('hidden');

    if (phase === 'upload') viewUpload.classList.remove('hidden');
    if (phase === 'scanning' || phase === 'analyzing') viewProcessing.classList.remove('hidden');
    if (phase === 'review' || phase === 'export') viewReview.classList.remove('hidden');

    // Update Nav
    navUpload.className = phase === 'upload' ? 'text-blue-400' : 'text-slate-400';
    navAnalyze.className = (phase === 'scanning' || phase === 'analyzing') ? 'text-blue-400' : 'text-slate-400';
    navReview.className = phase === 'review' || phase === 'export' ? 'text-blue-400' : 'text-slate-400';

    // Processing Status
    if (phase === 'scanning') document.getElementById('processing-status').innerText = "Reading File Structure...";
    if (phase === 'analyzing') document.getElementById('processing-status').innerText = "AI Analyzing Semantics...";
};

// Handlers
const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const key = apiKeyInput.value.trim();
    if (!key) {
        alert("Please enter a valid Google Gemini API Key first.");
        fileInput.value = ""; // reset
        return;
    }

    // Initialize AI
    try {
        initAI(key);
    } catch(e) {
        alert("Error initializing AI: " + e.message);
        return;
    }

    setPhase('scanning');
    isProcessing = true;
    logs = [];
    document.getElementById('logs-container').innerHTML = ''; // Clear logs UI

    addLog(`Uploaded file: ${file.name}`, 'info');

    try {
        addLog('Starting pipeline...', 'info');

        // Parse File
        const sheetsData = await parseFile(file, (msg, type, att) => addLog(msg, type, att));
        const sheetNames = Object.keys(sheetsData);

        addLog(`Loaded ${sheetNames.length} visible sheets: ${sheetNames.join(', ')}`, 'success');

        const analyses = [];
        setPhase('analyzing');

        for (const sheetName of sheetNames) {
            const rawGrid = sheetsData[sheetName];

            if (!rawGrid || rawGrid.length === 0) {
                addLog(`Skipping empty sheet "${sheetName}"`, 'warning');
                continue;
            }

            const sampledGrid = sampleSheetData(rawGrid, 50);

            try {
                const detectedTables = await analyzeSheetChunk(
                    sheetName,
                    sampledGrid,
                    (msg, type, att) => addLog(msg, type, att)
                );

                if (detectedTables.length === 0) {
                     addLog(`No tables detected in "${sheetName}".`, 'warning');
                }

                analyses.push({
                    sheetName,
                    tables: detectedTables,
                    rawGrid: sampledGrid
                });
            } catch (err) {
                addLog(`Failed to analyze "${sheetName}": ${err.message || err}`, 'error');
            }
        }

        sheetAnalyses = analyses;
        setPhase('review');
        renderSchemaEditor(sheetAnalyses, updateColumn);
        addLog('Pipeline Complete. Waiting for user review.', 'success');

    } catch (error) {
        addLog(`Critical pipeline failure: ${error.message || error}`, 'error');
        setPhase('upload');
    } finally {
        isProcessing = false;
        fileInput.value = ""; // Reset for next time
    }
};

const updateColumn = (sheetIdx, tableIdx, colId, updates) => {
    const table = sheetAnalyses[sheetIdx].tables[tableIdx];
    const colIndex = table.columns.findIndex(c => c.id === colId);
    if (colIndex > -1) {
        table.columns[colIndex] = { ...table.columns[colIndex], ...updates };
        // Re-render isn't strictly necessary for input fields as they maintain their own state via DOM,
        // but if we were doing complex validation visual updates, we might.
        // For now, we assume the input/select stays in sync visually.
    }
};

const handleFinalize = () => {
    setPhase('export');
    addLog('Schema confirmed by user. Exporting ingestion manifest...', 'success', {
      type: 'json',
      data: sheetAnalyses,
      label: 'Final Ingestion Manifest'
    });
    console.log("Final Schema:", JSON.stringify(sheetAnalyses, null, 2));
    alert("Ingestion configuration generated! Check console feed.");
};

// Init
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    fileInput.addEventListener('change', handleFileUpload);
    btnFinalize.addEventListener('click', handleFinalize);
});
