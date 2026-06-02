// Runs in MAIN world — has direct access to Vue/Inertia globals.
// Communicates with content.js (ISOLATED world) via window.postMessage.

(function () {
    function readPageData() {
        try {
            const app = document.getElementById('app');
            let data = null;

            // Vue 2 / Inertia v1
            if (app && app.__vue__) {
                data = app.__vue__.$page || app.__vue__.page || null;
            }

            // Vue 3 / Inertia v1+
            if (!data && app && app.__vueApp__) {
                const gp = app.__vueApp__.config && app.__vueApp__.config.globalProperties;
                if (gp && gp.$page) data = gp.$page;
            }

            // Inertia global object (various versions)
            if (!data && window.Inertia && window.Inertia.page) data = window.Inertia.page;
            if (!data && window.inertia && window.inertia.page) data = window.inertia.page;

            // Last resort: Inertia bootstrap attribute (first load only)
            if (!data && app && app.dataset.page) {
                try { data = JSON.parse(app.dataset.page); } catch (_) {}
            }

            return data;
        } catch (e) {
            return null;
        }
    }

    function broadcast() {
        const data = readPageData();
        if (data) {
            window.postMessage({ type: 'GE_DATA_RESPONSE', data }, '*');
            return true;
        }
        return false;
    }

    function broadcastWithRetry(maxAttempts = 12, interval = 300) {
        let attempt = 0;
        const tryOnce = () => {
            if (broadcast()) return;
            if (++attempt < maxAttempts) setTimeout(tryOnce, interval);
        };
        setTimeout(tryOnce, 200);
    }

    function broadcastNav() {
        window.postMessage({ type: 'GE_NAV_EVENT' }, '*');
        broadcastWithRetry();
    }

    // Fire a real isTrusted-like click from MAIN world using elementFromPoint
    function fireClickAt(x, y) {
        const el = document.elementFromPoint(x, y);
        if (!el) return;
        const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
        el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
        el.dispatchEvent(new MouseEvent('mousedown', { ...opts, buttons: 1 }));
        el.dispatchEvent(new PointerEvent('pointerup',  { ...opts, buttons: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
        el.dispatchEvent(new MouseEvent('mouseup',  opts));
        el.dispatchEvent(new MouseEvent('click',    opts));
        el.click();
    }

    // Answer on-demand requests from content.js
    window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'GE_DATA_REQUEST') {
            if (!broadcast()) broadcastWithRetry(6, 250);
        }
        if (e.data && e.data.type === 'GE_CLICK') fireClickAt(e.data.x, e.data.y);
        if (e.data && e.data.type === 'GE_POINTER_DROP') {
            const { srcX, srcY, tgtX, tgtY } = e.data;
            const p = (extra) => ({ bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, ...extra });
            const src = document.elementFromPoint(srcX, srcY);
            const tgt = document.elementFromPoint(tgtX, tgtY);
            if (src) src.dispatchEvent(new PointerEvent('pointerdown', p({ clientX: srcX, clientY: srcY, buttons: 1 })));
            document.dispatchEvent(new PointerEvent('pointermove', p({ clientX: tgtX, clientY: tgtY, buttons: 1 })));
            if (tgt) {
                tgt.dispatchEvent(new PointerEvent('pointerenter', p({ clientX: tgtX, clientY: tgtY, buttons: 1 })));
                tgt.dispatchEvent(new PointerEvent('pointerover',  p({ clientX: tgtX, clientY: tgtY, buttons: 1 })));
                tgt.dispatchEvent(new PointerEvent('pointerup',    p({ clientX: tgtX, clientY: tgtY })));
                tgt.dispatchEvent(new MouseEvent('mouseup',  { bubbles: true, clientX: tgtX, clientY: tgtY }));
                tgt.dispatchEvent(new MouseEvent('click',    { bubbles: true, clientX: tgtX, clientY: tgtY }));
            }
        }
    });

    // Hook history navigation (Inertia uses pushState/replaceState)
    const _push = history.pushState.bind(history);
    history.pushState = function (...args) {
        _push(...args);
        broadcastNav();
    };
    const _replace = history.replaceState.bind(history);
    history.replaceState = function (...args) {
        _replace(...args);
        broadcastWithRetry(6, 250);
    };

    // Inertia v1 fires this DOM event on navigate
    document.addEventListener('inertia:navigate', broadcastNav);
    document.addEventListener('inertia:finish', () => broadcastWithRetry(8, 300));

    // Initial broadcast
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => broadcastWithRetry(8, 400));
    } else {
        broadcastWithRetry(8, 400);
    }
})();
