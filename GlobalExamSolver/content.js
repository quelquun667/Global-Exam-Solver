// GlobalExam Auto-Answer Bot — entry point
// Globals shared across all modules (loaded first in manifest)

let autoMode = false;

function log(msg, data = null) {
    console.log(`[GE-Bot] ${msg}`, data || '');
}
