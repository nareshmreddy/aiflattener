// UI Rendering Logic
import { DataType, SemanticRole } from "./types.js";

export const renderLog = (log) => {
    const container = document.getElementById('logs-container');
    const logItem = document.createElement('div');
    logItem.className = "animate-in fade-in slide-in-from-left-2 duration-300";

    // Icon
    let icon = '';
    let textColor = 'text-slate-300';
    if (log.type === 'success') { icon = 'check-circle-2'; textColor = 'text-green-300'; }
    else if (log.type === 'error') { icon = 'alert-triangle'; textColor = 'text-red-300'; }
    else if (log.type === 'warning') { icon = 'alert-triangle'; textColor = 'text-yellow-400'; }
    else if (log.type === 'ai') { icon = 'terminal'; textColor = 'text-purple-300'; }
    else { icon = 'info'; textColor = 'text-blue-400'; }

    const timestamp = new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' });

    logItem.innerHTML = `
        <div class="flex gap-3">
            <span class="text-slate-600 text-xs mt-0.5 select-none shrink-0">${timestamp}</span>
            <div class="mt-0.5 shrink-0">
                <i data-lucide="${icon}" class="w-4 h-4 ${textColor}"></i>
            </div>
            <div class="flex-1 min-w-0">
                <span class="break-words ${textColor}">${log.message}</span>
                <div class="attachment-container"></div>
            </div>
        </div>
    `;

    const attachmentContainer = logItem.querySelector('.attachment-container');
    if (log.attachment) {
        if (log.attachment.type === 'image') {
            const dataUrl = `data:image/png;base64,${log.attachment.data}`;
            const attEl = document.createElement('div');
            attEl.className = "mt-2 mb-2 p-2 bg-slate-900 rounded border border-slate-800 w-full max-w-md";
            attEl.innerHTML = `
                 <div class="flex justify-between items-center mb-2">
                    <span class="text-xs text-slate-400 flex items-center gap-1">
                      <i data-lucide="image" class="w-3 h-3"></i>
                      ${log.attachment.label || 'Snapshot'}
                    </span>
                    <a href="${dataUrl}" download="snapshot-${Date.now()}.png" class="text-xs bg-slate-800 hover:bg-slate-700 text-blue-400 px-2 py-1 rounded flex items-center gap-1 transition-colors">
                      <i data-lucide="download" class="w-3 h-3"></i> Download
                    </a>
                 </div>
                 <img src="${dataUrl}" alt="Visual Snapshot" class="rounded border border-slate-800 w-full h-auto bg-white">
            `;
            attachmentContainer.appendChild(attEl);
        } else if (log.attachment.type === 'json') {
             const jsonString = JSON.stringify(log.attachment.data, null, 2);
             const attEl = document.createElement('div');
             attEl.className = "mt-2";

             const btn = document.createElement('button');
             btn.className = "flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors mb-1 font-mono";
             btn.innerHTML = `<i data-lucide="chevron-right" class="w-3 h-3"></i> <i data-lucide="file-json" class="w-3 h-3"></i> ${log.attachment.label || 'Raw JSON Data'}`;

             const preContainer = document.createElement('div');
             preContainer.className = "bg-slate-900 p-3 rounded border border-slate-800 overflow-x-auto max-h-96 custom-scrollbar hidden";
             preContainer.innerHTML = `<pre class="text-[10px] text-green-300 font-mono leading-relaxed">${jsonString}</pre>`;

             btn.onclick = () => {
                 preContainer.classList.toggle('hidden');
                 const icon = btn.querySelector('i[data-lucide="chevron-right"]') || btn.querySelector('i[data-lucide="chevron-down"]');
                 if(preContainer.classList.contains('hidden')) {
                     icon.setAttribute('data-lucide', 'chevron-right');
                 } else {
                     icon.setAttribute('data-lucide', 'chevron-down');
                 }
                 lucide.createIcons({ root: btn });
             };

             attEl.appendChild(btn);
             attEl.appendChild(preContainer);
             attachmentContainer.appendChild(attEl);
        }
    }

    container.appendChild(logItem);
    container.scrollTop = container.scrollHeight;

    // Refresh icons
    lucide.createIcons({ root: logItem });
};

const ConfidenceBadge = (score) => {
  let color = 'bg-red-500/20 text-red-300 border-red-500/30';
  if (score >= 0.9) color = 'bg-green-500/20 text-green-300 border-green-500/30';
  else if (score >= 0.7) color = 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';

  return `
    <div class="px-2 py-0.5 rounded text-[10px] font-mono border ${color} inline-flex items-center gap-1">
       ${Math.round(score * 100)}%
       ${score < 0.7 ? '<i data-lucide="alert-circle" class="w-3 h-3"></i>' : ''}
    </div>
  `;
};

