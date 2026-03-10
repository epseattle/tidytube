// ============================================
// TidyTube — Progress Modal Utility
// ============================================

/**
 * Show the progress modal
 * @param {string} title
 */
export function showProgress(title = 'Processing...') {
    const overlay = document.getElementById('progress-overlay');
    const titleEl = document.getElementById('progress-title');
    const fill = document.getElementById('progress-bar-fill');
    const text = document.getElementById('progress-text');

    titleEl.textContent = title;
    fill.style.width = '0%';
    text.textContent = '0 / 0 completed';
    overlay.classList.remove('hidden');
}

/**
 * Update progress
 * @param {number} completed
 * @param {number} total
 */
export function updateProgress(completed, total) {
    const fill = document.getElementById('progress-bar-fill');
    const text = document.getElementById('progress-text');

    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    fill.style.width = `${pct}%`;
    text.textContent = `${completed} / ${total} completed`;
}

/**
 * Hide the progress modal
 */
export function hideProgress() {
    const overlay = document.getElementById('progress-overlay');
    overlay.classList.add('hidden');
}
