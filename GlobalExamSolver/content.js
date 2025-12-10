// GlobalExam Auto-Answer Bot

let autoMode = false;

function log(msg, data = null) {
    console.log(`[GE-Bot] ${msg}`, data || '');
}

// 1. UI Injection
function createOverlay() {
    if (document.getElementById('ge-bot-overlay')) return;

    const div = document.createElement('div');
    div.id = 'ge-bot-overlay';
    div.style.position = 'fixed';
    div.style.bottom = '20px';
    div.style.right = '20px';
    div.style.zIndex = '9999';
    div.style.backgroundColor = '#1e1e1e';
    div.style.color = '#fff';
    div.style.padding = '10px';
    div.style.borderRadius = '8px';
    div.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
    div.style.fontFamily = 'Arial, sans-serif';
    div.style.fontSize = '12px';

    div.innerHTML = `
    <div style="margin-bottom: 5px; font-weight: bold;">GE Bot v1.2</div>
    <div style="display:flex; gap:5px; margin-bottom:5px;">
        <button id="ge-btn-solve" style="flex:1; cursor:pointer; background:#4CAF50; color:white; border:none; padding:5px; border-radius:4px;">Find Answer</button>
        <button id="ge-btn-auto" style="flex:1; cursor:pointer; background:#555; color:white; border:none; padding:5px; border-radius:4px;">Auto: OFF</button>
    </div>
    <button id="ge-btn-debug" style="width:100%; cursor:pointer; background:#f0ad4e; color:white; border:none; padding:5px; border-radius:4px;">Copy Data to Console</button>
  `;

    document.body.appendChild(div);

    document.getElementById('ge-btn-solve').addEventListener('click', solveCurrentQuestion);
    document.getElementById('ge-btn-auto').addEventListener('click', (e) => {
        autoMode = !autoMode;
        e.target.innerText = `Auto: ${autoMode ? 'ON' : 'OFF'}`;
        e.target.style.background = autoMode ? '#2196F3' : '#555';
        if (autoMode) solveCurrentQuestion();
    });
    document.getElementById('ge-btn-debug').addEventListener('click', () => {
        const data = getInertiaData();
        console.log('GE-Bot Data Dump:', data);

        // Also dump DOM structure of potential containers
        const app = document.getElementById('app');
        if (app) {
            console.log('--- DOM DUMP (App) ---');
            // Truncate to avoid massive spam, but getting class names is key
            const html = app.innerHTML; // .replace(/<path[^>]*>/g, '<path ...>'); 
            console.log(html.substring(0, 10000)); // First 10k chars might contain the active question
            console.log('--- END DOM DUMP ---');
        }

        alert('Data & DOM dumped to console. Check F12.');
    });
}

// 2. Data Extraction
function getInertiaData() {
    // 1. Try history.state (Inertia updates this on navigation, usually freshest)
    if (history.state && history.state.props) {
        console.log('GE-Bot: Retrieved data from history.state');
        return history.state;
    }
    if (history.state && history.state.page) {
        console.log('GE-Bot: Retrieved data from history.state.page');
        return history.state.page;
    }

    // 2. Fallback to DOM attribute
    const app = document.getElementById('app');
    if (!app || !app.dataset.page) return null;
    try {
        return JSON.parse(app.dataset.page);
    } catch (e) {
        log('Error parsing data-page', e);
        return null;
    }
}

