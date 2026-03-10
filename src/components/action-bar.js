// ============================================
// TidyTube — Action Bar Component
// ============================================

/**
 * Update the floating action bar visibility and selection count
 * @param {number} count - Number of selected videos
 */
export function updateActionBar(count) {
    const bar = document.getElementById('action-bar');
    const countEl = document.getElementById('selection-count');

    if (count > 0) {
        bar.classList.remove('hidden');
        countEl.textContent = `${count} video${count !== 1 ? 's' : ''} selected`;
    } else {
        bar.classList.add('hidden');
    }
}
