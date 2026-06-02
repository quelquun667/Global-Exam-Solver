// DOM interaction helpers — inspired by Projet Voltaire Solver
// Strategy: broad DOM selectors + UI button filtering + fuzzy text matching

const UI_BUTTON_PHRASES = [
    'valider', 'continuer', 'continue', 'passer', 'suivant', 'next', 'submit',
    'finish', 'terminer', 'check', 'commencer', 'start', 'access',
    'quitter', 'fermer', 'precedent', 'previous', 'retour', 'back',
    'vos reponses', 'correction', 'explication', 'voir le transcript', 'zoomer',
    'copy data', 'find', 'auto: on', 'auto: off'
];

function isVisibleEl(el) {
    if (!el || el.offsetParent === null) return false;
    if (el.disabled) return false;
    return true;
}

function stripDiacritics(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function isUIButton(el) {
    if (!el) return false;
    // Bot's own overlay
    if (el.closest && el.closest('#ge-bot-overlay')) return true;
    const rawText = (el.innerText || '').trim();
    if (!rawText) return false;
    const text = stripDiacritics(rawText.toLowerCase());
    return UI_BUTTON_PHRASES.some(p => text === p || text.startsWith(p + ' ') || text.endsWith(' ' + p));
}

function normalizeText(s) {
    return (s || '')
        .replace(/<[^>]*>/g, '')
        .replace(/[‘’‚‛]/g, "'")
        .replace(/[“”„‟]/g, '"')
        .replace(/ /g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

async function findElementForAnswer(answerObj) {
    const id = answerObj.id;
    const questionId = answerObj.exam_question_id || null;
    const rawText = answerObj.content || answerObj.text || answerObj.name || '';
    const target = normalizeText(rawText);

    // === Phase 1: Direct ID/attribute selectors (fast path) ===
    const idSelectors = [
        questionId && `input[id="radio-${questionId}-${id}"]`,
        questionId && `input[name="${questionId}"][value="${id}"]`,
        `input[value="${id}"]`,
        `[data-id="${id}"]`,
        `[data-answer-id="${id}"]`,
        `[data-item-id="${id}"]`,
        `[data-draggable-item-id="${id}"]`,
        `[data-value="${id}"]`,
        `option[value="${id}"]`
    ].filter(Boolean);

    for (const sel of idSelectors) {
        const found = document.querySelector(sel);
        if (found && isVisibleEl(found)) return found;
    }

    // === Phase 2: Text-based matching (Projet Voltaire style) ===
    if (!target) return null;

    const candidates = Array.from(document.querySelectorAll(
        'button, [role="button"], [role="radio"], [role="option"], [role="checkbox"], ' +
        '[tabindex="0"], label, .draggable-item, [draggable="true"], ' +
        'li, td, th, ' +
        '[class*="option"], [class*="answer"], [class*="choice"], ' +
        'p, span, div'
    )).filter(el => {
        if (!isVisibleEl(el)) return false;
        if (isUIButton(el)) return false;
        const text = el.innerText || '';
        if (text.length > 400) return false;  // skip page wrappers
        return true;
    });

    // 2a. Exact match (best)
    for (const el of candidates) {
        if (normalizeText(el.innerText) === target) return el;
    }

    // 2b. Element text contains target (small leaf element with target text)
    if (target.length > 3) {
        for (const el of candidates) {
            const t = normalizeText(el.innerText);
            if (t && t.includes(target) && el.children.length <= 5) return el;
        }
    }

    // 2c. Target contains element text (label is short, target is longer)
    if (target.length > 10) {
        for (const el of candidates) {
            const t = normalizeText(el.innerText);
            if (t && t.length > 3 && target.includes(t)) return el;
        }
    }

    return null;
}

async function clickElement(el) {
    if (!el) return;

    try {
        el.style.border = '3px solid #ff00ff';
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {}

    await new Promise(r => setTimeout(r, 50));

    if (el.tagName === 'OPTION') {
        const select = el.closest('select');
        if (select) {
            log(`Target is OPTION inside SELECT, setting value="${el.value}".`);
            select.value = el.value;
            select.dispatchEvent(new Event('input',  { bubbles: true }));
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return;
    }

    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        log('Target is INPUT, executing direct click/focus sequence.');
        el.focus();
        el.click();
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        if ((el.type === 'radio' || el.type === 'checkbox') && el.offsetParent === null && el.id) {
            const label = document.querySelector(`label[for="${el.id}"]`);
            if (label) { label.click(); }
            else if (el.parentElement && el.parentElement.tagName === 'LABEL') { el.parentElement.click(); }
        }
        return;
    }

    const rect = el.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    const opts = { bubbles: true, cancelable: true, view: window, clientX, clientY };
    const downOpts = { ...opts, buttons: 1, pressure: 0.5 };
    const upOpts   = { ...opts, buttons: 0, pressure: 0 };

    el.dispatchEvent(new PointerEvent('pointerover',  opts));
    el.dispatchEvent(new MouseEvent('mouseover',      opts));
    el.dispatchEvent(new PointerEvent('pointerenter', opts));
    el.dispatchEvent(new MouseEvent('mouseenter',     opts));
    el.dispatchEvent(new PointerEvent('pointerdown',  downOpts));
    el.dispatchEvent(new MouseEvent('mousedown',      downOpts));
    el.focus();

    await new Promise(r => setTimeout(r, 20));

    el.dispatchEvent(new PointerEvent('pointerup', upOpts));
    el.dispatchEvent(new MouseEvent('mouseup',     upOpts));
    el.dispatchEvent(new MouseEvent('click',       opts));

    // Also fire from MAIN world (isTrusted-like)
    window.postMessage({ type: 'GE_CLICK', x: clientX, y: clientY }, '*');
    try { el.click(); } catch (_) {}

    // Bubble to interactive parents for generic containers
    if (!['BUTTON', 'A', 'INPUT', 'TEXTAREA'].includes(el.tagName) && !el.classList.contains('draggable-item')) {
        let parent = el.parentElement;
        for (let i = 0; i < 3; i++) {
            if (parent) {
                const pr = parent.getBoundingClientRect();
                const px = pr.left + pr.width / 2;
                const py = pr.top + pr.height / 2;
                parent.dispatchEvent(new MouseEvent('click', { ...opts, clientX: px, clientY: py }));
                if (['BUTTON', 'A'].includes(parent.tagName)) parent.click();
                parent = parent.parentElement;
                await new Promise(r => setTimeout(r, 50));
            }
        }
    }

    // Force state for draggable items
    if (el.classList.contains('draggable-item') || el.closest('.draggable-item')) {
        const target = el.classList.contains('draggable-item') ? el : el.closest('.draggable-item');
        target.dispatchEvent(new Event('input',  { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        target.blur();
        await new Promise(r => setTimeout(r, 50));
    }
}

// Pointer drag — dispatches on document (no setPointerCapture so drop-zone gets pointerenter)
async function simulatePointerDrag(source, target) {
    if (!source || !target) return;
    log('Simulating Pointer drag...', { source, target });

    const srcRect = source.getBoundingClientRect();
    const tgtRect = target.getBoundingClientRect();
    const srcX = srcRect.left + srcRect.width / 2;
    const srcY = srcRect.top + srcRect.height / 2;
    const tgtX = tgtRect.left + tgtRect.width / 2;
    const tgtY = tgtRect.top + tgtRect.height / 2;

    const p = (extra) => ({ bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, ...extra });
    const steps = 15;

    source.dispatchEvent(new PointerEvent('pointerover',  p({ clientX: srcX, clientY: srcY })));
    source.dispatchEvent(new PointerEvent('pointerenter', p({ clientX: srcX, clientY: srcY })));
    source.dispatchEvent(new PointerEvent('pointerdown',  p({ clientX: srcX, clientY: srcY, buttons: 1, pressure: 0.5 })));
    source.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: srcX, clientY: srcY, buttons: 1 }));
    await new Promise(r => setTimeout(r, 60));

    for (let i = 1; i <= steps; i++) {
        const x = srcX + (tgtX - srcX) * (i / steps);
        const y = srcY + (tgtY - srcY) * (i / steps);
        const moveEvt = p({ clientX: x, clientY: y, buttons: 1, pressure: 0.5 });
        document.dispatchEvent(new PointerEvent('pointermove', moveEvt));
        window.dispatchEvent(new PointerEvent('pointermove', moveEvt));
        if (i === steps - 2) {
            target.dispatchEvent(new PointerEvent('pointerover',  p({ clientX: x, clientY: y, buttons: 1 })));
            target.dispatchEvent(new PointerEvent('pointerenter', p({ clientX: x, clientY: y, buttons: 1 })));
        }
        await new Promise(r => setTimeout(r, 16));
    }

    target.dispatchEvent(new PointerEvent('pointerover',  p({ clientX: tgtX, clientY: tgtY, buttons: 1 })));
    target.dispatchEvent(new PointerEvent('pointerenter', p({ clientX: tgtX, clientY: tgtY, buttons: 1 })));
    await new Promise(r => setTimeout(r, 30));

    target.dispatchEvent(new PointerEvent('pointerup', p({ clientX: tgtX, clientY: tgtY, buttons: 0 })));
    document.dispatchEvent(new PointerEvent('pointerup', p({ clientX: tgtX, clientY: tgtY, buttons: 0 })));
    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: tgtX, clientY: tgtY }));
    target.dispatchEvent(new MouseEvent('click',   { bubbles: true, clientX: tgtX, clientY: tgtY }));

    window.postMessage({ type: 'GE_POINTER_DROP', srcX, srcY, tgtX, tgtY }, '*');
    log('Pointer drag finished.');
}

// HTML5 DragEvent drag — for native drag implementations
async function simulateDragAndDrop(source, target) {
    if (!source || !target) return;
    log('Simulating HTML5 drag...', { source, target });

    const srcRect = source.getBoundingClientRect();
    const tgtRect = target.getBoundingClientRect();
    const srcX = srcRect.left + srcRect.width / 2;
    const srcY = srcRect.top + srcRect.height / 2;
    const tgtX = tgtRect.left + tgtRect.width / 2;
    const tgtY = tgtRect.top + tgtRect.height / 2;

    const opts = { bubbles: true, cancelable: true, view: window };
    const dataTransfer = new DataTransfer();

    source.dispatchEvent(new PointerEvent('pointerover', { ...opts, clientX: srcX, clientY: srcY }));
    source.dispatchEvent(new PointerEvent('pointerdown', { ...opts, clientX: srcX, clientY: srcY }));
    source.dispatchEvent(new MouseEvent('mousedown',     { ...opts, clientX: srcX, clientY: srcY }));
    source.dispatchEvent(new DragEvent('dragstart',      { ...opts, clientX: srcX, clientY: srcY, dataTransfer }));
    await new Promise(r => setTimeout(r, 50));

    const steps = 10;
    for (let i = 0; i <= steps; i++) {
        const curX = srcX + (tgtX - srcX) * (i / steps);
        const curY = srcY + (tgtY - srcY) * (i / steps);
        document.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: curX, clientY: curY }));
        const dragOver = new DragEvent('dragover', { ...opts, clientX: curX, clientY: curY, dataTransfer });
        (i > steps - 2 ? target : document.body).dispatchEvent(dragOver);
        await new Promise(r => setTimeout(r, 20));
    }

    target.dispatchEvent(new PointerEvent('pointerup', { ...opts, clientX: tgtX, clientY: tgtY }));
    target.dispatchEvent(new MouseEvent('mouseup',     { ...opts, clientX: tgtX, clientY: tgtY }));
    target.dispatchEvent(new DragEvent('drop',         { ...opts, clientX: tgtX, clientY: tgtY, dataTransfer }));
    source.dispatchEvent(new DragEvent('dragend',      { ...opts, clientX: tgtX, clientY: tgtY, dataTransfer }));

    const isFormEl = (el) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
    if (isFormEl(source)) source.dispatchEvent(new Event('input',  { bubbles: true }));
    if (isFormEl(source)) source.dispatchEvent(new Event('change', { bubbles: true }));
    if (isFormEl(target)) target.dispatchEvent(new Event('input',  { bubbles: true }));
    if (isFormEl(target)) target.dispatchEvent(new Event('change', { bubbles: true }));

    if (source.blur) source.blur();
    if (target.blur) target.blur();

    log('HTML5 drag finished.');
}

async function clickAnswerElement(answerObj) {
    const el = await findElementForAnswer(answerObj);
    if (el) {
        log(`Found DOM element for ID=${answerObj.id} (${el.tagName})`);
        await clickElement(el);
        return true;
    }
    log(`DOM Element not found for ID=${answerObj.id} text="${(answerObj.name || answerObj.content || '').substring(0, 40)}"`);
    return false;
}

async function fillInputAnswer(answerObj, targetInput = null) {
    const text = answerObj.content || answerObj.text || answerObj.name || '';
    if (!text) { log('Answer has no text content to type.'); return; }

    const input = targetInput || document.querySelector(
        'input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), textarea, [contenteditable="true"]'
    );

    if (input) {
        log(`Filling input with text: "${text}"`, input);
        input.style.border = '3px solid #ff00ff';
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        input.focus();

        if (input.getAttribute('contenteditable') === 'true') {
            input.innerText = text;
        } else {
            input.value = text;
        }

        input.dispatchEvent(new Event('input',  { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: text[0], bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keypress', { key: text[0], bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup',   { key: text[0], bubbles: true }));
    } else {
        log('CRITICAL: No text input field found on page.');
    }
}