// 3. Solver Logic
async function solveCurrentQuestion() {
    const data = getInertiaData();
    if (!data) {
        log('No data found.');
        return;
    }

    // 3.1 explicit correction page handling
    if (data.component === 'activity/pages/correction' || data.url.endsWith('/correction')) {
        log('Correction page detected. Skipping question search and clicking Continue.');
        clickContinue();
        return;
    }

    // Look for questions in props
    let questions = data.props.examQuestions?.data || [];

    if (questions.length === 0) {
        log('Standard examQuestions empty. Attempting Deep Search directly for answers...');

        const deepFindQuestions = (obj, depth = 0) => {
            if (depth > 6) return [];
            if (!obj || typeof obj !== 'object') return [];

            let found = [];
            // If this object looks like a Question 
            if ((Array.isArray(obj.exam_answers) && obj.exam_answers.length > 0) ||
                (Array.isArray(obj.answers) && obj.answers.length > 0)) {
                return [obj];
            }

            if (Array.isArray(obj)) {
                for (const item of obj) found = found.concat(deepFindQuestions(item, depth + 1));
            } else {
                for (const key of Object.keys(obj)) {
                    if (key === 'auth' || key === 'translations' || key === 'route') continue;
                    found = found.concat(deepFindQuestions(obj[key], depth + 1));
                }
            }
            return found;
        };

        const potentialQuestions = deepFindQuestions(data.props);
        if (potentialQuestions.length > 0) {
            log(`Deep Search found ${potentialQuestions.length} potential hidden questions.`);
            questions = potentialQuestions;
        }
    }

    if (questions.length === 0) {
        // SAFETY CHECK: Does the DOM contain inputs?
        // Added input:not(...) to catch standard text inputs key for FILL_IN_THE_BLANK
        const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, .draggable-item');
        if (inputs.length > 0) {
            log('CRITICAL WARNING: No questions found in JSON, BUT input elements detected in DOM. Preventing Auto-Continue to avoid error.');
            log('Visible inputs:', inputs);

            // Highlight inputs to show user
            inputs.forEach(el => el.style.border = '5px solid red');

            // Deep dump to help user debug
            console.log('--- FULL PROPS DUMP ---', data.props);

            // Allow user to see this
            alert('GE-BOT WARNING: Bot stopped to prevent error. Question JSON not found. Please COPY the "--- FULL PROPS DUMP ---" object from console and send it to developer.');
            return;
        }

        log('No questions found in dataset. Checking for part/section end.');
        clickContinue();
        return;
    }

    // Usually there is only one "active" question in the array for the current view
    // or we need to find the one matching the numbering.
    // For simplicity, we process ALL questions found in the data (usually just 1).
    for (const q of questions) {
        log(`Processing question ID=${q.id} Type=${q.exam_question_type_code}`);

        const answers = q.exam_answers || q.answers || [];
        if (!answers.length) {
            log('No answers found for question', q);
            continue;
        }

        // DEBUG: Dump the first answer object fully to understand its structure
        if (answers.length > 0) {
            console.log('--- DEBUG: Full Answer Object Structure ---');
            console.log(JSON.stringify(answers[0], null, 2));
            console.log('-------------------------------------------');
        }

        // Strategy based on Type
        const type = q.exam_question_type_code; // e.g. 'SINGLE_SELECTION', 'SORTING_WORD', 'ASSOCIATION'

        let targets = [];

        if (type === 'SORTING_WORD' || type === 'SORTING' || type === 'ORDERING') {
            // For sorting, the 'answers' array is usually the Correct Order.
            // Or we sort them by 'order' property if it exists.
            log('Detected SORTING question. Clicking answers in order of appearance in JSON.');

            let sortedAnswers = [...answers];
            if (sortedAnswers[0].order !== undefined) {
                sortedAnswers.sort((a, b) => a.order - b.order);
            }
            targets = sortedAnswers;

        } else if (type === 'FILL_BLANK_SELECT' || type === 'FILL_BLANK_DRAG') {
            log('Detected FILL_BLANK_SELECT. Attempting Drag & Drop to ordered slots...');

            // 1. Sort answers by order
            let sortedAnswers = [...answers];
            if (sortedAnswers[0].order !== undefined) {
                sortedAnswers.sort((a, b) => a.order - b.order);
            }

            // 2. Find Drop Zones (The "Holes")
            // Heuristic: Look for elements that might be slots. 
            // Often they have no text, or specific classes.
            // We search for common patterns or elements with data-index.
            let slots = Array.from(document.querySelectorAll('.drop-zone, .dropzone, .droppable, [data-drop-id], .blank-slot'));

            // Fallback: If no explicit class, look for empty "spans" or "divs" inside the text container
            if (slots.length === 0) {
                const textContainer = document.querySelector('.question-text, .text-content, [class*="prose"]'); // common text wrappers
                if (textContainer) {
                    slots = Array.from(textContainer.querySelectorAll('span:empty, div:empty, span[class*="bg-"], span.inline-block'));
                }
            }

            // Filter visible slots only
            slots = slots.filter(s => s.offsetParent !== null); // is visible

            log(`Diagnostics: Found ${slots.length} potential drop-slots.`);
            if (slots.length === 0) {
                log('CRITICAL: No drop-slots found. Dumping text container HTML...');
                const container = document.querySelector('.question-text') || document.body;
                console.log(container.innerHTML.substring(0, 1000));
            }

            // 3. Map Answer -> Slot
            for (let i = 0; i < sortedAnswers.length; i++) {
                const ans = sortedAnswers[i];
                const slot = slots[i]; // Assumption: DOM order matches Logical Order

                if (ans && slot) {
                    log(`Processing Item ${i + 1}: ID=${ans.id} -> Slot ${i + 1}`);
                    const source = await findElementForAnswer(ans);

                    if (source) {
                        await simulateDragAndDrop(source, slot);
                        await new Promise(r => setTimeout(r, 600)); // Wait for animation
                    } else {
                        log(`Source element not found for answer ${ans.id}`);
                    }
                }
            }
            // Skip the standard click loop for these
            continue;

        } else if (type === 'ASSOCIATE' || type === 'MATCHING' || type === 'ASSOCIATE_WORD' || type === 'ASSOCIATION') {
            log('Detected ASSOCIATE/MATCHING question. Pairing by "order"...');

            // Group by order because pairs share the same order ID
            const groups = {};
            answers.forEach(a => {
                if (a.order) {
                    if (!groups[a.order]) groups[a.order] = [];
                    groups[a.order].push(a);
                }
            });

            log(`Diagnostics: Found ${Object.keys(groups).length} groups based on 'order' property.`);

            // Iterate groups
            for (const ord in groups) {
                const pair = groups[ord];
                if (pair.length >= 2) {
                    const [item1, item2] = pair;
                    log(`Processing Pair Order ${ord}: "${item1.name}" <-> "${item2.name}"`);

                    // Find elements
                    const el1 = await findElementForAnswer(item1);
                    const el2 = await findElementForAnswer(item2);

                    if (el1 && el2) {
                        // Strategy: Click both (often works for matching)
                        await clickElement(el1);
                        await new Promise(r => setTimeout(r, 200));
                        await clickElement(el2);

                        // Strategy: Drag 1 to 2
                        await simulateDragAndDrop(el1, el2);

                        // Strategy: Drag 2 to 1 (just in case direction matters)
                        await simulateDragAndDrop(el2, el1);

                        await new Promise(r => setTimeout(r, 800));
                    } else {
                        log('Could not find both elements for pair.', { item1, item2 });
                    }
                }
            }

        } else if (type === 'FILL_IN_THE_BLANK' || type === 'GAP_FILL') {
            log('Detected FILL_IN_THE_BLANK. Typing answers...');
            let correctAnswers = answers.filter(a =>
                a.is_correct === true || a.is_correct === 1 ||
                a.correct === true || a.correct === 1 ||
                a.is_right_answer === true
            );
            if (correctAnswers.length > 0) {
                await fillInputAnswer(correctAnswers[0]);
            } else {
                log('No correct answer text found for fill-in-the-blank.');
            }

        } else {
            // Standard Single/Multiple Selection
            // Find answer(s) with truthy correctness flag
            targets = answers.filter(a =>
                a.is_correct === true || a.is_correct === 1 ||
                a.correct === true || a.correct === 1 ||
                a.right === true || a.is_right === true ||
                a.is_right_answer === true // Found in user dump
            );
        }

        if (targets.length === 0 &&
            type !== 'ASSOCIATE' && type !== 'MATCHING' && type !== 'ASSOCIATE_WORD' && type !== 'ASSOCIATION' &&
            type !== 'FILL_IN_THE_BLANK' && type !== 'GAP_FILL' && type !== 'FILL_BLANK_SELECT' && type !== 'FILL_BLANK_DRAG') {

            log(`CRITICAL: No correct answer targets identified for Q:${q.id} Type=${type}`);
            console.log('--- DEBUG: Question & Answers dump ---');
            console.log('Question:', q);
            console.log('Answers:', answers);
            console.log('--------------------------------------');
            continue;
        }

        log(`Found ${targets.length} targets to click.`);

        // Click Loop
        for (const t of targets) {
            await clickAnswerElement(t);
            // Increased delay to ensure UI registers the click before we move on
            await new Promise(r => setTimeout(r, 800));
        }
    }

    // Final 'Continue' click
    log('Waiting for UI to validate answer before continuing...');
    setTimeout(clickContinue, 2500);
}

