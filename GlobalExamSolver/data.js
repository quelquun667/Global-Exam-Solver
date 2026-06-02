// Data bridge — communicates with main-world.js to get fresh Inertia/Vue page data

let latestInertiaData = null;
let navigationPending = false;

function sanitizeData(data) {
    if (!data) return null;
    try {
        const clean = JSON.parse(JSON.stringify(data));
        if (clean.props) {
            delete clean.props.auth;
            delete clean.props.user;
            delete clean.props.identity;
            delete clean.props.billing;
            if (clean.props.errors) clean.props.errors = {};
        }
        if (clean.auth) delete clean.auth;
        if (clean.user) delete clean.user;
        return clean;
    } catch (e) {
        return data;
    }
}

window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data && event.data.type === 'GE_DATA_RESPONSE') {
        latestInertiaData = event.data.data;
        navigationPending = false;
    }
    if (event.data && event.data.type === 'GE_NAV_EVENT') {
        latestInertiaData = null;
        navigationPending = true;
        log('Navigation detected — cache cleared.');
    }
});

function RequestFreshData() {
    window.postMessage({ type: 'GE_DATA_REQUEST' }, '*');
}

function waitForFreshData(timeout = 3000) {
    return new Promise((resolve) => {
        if (latestInertiaData) { resolve(latestInertiaData); return; }
        RequestFreshData();
        const start = Date.now();
        const interval = setInterval(() => {
            if (latestInertiaData) {
                clearInterval(interval);
                resolve(latestInertiaData);
            } else if (Date.now() - start >= timeout) {
                clearInterval(interval);
                resolve(null);
            } else {
                RequestFreshData();
            }
        }, 200);
    });
}

async function getInertiaData() {
    const mainWorldData = await waitForFreshData(navigationPending ? 4000 : 2000);
    if (mainWorldData) return mainWorldData;

    if (history.state && (history.state.props || history.state.page)) {
        return history.state.props ? history.state : history.state.page;
    }

    const app = document.getElementById('app');
    if (!app || !app.dataset.page) return null;
    try {
        return JSON.parse(app.dataset.page);
    } catch (e) { return null; }
}
