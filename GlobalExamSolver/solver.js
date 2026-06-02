// Solver — question resolution logic and navigation

let _lastQuestionId = null;
let _sameQuestionCount = 0;
let _noJsonRetryCount = 0;

async function solveCurrentQuestion() {
    const data = await getInertiaData();
    if (!data) {
        log('No data found.');
        if (autoMode) setTimeout(solveCurrentQuestion, 1500);
        return;
    }

    // Check for correction/review page FIRST — before processing question data
    // (question JSON is still present on correction pages, so we must check UI before deep search)
    const isReviewPage = () => Array.from(document.querySelectorAll('button, [role="tab"], a'))
        .filter(el => el.offsetParent !== null)
        .some(el => {
            const t = el.innerText.toLowerCase().trim();
            return t === 'correction' || t === 'vos réponses' || t === 'explication';
        });

    if (isReviewPage()) {
        log('Correction/review page detected early. Clicking Continue.');
        _noJsonRetryCount = 0;
        clickContinue();
        return;
    }

    let questions = data.props.examQuestions?.data || [];

    if (questions.length === 0) {
        log('Standard examQuestions empty. Attempting Deep Search...');

        const deepFindQuestions = (obj, depth = 0) => {
            if (depth > 8 || !obj || typeof obj !== 'object') return [];
            // Match any object with an id + exam_question_type_code — covers all types including ASSOCIATE
            const isQuestion = (
                obj.id !== undefined &&
                typeof obj.exam_question_type_code === 'string' &&
                obj.exam_question_type_code.length > 0
            );
            if (isQuestion) return [obj];
            let found = [];
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

        const roots = [data.props];
        if (data.props.examSupports?.data) roots.push(data.props.examSupports.data);

        let potentialQuestions = [];
        for (const r of roots) potentialQuestions = potentialQuestions.concat(deepFindQuestions(r));
        potentialQuestions = potentialQuestions.filter((q, i, arr) => arr.indexOf(q) === i);

        if (potentialQuestions.length > 0) {
            log(`Deep Search found ${potentialQuestions.length} potential questions.`);
            questions = potentialQuestions;
        }
    }

    if (questions.length === 0) {
        if (data.component === 'activity/pages/correction' || data.url?.endsWith('/correction')) {
            log('Correction page. Clicking Continue.');
            clickContinue();
            return;
        }

        // Safety first — if draggable chips or inputs are visible, data just isn't loaded yet
        const visibleInteractive = Array.from(document.querySelectorAll(
            'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="search"]), textarea, .draggable-item, [draggable="true"]'
        )).filter(el => el.offsetParent !== null);
        if (visibleInteractive.length > 0) {
            _noJsonRetryCount++;
            if (_noJsonRetryCount >= 5) {
                log(`WARN: No question JSON after ${_noJsonRetryCount} retries — forcing continue.`);
                _noJsonRetryCount = 0;
                clickContinue();
                return;
            }
            if (autoMode) {
                log(`WARN: DOM has interactive elements but no question JSON — retrying in 1.5s... (${_noJsonRetryCount}/5)`);
                latestInertiaData = null;
                setTimeout(solveCurrentQuestion, 1500);
                return;
            }
            log('CRITICAL: No questions found but interactive elements detected. Stopping.');
            visibleInteractive.forEach(el => el.style.border = '5px solid red');
            console.log('--- FULL PROPS DUMP (Sanitized) ---', sanitizeData(data.props));
            alert('GE-BOT WARNING: Bot stopped. No question JSON found. Check console for FULL PROPS DUMP.');
            return;
        }

        const currentRoute = data.props?.meta?.current_route_name || '';
        if (currentRoute.includes('view.home') || currentRoute.includes('onboarding') || location.pathname === '/') {
            log('Dashboard/Onboarding. Clicking Continue.');
            clickContinue();
            return;
        }

        log('No questions found. Clicking Continue.');
        clickContinue();
        return;
    }

    _noJsonRetryCount = 0;

    const firstQId = questions[0]?.id;
    if (firstQId === _lastQuestionId) {
        _sameQuestionCount++;
        if (_sameQuestionCount >= 3) {
            log(`WARN: Stuck on question ${firstQId} for ${_sameQuestionCount} attempts. Forcing continue.`);
            _sameQuestionCount = 0;
            _lastQuestionId = null;
            clickContinue();
            return;
        }
    } else {
        _lastQuestionId = firstQId;
        _sameQuestionCount = 1;
    }

    let anyProcessed = false;

    for (const q of questions) {
        log(`Processing question ID = ${q.id} Type = ${q.exam_question_type_code}`);

        const answers = q.exam_answers || q.answers || [];
        if (!answers.length) { log('No answers found for question', q); continue; }

        const type = q.exam_question_type_code;
        let targets = [];

        if (type === 'SORTING_WORD' || type === 'SORTING' || type === 'ORDERING') {
            const visibleChips = Array.from(document.querySelectorAll(
                '.draggable-item, [draggable="true"], [class*="draggable"], [data-draggable-item-id]'
            )).filter(el => el.offsetParent !== null);
            if (visibleChips.length === 0) {
                log(`SORTING question ${q.id}: no draggable chips visible — skipping.`);
                continue;
            }
            log('Detected SORTING. Clicking chips in order.');
            let sortedAnswers = [...answers];
            if (sortedAnswers[0]?.order !== undefined) sortedAnswers.sort((a, b) => a.order - b.order);
            targets = sortedAnswers;

        } else if (type === 'FILL_BLANK_SELECT' || type === 'FILL_BLANK_DRAG') {
            log('Detected FILL_BLANK. Attempting pointer drag to slots...');

            let sortedAnswers = [...answers];
            if (sortedAnswers[0]?.order !== undefined) sortedAnswers.sort((a, b) => a.order - b.order);

            let slots = Array.from(document.querySelectorAll('.drop-zone, .dropzone, .droppable, [data-drop-id], .blank-slot'));
            if (slots.length === 0) {
                const textContainer = document.querySelector('.question-text, .text-content, [class*="prose"]');
                if (textContainer) slots = Array.from(textContainer.querySelectorAll('span:empty, div:empty, span[class*="bg-"], span.inline-block'));
            }
            slots = slots.filter(s => s.offsetParent !== null);

            if (slots.length === 0 && visibleChips?.length === 0) {
                log(`FILL_BLANK question ${q.id}: no slots or chips visible — skipping.`);
                continue;
            }

            log(`Diagnostics: Found ${slots.length} drop-slots.`);
            if (slots.length === 0) {
                const container = document.querySelector('.question-text') || document.body;
                console.log('Drop-slot HTML sample:', container.innerHTML.substring(0, 1000));
            }

            for (let i = 0; i < sortedAnswers.length; i++) {
                const ans = sortedAnswers[i];
                const slot = slots[i];
                if (ans && slot) {
                    log(`Item ${i + 1}: ID = ${ans.id} -> Slot ${i + 1}`);
                    const source = await findElementForAnswer(ans);
                    if (source) {
                        log(`Pointer drag: source -> slot ${i + 1}`);
                        await simulatePointerDrag(source, slot);
                        await new Promise(r => setTimeout(r, 600));
                    } else {
                        log(`Source not found for answer ${ans.id}`);
                    }
                }
            }
            continue;

        } else if (type === 'ASSOCIATE' || type === 'MATCHING' || type === 'ASSOCIATE_WORD' || type === 'ASSOCIATION') {
            log('Detected ASSOCIATE. Dragging chips to drop zones by order...');
            const groups = {};
            answers.forEach(a => {
                if (a.order !== undefined && a.order !== null) {
                    if (!groups[a.order]) groups[a.order] = [];
                    groups[a.order].push(a);
                }
            });
            log(`Found ${Object.keys(groups).length} groups.`);

            // Find all drop zones (empty dashed boxes on the right), sorted top→bottom
            let dropZones = Array.from(document.querySelectorAll(
                '.drop-zone, .dropzone, .droppable, [data-drop-id], [class*="drop-zone"], [class*="dropzone"]'
            )).filter(s => s.offsetParent !== null);
            if (dropZones.length === 0) {
                dropZones = Array.from(document.querySelectorAll('[class*="dashed"], [class*="border-dashed"]'))
                    .filter(s => s.offsetParent !== null && s.innerText.trim() === '');
            }
            dropZones.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
            log(`Found ${dropZones.length} drop zones.`);

            const isDraggable = el => el && (
                el.classList.contains('draggable-item') ||
                el.getAttribute('draggable') === 'true' ||
                el.draggable === true
            );

            const orderedGroups = Object.keys(groups)
                .sort((a, b) => Number(a) - Number(b))
                .map(k => groups[k]);

            for (let i = 0; i < orderedGroups.length; i++) {
                const pair = orderedGroups[i];
                if (pair.length < 2) continue;
                const [item1, item2] = pair;
                log(`Pair ${i + 1}: "${item1.name}" <-> "${item2.name}"`);

                const el1 = await findElementForAnswer(item1);
                const el2 = await findElementForAnswer(item2);

                // Chip = draggable button; label = the static word on the left
                const chip = isDraggable(el1) ? el1 : isDraggable(el2) ? el2 : null;
                const labelEl = chip === el1 ? el2 : chip === el2 ? el1 : (el1 || el2);

                // Find drop zone by walking up from the label element
                let dropZone = null;
                if (labelEl) {
                    let node = labelEl;
                    for (let j = 0; j < 6; j++) {
                        if (!node) break;
                        dropZone = node.querySelector('.drop-zone, [class*="drop-zone"], [class*="dropzone"]');
                        if (dropZone) break;
                        node = node.parentElement;
                    }
                }
                // Fallback: use sorted drop zone by index
                if (!dropZone) dropZone = dropZones[i] || null;

                if (chip && dropZone) {
                    log(`Click chip → drop zone (pair ${i + 1})`);
                    await clickElement(chip);
                    await new Promise(r => setTimeout(r, 300));
                    await clickElement(dropZone);
                    await new Promise(r => setTimeout(r, 600));
                } else if (el1 && el2) {
                    log(`Fallback: click el1 then el2`);
                    await clickElement(isDraggable(el1) ? el1 : el2);
                    await new Promise(r => setTimeout(r, 200));
                    await clickElement(isDraggable(el1) ? el2 : el1);
                    await new Promise(r => setTimeout(r, 600));
                } else {
                    log(`Could not resolve pair ${i + 1}.`, { item1, item2, el1: !!el1, el2: !!el2, dropZone: !!dropZone });
                }
            }

        } else if (type === 'FILL_IN_THE_BLANK' || type === 'GAP_FILL' || type === 'FILL_BLANK_RECON') {
            log(`Detected ${type}. Typing answers...`);
            let correctAnswers = answers.filter(a =>
                a.is_correct === true || a.is_correct === 1 ||
                a.correct === true || a.correct === 1 ||
                a.is_right_answer === true
            );
            if (correctAnswers.length > 0) {
                if (correctAnswers[0].order !== undefined) {
                    correctAnswers.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
                }
                const allInputs = Array.from(document.querySelectorAll(
                    'input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), textarea, [contenteditable="true"]'
                ));
                for (let i = 0; i < correctAnswers.length; i++) {
                    await fillInputAnswer(correctAnswers[i], allInputs[i] || null);
                    await new Promise(r => setTimeout(r, 300));
                }
            } else {
                log('No correct answer text found for fill-in-the-blank.');
            }

        } else {
            targets = answers.filter(a =>
                a.is_correct === true || a.is_correct === 1 ||
                a.correct === true || a.correct === 1 ||
                a.right === true || a.is_right === true ||
                a.is_right_answer === true
            );
        }

        const handledTypes = ['ASSOCIATE', 'MATCHING', 'ASSOCIATE_WORD', 'ASSOCIATION',
                              'FILL_IN_THE_BLANK', 'GAP_FILL', 'FILL_BLANK_RECON',
                              'FILL_BLANK_SELECT', 'FILL_BLANK_DRAG'];
        if (targets.length === 0 && !handledTypes.includes(type)) {
            log(`CRITICAL: No correct targets for Q:${q.id} Type=${type}`);
            console.log('Question:', q, 'Answers:', answers);
            continue;
        }

        log(`Found ${targets.length} targets to click.`);
        for (const t of targets) {
            await clickAnswerElement(t);
            await new Promise(r => setTimeout(r, 800));
        }
        anyProcessed = true;
    }

    if (!anyProcessed && questions.length > 0) {
        _noJsonRetryCount++;
        if (_noJsonRetryCount <= 4) {
            log(`All questions skipped (elements not visible). Retrying in 2s... (${_noJsonRetryCount}/4)`);
            latestInertiaData = null;
            setTimeout(solveCurrentQuestion, 2000);
            return;
        }
        log('All questions skipped after 4 retries. Forcing continue.');
        _noJsonRetryCount = 0;
    }

    log('Waiting for UI to validate before continuing...');
    setTimeout(clickContinue, 2500);
}

async function clickContinue() {
    log('Looking for Continue/Next button...');
    const maxRetries = 10;
    let attempt = 0;

    const checkAndClick = async () => {
        const btns = Array.from(document.querySelectorAll('button, a'));
        const nextBtn = btns.find(b => {
            // Exclude draggable answer chips
            if (b.classList.contains('draggable-item') || b.hasAttribute('data-draggable-item-id')) return false;
            if (b.offsetParent === null) return false;
            const t = b.innerText.toLowerCase().trim();
            return (
                t.includes('continuer') || t.includes('suivant') || t.includes('continue') ||
                t.includes('next') || t.includes('passer') || t.includes('check') ||
                t.includes('finish') || t.includes('validate') || t.includes('terminer') ||
                t.includes('valider') || t.includes('start') || t.includes('commencer') ||
                t.includes('accéder') || t.includes('acceder') || t === 'go'
            );
        });

        if (nextBtn) {
            log('Found Continue button:', nextBtn);
            await clickElement(nextBtn);
            log('Clicked Continue.');

            if (autoMode) {
                let navReceived = false;
                const navListener = (e) => { if (e.data?.type === 'GE_NAV_EVENT') navReceived = true; };
                window.addEventListener('message', navListener);
                const pollStart = Date.now();
                const waitForNav = () => {
                    if (navReceived || Date.now() - pollStart > 3000) {
                        window.removeEventListener('message', navListener);
                        setTimeout(solveCurrentQuestion, 800);
                    } else {
                        setTimeout(waitForNav, 150);
                    }
                };
                waitForNav();
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
            log('Continue button not found after retries. Dumping buttons:');
            Array.from(document.querySelectorAll('button, a')).slice(0, 5).forEach(b => log(`Btn: "${b.innerText}"`, b));
        }
    };

    loop();
}