// Check helper to separate finding from clicking
async function findElementForAnswer(answerObj) {
    const id = answerObj.id;
    const content = answerObj.content || answerObj.text || answerObj.name || '';

    // Selectors priority
    let el =
        document.querySelector(`input[value="${id}"]`) ||
        document.querySelector(`div[data-id="${id}"]`) ||
        document.querySelector(`button[data-id="${id}"]`) ||
        document.querySelector(`span[data-id="${id}"]`) ||
        document.querySelector(`[data-answer-id="${id}"]`) ||
        document.querySelector(`[data-item-id="${id}"]`) ||
        document.querySelector(`[data-draggable-item-id="${id}"]`);

    if (!el && content) {
        const plainText = content.replace(/<[^>]*>/g, '').trim();
        const lowerText = plainText.toLowerCase();

        // Strategy: Direct Text Match
        if (plainText) {
            // Expand to all feasible clickable elements + generic containers
            const allElements = document.querySelectorAll('div, span, p, label, button, a, h3, h4, li');

            for (const domEl of allElements) {
                // Efficiency check
                if (domEl.innerText.length > 100 || domEl.offsetParent === null) continue;

                const t = domEl.innerText.trim();
                const tLower = t.toLowerCase();

                // 1. Exact Match (High Confidence)
                if (t === plainText) {
                    el = domEl;
                    break;
                }

                // 2. Case-Insensitive Exact Match (Medium Confidence)
                if (tLower === lowerText) {
                    el = domEl;
                    break;
                }

                // 3. Partial Match for short words like "True"/"False" if it's the ONLY text
                // e.g. <button> <span>True</span> </button>
                if ((plainText === 'True' || plainText === 'False') && t.includes(plainText) && t.length < 15) {
                    el = domEl;
                    break;
                }
            }
        }
    }
    return el;
}

