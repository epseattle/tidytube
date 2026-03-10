// ============================================
// TidyTube — Undo Buffer Utility
// ============================================

const UNDO_TIMEOUT_MS = 60000; // 60 seconds

let currentUndo = null;   // { label, reverseFn, timer, startTime }
let snackbar = null;
let progressBar = null;
let undoBtn = null;
let dismissBtn = null;
let labelEl = null;
let animFrame = null;

/**
 * Initialize undo snackbar DOM references
 * Must be called once after DOM is ready
 */
export function initUndo() {
    snackbar = document.getElementById('undo-snackbar');
    progressBar = document.getElementById('undo-progress');
    undoBtn = document.getElementById('btn-undo');
    dismissBtn = document.getElementById('btn-undo-dismiss');
    labelEl = document.getElementById('undo-label');

    undoBtn.addEventListener('click', executeUndo);
    dismissBtn.addEventListener('click', clearUndo);
}

/**
 * Push a new undo operation
 * @param {string} label - e.g. "Deleted 5 videos"
 * @param {function} reverseFn - async function that reverses the operation
 */
export function pushUndo(label, reverseFn) {
    // Clear any existing undo
    if (currentUndo) {
        _clearTimer();
    }

    currentUndo = {
        label,
        reverseFn,
        startTime: Date.now(),
        timer: setTimeout(() => {
            clearUndo();
        }, UNDO_TIMEOUT_MS),
    };

    // Show snackbar
    labelEl.textContent = label;
    snackbar.classList.remove('hidden');
    snackbar.classList.add('show');

    // Animate progress bar
    _animateProgress();
}

/**
 * Execute the stored undo operation
 */
export async function executeUndo() {
    if (!currentUndo) return;

    const { reverseFn, label } = currentUndo;
    _clearTimer();

    // Update UI to show executing
    labelEl.textContent = 'Undoing...';
    undoBtn.disabled = true;

    try {
        await reverseFn();
        labelEl.textContent = `Undone: ${label}`;
        setTimeout(() => {
            _hideSnackbar();
            currentUndo = null;
        }, 1500);
    } catch (e) {
        console.error('Undo failed:', e);
        labelEl.textContent = `Undo failed: ${e.message}`;
        setTimeout(() => {
            _hideSnackbar();
            currentUndo = null;
        }, 3000);
    }

    undoBtn.disabled = false;
}

/**
 * Clear the undo buffer without executing
 */
export function clearUndo() {
    _clearTimer();
    _hideSnackbar();
    currentUndo = null;
}

/**
 * Check if there's an active undo
 */
export function hasUndo() {
    return currentUndo !== null;
}

// --- Internal helpers ---

function _clearTimer() {
    if (currentUndo?.timer) {
        clearTimeout(currentUndo.timer);
    }
    if (animFrame) {
        cancelAnimationFrame(animFrame);
        animFrame = null;
    }
}

function _hideSnackbar() {
    if (!snackbar) return;
    snackbar.classList.remove('show');
    snackbar.classList.add('hidden');
    if (progressBar) progressBar.style.width = '100%';
}

function _animateProgress() {
    if (!currentUndo || !progressBar) return;

    const elapsed = Date.now() - currentUndo.startTime;
    const remaining = Math.max(0, 1 - elapsed / UNDO_TIMEOUT_MS);
    progressBar.style.width = `${remaining * 100}%`;

    if (remaining > 0) {
        animFrame = requestAnimationFrame(_animateProgress);
    }
}
