// ============================================
// TidyTube — Subscriptions Component
// ============================================

let selectedSubs = new Set(); // subscriptionIds
let currentSort = 'name'; // 'name' | 'subscribers' | 'videos'
let currentSortDir = 'asc';
let allSubs = [];
let channelDetailsMap = new Map();

/**
 * Render the subscriptions panel
 * @param {Array} subscriptions - YouTube subscription objects
 * @param {Map} channelDetails - channelId → details
 * @param {function} onSelectionChange - callback(selectedCount)
 */
export function renderSubscriptions(subscriptions, channelDetails, onSelectionChange) {
    allSubs = subscriptions;
    channelDetailsMap = channelDetails;
    selectedSubs.clear();

    const panel = document.getElementById('subs-list');
    const count = document.getElementById('video-count');
    const selectAllBtn = document.getElementById('btn-subs-select-all');

    if (!subscriptions || subscriptions.length === 0) {
        panel.innerHTML = '<div class="subs-empty">No subscriptions found</div>';
        count.textContent = '';
        return;
    }

    count.textContent = `${subscriptions.length} channel${subscriptions.length !== 1 ? 's' : ''}`;
    _renderList(panel, onSelectionChange);

    // Select All button
    selectAllBtn.onclick = () => {
        if (selectedSubs.size === allSubs.length) {
            selectedSubs.clear();
            selectAllBtn.textContent = 'Select All';
        } else {
            allSubs.forEach(s => selectedSubs.add(s.id));
            selectAllBtn.textContent = 'Deselect All';
        }
        _renderList(panel, onSelectionChange);
        onSelectionChange(selectedSubs.size);
    };
}

function _renderList(panel, onSelectionChange) {
    const sorted = _sortSubs(allSubs);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    panel.innerHTML = sorted.map(sub => {
        const channelId = sub.snippet?.resourceId?.channelId || '';
        const channelName = sub.snippet?.title || 'Unknown';
        const avatar = sub.snippet?.thumbnails?.default?.url || '';
        const details = channelDetailsMap.get(channelId) || {};
        const subCount = details.subscriberCount || 0;
        const videoCount = details.videoCount || 0;
        const isSelected = selectedSubs.has(sub.id);
        const subDate = sub.snippet?.publishedAt ? new Date(sub.snippet.publishedAt) : null;

        // Format subscriber count
        const subStr = subCount >= 1000000 ? `${(subCount / 1000000).toFixed(1)}M` :
            subCount >= 1000 ? `${(subCount / 1000).toFixed(1)}K` : `${subCount}`;

        return `
            <div class="sub-card ${isSelected ? 'selected' : ''}" data-sub-id="${sub.id}" data-channel-id="${channelId}">
                <div class="sub-checkbox" data-action="checkbox">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <img class="sub-avatar" src="${avatar}" alt="" loading="lazy" />
                <div class="sub-info">
                    <div class="sub-name">${channelName}</div>
                    <div class="sub-stats">
                        <span>${subStr} subs</span>
                        <span>•</span>
                        <span>${videoCount} videos</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Attach click listeners
    panel.querySelectorAll('.sub-card').forEach(card => {
        card.addEventListener('click', () => {
            const subId = card.dataset.subId;
            if (selectedSubs.has(subId)) {
                selectedSubs.delete(subId);
            } else {
                selectedSubs.add(subId);
            }
            card.classList.toggle('selected');
            onSelectionChange(selectedSubs.size);
        });
    });
}

function _sortSubs(subs) {
    return [...subs].sort((a, b) => {
        let valA, valB;
        const chA = channelDetailsMap.get(a.snippet?.resourceId?.channelId || '') || {};
        const chB = channelDetailsMap.get(b.snippet?.resourceId?.channelId || '') || {};

        switch (currentSort) {
            case 'subscribers':
                valA = chA.subscriberCount || 0;
                valB = chB.subscriberCount || 0;
                return currentSortDir === 'asc' ? valA - valB : valB - valA;
            case 'videos':
                valA = chA.videoCount || 0;
                valB = chB.videoCount || 0;
                return currentSortDir === 'asc' ? valA - valB : valB - valA;
            case 'name':
            default:
                valA = (a.snippet?.title || '').toLowerCase();
                valB = (b.snippet?.title || '').toLowerCase();
                return currentSortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
    });
}

/**
 * Set sort configuration
 */
export function setSubSort(sort, dir) {
    currentSort = sort;
    currentSortDir = dir;
}

/**
 * Get selected subscription IDs
 */
export function getSelectedSubIds() {
    return Array.from(selectedSubs);
}

/**
 * Clear selection
 */
export function clearSubSelection() {
    selectedSubs.clear();
}

/**
 * Show loading state for subscriptions
 */
export function showSubsLoading() {
    const panel = document.getElementById('subs-list');
    panel.innerHTML = '<div class="subs-loading"><div class="spinner"></div> Loading subscriptions...</div>';
}
