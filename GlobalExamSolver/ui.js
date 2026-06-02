// UI — overlay injection and initialization

function createOverlay() {
    if (document.getElementById('ge-bot-overlay')) return;

    const div = document.createElement('div');
    div.id = 'ge-bot-overlay';
    Object.assign(div.style, {
        position: 'fixed', bottom: '20px', right: '20px', zIndex: '9999',
        backgroundColor: '#1e1e1e', color: '#fff', padding: '8px',
        borderRadius: '6px', boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
        fontFamily: 'Arial, sans-serif', fontSize: '11px', maxWidth: '150px'
    });

    div.innerHTML = `<div style="font-weight:bold;font-size:10px;margin-bottom:4px;text-align:center;">GE-Bot v0.1.0</div>`;

    // Copy Data button
    const infoBtn = document.createElement('button');
    infoBtn.textContent = 'Copy Data';
    Object.assign(infoBtn.style, {
        padding: '3px', backgroundColor: '#FFC107', color: '#333',
        border: 'none', borderRadius: '3px', cursor: 'pointer',
        fontSize: '10px', fontWeight: 'bold', marginBottom: '4px', width: '100%'
    });
    infoBtn.onclick = async () => {
        const data = await getInertiaData();
        console.log('--- FULL DATA DUMP (Sanitized) ---');
        console.log(JSON.stringify(sanitizeData(data ? data.props : {}), null, 2));
        alert('Data dump in Console (F12). PII removed.');
    };
    div.appendChild(infoBtn);

    // Find + Auto buttons
    const findBtn = document.createElement('button');
    findBtn.id = 'ge-btn-solve';
    findBtn.innerHTML = 'Find';
    Object.assign(findBtn.style, {
        height: '24px', padding: '2px', backgroundColor: '#4CAF50', color: 'white',
        border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', flex: '1'
    });

    const autoBtn = document.createElement('button');
    autoBtn.id = 'ge-btn-auto';
    autoBtn.textContent = 'Auto: OFF';
    Object.assign(autoBtn.style, {
        padding: '2px', backgroundColor: '#555', color: 'white',
        border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px', flex: '1'
    });

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:3px;';
    row.appendChild(findBtn);
    row.appendChild(autoBtn);
    div.appendChild(row);

    document.body.appendChild(div);

    findBtn.addEventListener('click', solveCurrentQuestion);
    autoBtn.addEventListener('click', (e) => {
        autoMode = !autoMode;
        e.target.innerText = `Auto: ${autoMode ? 'ON' : 'OFF'}`;
        e.target.style.background = autoMode ? '#2196F3' : '#555';
        if (autoMode) solveCurrentQuestion();
    });
}

// Init
createOverlay();

const _observer = new MutationObserver(() => createOverlay());
_observer.observe(document.body, { childList: true, subtree: false });