// Main interaction helper
// Main interaction helper
async function clickElement(el) {
    if (!el) return;

    // Highlight
    el.style.border = "3px solid #ff00ff";
    el.scrollIntoView({ behavior: "smooth", block: "center" });

    // Allow UI to settle
    await new Promise(r => setTimeout(r, 50));

    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.focus();
        el.click();
        el.dispatchEvent(new Event('change', { bubbles: true }));
        log('Clicked INPUT directly.');
    } else {
        // Calculate center coordinates
        const rect = el.getBoundingClientRect();
        const clientX = rect.left + rect.width / 2;
        const clientY = rect.top + rect.height / 2;

        // Common options with coordinates
        const opts = {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: clientX,
            clientY: clientY,
            screenX: clientX + (window.screenX || 0),
            screenY: clientY + (window.screenY || 0)
        };

        const downOpts = { ...opts, buttons: 1, pressure: 0.5 };
        const upOpts = { ...opts, buttons: 0, pressure: 0 };

        // Real sequence
        el.dispatchEvent(new PointerEvent('pointerover', opts));
        el.dispatchEvent(new MouseEvent('mouseover', opts));
        el.dispatchEvent(new PointerEvent('pointerenter', opts));
        el.dispatchEvent(new MouseEvent('mouseenter', opts));

        // Down
        el.dispatchEvent(new PointerEvent('pointerdown', downOpts));
        el.dispatchEvent(new MouseEvent('mousedown', downOpts));
        el.focus();

        await new Promise(r => setTimeout(r, 20)); // Short hold

        // Up
        el.dispatchEvent(new PointerEvent('pointerup', upOpts));
        el.dispatchEvent(new MouseEvent('mouseup', upOpts));

        // Click
        el.dispatchEvent(new PointerEvent('click', opts));
        el.dispatchEvent(new MouseEvent('click', opts));

        // Fallback: Click closest interactive parent if we targeted a generic container
        if (!['BUTTON', 'A', 'INPUT', 'TEXTAREA'].includes(el.tagName) && !el.classList.contains('draggable-item')) {
            let parent = el.parentElement;
            for (let i = 0; i < 3; i++) { // Try up to 3 levels up
                if (parent) {
                    log(`Bubbling click to parent L${i + 1}: ${parent.tagName}`, parent);

                    const pRect = parent.getBoundingClientRect();
                    const pX = pRect.left + pRect.width / 2;
                    const pY = pRect.top + pRect.height / 2;
                    const pOpts = { ...opts, clientX: pX, clientY: pY };

                    parent.dispatchEvent(new MouseEvent('click', pOpts));
                    if (['BUTTON', 'A'].includes(parent.tagName)) parent.click();

                    parent = parent.parentElement;
                    await new Promise(r => setTimeout(r, 50));
                }
            }
        }
    }
    // Force state update for draggable items (SORTING/ASSOCIATE)
    if (el.classList.contains('draggable-item') || el.closest('.draggable-item')) {
        log('Target is draggable-item, forcing input/change events.');
        const target = el.classList.contains('draggable-item') ? el : el.closest('.draggable-item');
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        target.blur(); // Sometimes blur triggers save
        await new Promise(r => setTimeout(r, 50));
    }
}



