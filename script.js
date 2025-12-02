document.addEventListener('DOMContentLoaded', () => {
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    const runBtn = document.getElementById('runBtn');
    const stepList = document.getElementById('stepList');
    const dataTable = document.getElementById('dataTable');
    const dataTabBtn = document.getElementById('dataTabBtn');
    const tabs = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    let selectedFile = null;

    // Tabs Logic
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.disabled) return;

            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            const targetId = tab.dataset.tab;
            document.getElementById(targetId).classList.add('active');
        });
    });

    // File Upload Logic
    uploadZone.addEventListener('click', () => fileInput.click());

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFileSelect(e.target.files[0]);
        }
    });

    function handleFileSelect(file) {
        selectedFile = file;
        const uploadContent = uploadZone.querySelector('.upload-content');
        uploadContent.innerHTML = `<span class="icon">📄</span><p>${file.name}</p>`;
        runBtn.disabled = false;

        // Reset UI
        stepList.innerHTML = '';
        document.querySelector('.placeholder-text').style.display = 'block';
        dataTabBtn.disabled = true;
        dataTable.querySelector('thead').innerHTML = '';
        dataTable.querySelector('tbody').innerHTML = '';
    }

    // Run Agent
    runBtn.addEventListener('click', async () => {
        if (!selectedFile) return;

        runBtn.disabled = true;
        runBtn.textContent = 'Processing...';
        document.querySelector('.placeholder-text').style.display = 'none';
        stepList.innerHTML = ''; // Clear previous steps

        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('instructions', document.getElementById('instructions').value);

        try {
            const response = await fetch('/analyze', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.error) {
                addStep('Error', result.error, 'error');
            } else {
                // Render Steps
                result.steps.forEach(step => {
                    addStep(step.step, step.details, step.status);
                });

                // Render Data if available
                if (result.data) {
                    renderTable(result.data);
                    dataTabBtn.disabled = false;
                    addStep('Complete', 'Data flattened successfully. Switch to Data tab to view.', 'success');
                } else {
                    addStep('Complete', 'No data found to flatten.', 'warning');
                }
            }

        } catch (err) {
            addStep('System Error', err.message, 'error');
        } finally {
            runBtn.disabled = false;
            runBtn.textContent = 'Run Agent';
        }
    });

    function addStep(title, details, status) {
        const li = document.createElement('li');
        li.className = `step-item ${status}`;
        li.innerHTML = `
            <div class="step-marker"></div>
            <div class="step-content">
                <h4>${title}</h4>
                <p>${details}</p>
            </div>
        `;
        stepList.appendChild(li);
    }

    function renderTable(dataObj) {
        // dataObj matches pandas orient='split' : {columns: [], data: [[]], index: []}
        const thead = dataTable.querySelector('thead');
        const tbody = dataTable.querySelector('tbody');

        // Headers
        let headerHtml = '<tr>';
        // Add index column header? Maybe just data columns
        dataObj.columns.forEach(col => {
            headerHtml += `<th>${col}</th>`;
        });
        headerHtml += '</tr>';
        thead.innerHTML = headerHtml;

        // Body
        // Limit to 100 rows for performance in preview
        const maxRows = 100;
        const rowsToShow = dataObj.data.slice(0, maxRows);

        let bodyHtml = '';
        rowsToShow.forEach(row => {
            bodyHtml += '<tr>';
            row.forEach(cell => {
                bodyHtml += `<td>${cell}</td>`;
            });
            bodyHtml += '</tr>';
        });

        if (dataObj.data.length > maxRows) {
            bodyHtml += `<tr><td colspan="${dataObj.columns.length}" style="text-align:center; color:#777;">... and ${dataObj.data.length - maxRows} more rows ...</td></tr>`;
        }

        tbody.innerHTML = bodyHtml;
    }
});