export const renderSchemaEditor = (sheetAnalyses, onUpdateColumn) => {
    const container = document.getElementById('schema-editor-container');
    container.innerHTML = '';

    sheetAnalyses.forEach((sheet, sheetIdx) => {
        const sheetSection = document.createElement('div');
        sheetSection.className = "space-y-4";

        const header = document.createElement('h2');
        header.className = "text-xl font-bold text-white flex items-center gap-2";
        header.innerHTML = `<i data-lucide="database" class="w-5 h-5 text-blue-400"></i> Sheet: <span class="text-blue-200 font-mono">${sheet.sheetName}</span>`;
        sheetSection.appendChild(header);

        if (sheet.tables.length === 0) {
            const empty = document.createElement('div');
            empty.className = "p-4 border border-slate-800 rounded-lg bg-slate-900/50 text-slate-500 italic";
            empty.innerText = "No structured tables detected in this sheet.";
            sheetSection.appendChild(empty);
        } else {
            sheet.tables.forEach((table, tableIdx) => {
                const tableCard = document.createElement('div');
                tableCard.className = "border border-slate-700 rounded-lg bg-slate-900 overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300";

                const tableHeader = document.createElement('div');
                tableHeader.className = "bg-slate-800/50 px-4 py-3 border-b border-slate-700 flex justify-between items-center";
                tableHeader.innerHTML = `
                  <div class="flex items-center gap-3">
                    <i data-lucide="table" class="w-4 h-4 text-purple-400"></i>
                    <h3 class="font-semibold text-slate-200">
                      ${table.name}
                      <span class="ml-2 text-xs font-normal text-slate-500 font-mono">
                        (Rows ${table.startRow + 1}-${table.endRow + 1})
                      </span>
                    </h3>
                  </div>
                  ${ConfidenceBadge(table.confidence)}
                `;
                tableCard.appendChild(tableHeader);

                const tableContent = document.createElement('div');
                tableContent.className = "overflow-x-auto";

                const tableEl = document.createElement('table');
                tableEl.className = "w-full text-left text-sm";
                tableEl.innerHTML = `
                    <thead class="bg-slate-950 text-slate-400 font-medium">
                      <tr>
                        <th class="px-4 py-3 font-normal">Original Header</th>
                        <th class="px-4 py-3 font-normal">Mapped Name</th>
                        <th class="px-4 py-3 font-normal">Data Type</th>
                        <th class="px-4 py-3 font-normal">Semantic Role</th>
                        <th class="px-4 py-3 font-normal">Confidence</th>
                        <th class="px-4 py-3 font-normal">Reasoning</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-800"></tbody>
                `;

                const tbody = tableEl.querySelector('tbody');
                table.columns.forEach(col => {
                    const tr = document.createElement('tr');
                    tr.className = "hover:bg-slate-800/30 transition-colors group";

                    // Cells
                    tr.innerHTML = `
                        <td class="px-4 py-3 text-slate-300 font-mono text-xs">${col.originalName || '<span class="italic opacity-50">Untitled</span>'}</td>
                        <td class="px-4 py-2">
                             <input type="text" data-field="suggestedName" value="${col.suggestedName}" class="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:border-blue-500 focus:outline-none w-full font-mono text-xs" />
                        </td>
                        <td class="px-4 py-2">
                            <select data-field="dataType" class="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:border-blue-500 focus:outline-none text-xs">
                                ${Object.values(DataType).map(t => `<option value="${t}" ${t === col.dataType ? 'selected' : ''}>${t}</option>`).join('')}
                            </select>
                        </td>
                        <td class="px-4 py-2">
                            <select data-field="semanticRole" class="bg-slate-950 border border-slate-700 rounded px-2 py-1 focus:border-blue-500 focus:outline-none text-xs font-medium ${
                                col.semanticRole === SemanticRole.METRIC ? 'text-emerald-400' :
                                col.semanticRole === SemanticRole.DIMENSION ? 'text-blue-400' :
                                col.semanticRole === SemanticRole.ENTITY ? 'text-purple-400' : ''
                            }">
                                ${Object.values(SemanticRole).map(r => `<option value="${r}" ${r === col.semanticRole ? 'selected' : ''}>${r}</option>`).join('')}
                            </select>
                        </td>
                        <td class="px-4 py-3">${ConfidenceBadge(col.confidence)}</td>
                        <td class="px-4 py-3 text-xs text-slate-500 max-w-xs truncate" title="${col.reasoning}">${col.reasoning}</td>
                    `;

                    // Event Listeners for inputs
                    tr.querySelector('input[data-field="suggestedName"]').onchange = (e) => {
                        onUpdateColumn(sheetIdx, tableIdx, col.id, { suggestedName: e.target.value });
                    };
                    tr.querySelector('select[data-field="dataType"]').onchange = (e) => {
                        onUpdateColumn(sheetIdx, tableIdx, col.id, { dataType: e.target.value });
                    };
                    tr.querySelector('select[data-field="semanticRole"]').onchange = (e) => {
                        onUpdateColumn(sheetIdx, tableIdx, col.id, { semanticRole: e.target.value });
                        // Update color class dynamically
                        const sel = e.target;
                        sel.className = `bg-slate-950 border border-slate-700 rounded px-2 py-1 focus:border-blue-500 focus:outline-none text-xs font-medium
                                ${sel.value === SemanticRole.METRIC ? 'text-emerald-400' : ''}
                                ${sel.value === SemanticRole.DIMENSION ? 'text-blue-400' : ''}
                                ${sel.value === SemanticRole.ENTITY ? 'text-purple-400' : ''}`;
                    };

                    tbody.appendChild(tr);
                });

                tableContent.appendChild(tableEl);
                tableCard.appendChild(tableContent);
                sheetSection.appendChild(tableCard);
            });
        }

        container.appendChild(sheetSection);
        lucide.createIcons({ root: sheetSection });
    });
};