// Drag helper
async function simulateDragAndDrop(source, target) {
    if (!source || !target) return;
    log('Simulating Drag & Drop sequence...', { source, target });

    const srcRect = source.getBoundingClientRect();
    const tgtRect = target.getBoundingClientRect();

    const srcX = srcRect.left + srcRect.width / 2;
    const srcY = srcRect.top + srcRect.height / 2;
    const tgtX = tgtRect.left + tgtRect.width / 2;
    const tgtY = tgtRect.top + tgtRect.height / 2;

    const opts = { bubbles: true, cancelable: true, view: window };
    const steps = 10;

    const dataTransfer = new DataTransfer();

    // 1. Grab (Pointer + DragStart)
    source.dispatchEvent(new PointerEvent('pointerover', { ...opts, clientX: srcX, clientY: srcY }));
    source.dispatchEvent(new PointerEvent('pointerdown', { ...opts, clientX: srcX, clientY: srcY }));
    source.dispatchEvent(new MouseEvent('mousedown', { ...opts, clientX: srcX, clientY: srcY }));

    // HTML5 DragStart
    source.dispatchEvent(new DragEvent('dragstart', { ...opts, clientX: srcX, clientY: srcY, dataTransfer }));

    await new Promise(r => setTimeout(r, 50));

    // 2. Drag
    for (let i = 0; i <= steps; i++) {
        const curX = srcX + (tgtX - srcX) * (i / steps);
        const curY = srcY + (tgtY - srcY) * (i / steps);

        document.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: curX, clientY: curY }));

        // HTML5 DragOver
        const dragOverEvent = new DragEvent('dragover', { ...opts, clientX: curX, clientY: curY, dataTransfer });
        if (i > steps - 2) target.dispatchEvent(dragOverEvent);
        else document.body.dispatchEvent(dragOverEvent);

        await new Promise(r => setTimeout(r, 20));
    }

    // 3. Drop (PointerUp + Drop + DragEnd)
    target.dispatchEvent(new PointerEvent('pointerup', { ...opts, clientX: tgtX, clientY: tgtY }));
    target.dispatchEvent(new MouseEvent('mouseup', { ...opts, clientX: tgtX, clientY: tgtY }));

    // HTML5 Drop & DragEnd
    target.dispatchEvent(new DragEvent('drop', { ...opts, clientX: tgtX, clientY: tgtY, dataTransfer }));
    source.dispatchEvent(new DragEvent('dragend', { ...opts, clientX: tgtX, clientY: tgtY, dataTransfer }));

    // Force events to register change
    source.dispatchEvent(new Event('input', { bubbles: true }));
    source.dispatchEvent(new Event('change', { bubbles: true }));
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));

    // Blur to trigger save
    if (source.blur) source.blur();
    if (target.blur) target.blur();

    log('Drag & Drop sequence finished.');
}


// Helper (Backwards compat wrapper)
async function clickAnswerElement(answerObj) {
    const el = await findElementForAnswer(answerObj);
    if (el) {
        log(`Found DOM element for ID=${answerObj.id}`, el);
        await clickElement(el);
    } else {
        log(`DOM Element not found for ID=${answerObj.id}`);
        // Diagnostics
        const allDataIds = Array.from(document.querySelectorAll('[data-id]')).map(e => e.getAttribute('data-id'));
        log(`Diagnostics: Available data-ids: ${allDataIds.join(', ')}`);
    }
}

// Helper to type into inputs
async function fillInputAnswer(answerObj) {
    const text = answerObj.content || answerObj.text || answerObj.name || '';
    if (!text) {
        log('Answer has no text content to type.');
        return;
    }

    // Expanded selector for inputs
    const input = document.querySelector('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), textarea, [contenteditable="true"]');

    if (input) {
        log(`Filling input with text: "${text}"`, input);

        input.style.border = "3px solid #ff00ff";
        input.scrollIntoView({ behavior: "smooth", block: "center" });
        input.focus(); // Important for some frameworks

        // Handle contenteditable vs standard input
        if (input.getAttribute('contenteditable') === 'true') {
            input.innerText = text;
        } else {
            input.value = text;
        }

        // Trigger events
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        // Keyboard simulation for robust listeners
        input.dispatchEvent(new KeyboardEvent('keydown', { key: text[0], bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keypress', { key: text[0], bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key: text[0], bubbles: true }));

    } else {
        log('CRITICAL: No text input field found on page to type answer into.');
        // Debug inputs
        console.log('Available inputs:', document.querySelectorAll('input'));
    }
}

async function clickContinue() {
    log('Looking for Continue/Next button (polling)...');

    const maxRetries = 10; // 5 seconds total (10 * 500ms)
    let attempt = 0;

    const checkAndClick = async () => {
        const btns = Array.from(document.querySelectorAll('button, a'));
        const nextBtn = btns.find(b => {
            const t = b.innerText.toLowerCase();
            const isMatch = (t.includes('continuer') || t.includes('suivant') || t.includes('continue') || t.includes('next') || t.includes('passer') || t.includes('check') || t.includes('finish') || t.includes('validate') || t.includes('terminer') || t.includes('valider'));

            // Debug logs for potential matches being skipped
            if (isMatch && b.offsetParent === null) {
                // log('Skipping hidden continue button:', b);
            }

            return isMatch && b.offsetParent !== null; // visible
        });

        if (nextBtn) {
            log('Found Continue button:', nextBtn);
            await clickElement(nextBtn); // Use robust click
            log('Clicked Continue.');

            if (autoMode) {
                setTimeout(solveCurrentQuestion, 2500);
            }
            return true;
        }
        return false;
    };

    const loop = async () => {
        if (await checkAndClick()) return;

        attempt++;
        if (attempt < maxRetries) {
            log(`Continue button not found, retrying (${attempt}/${maxRetries})...`);
            setTimeout(loop, 500);
        } else {
            log('Continue button not found after multiple retries. Dumping buttons for debug:');
            const btns = Array.from(document.querySelectorAll('button, a'));
            btns.slice(0, 5).forEach(b => log(`Btn: "${b.innerText}"`, b));
        }
    };

    loop();
}

// 5. Init
createOverlay();

const observer = new MutationObserver(() => {
    createOverlay();
});
observer.observe(document.body, { childList: true, subtree: false });
