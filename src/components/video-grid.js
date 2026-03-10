// ============================================
// TidyTube — Video Grid Component
// ============================================

let currentView = 'grid'; // 'grid' or 'list'
let videoDurations = new Map(); // videoId → seconds

/**
 * Store duration data for use in rendering and filtering
 * @param {Map<string, number>} durations - videoId → seconds
 */
export function setVideoDurations(durations) {
    videoDurations = durations;
}

/**
 * Get stored durations map
 */
export function getVideoDurations() {
    return videoDurations;
}

/**
 * Render the video grid/list
 * @param {Array} items - YouTube playlist item objects
 * @param {Set<string>} selectedIds - Set of selected playlist item IDs
 * @param {function} onToggleSelect - Callback (playlistItemId, videoId, isSelected)
 * @param {string} searchQuery - Current search query for highlighting
 */
export function renderVideoGrid(items, selectedIds, onToggleSelect, searchQuery = '') {
    const grid = document.getElementById('video-grid');
    const emptyState = document.getElementById('empty-state');
    const emptyText = document.getElementById('empty-text');
    const videoCount = document.getElementById('video-count');
    const loadingSpinner = document.getElementById('loading-spinner');

    loadingSpinner.classList.add('hidden');

    if (!items || items.length === 0) {
        grid.innerHTML = '';
        emptyState.classList.remove('hidden');
        emptyText.textContent = 'This playlist is empty';
        videoCount.textContent = '';
        return;
    }

    emptyState.classList.add('hidden');
    videoCount.textContent = `${items.length} video${items.length !== 1 ? 's' : ''}`;

    grid.className = `video-grid ${currentView === 'list' ? 'list-view' : ''}`;

    grid.innerHTML = items.map(item => {
        const itemId = item.id;
        const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId || '';
        const title = item.snippet?.title || 'Untitled';
        const channel = item.snippet?.videoOwnerChannelTitle || '';
        const thumb = item.snippet?.thumbnails?.medium?.url ||
            item.snippet?.thumbnails?.default?.url || '';
        const isSelected = selectedIds.has(itemId);
        const durationSec = videoDurations.get(videoId);
        const durationBadge = durationSec != null
            ? `<span class="duration-badge">${_formatDuration(durationSec)}</span>`
            : '';

        return `
      <div class="video-card ${isSelected ? 'selected' : ''}"
           data-item-id="${itemId}"
           data-video-id="${videoId}">
        <div class="card-checkbox" data-action="checkbox">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <div class="card-thumbnail">
          <img src="${thumb}" alt="" loading="lazy" />
          ${durationBadge}
        </div>
        <div class="card-body">
          <div class="card-title" title="${_escapeAttr(title)}">${_highlightText(title, searchQuery)}</div>
          ${channel ? `<div class="card-channel">${_highlightText(channel, searchQuery)}</div>` : ''}
        </div>
      </div>
    `;
    }).join('');

    // Attach click listeners
    grid.querySelectorAll('.video-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const itemId = card.dataset.itemId;
            const videoId = card.dataset.videoId;
            const isSelected = selectedIds.has(itemId);
            onToggleSelect(itemId, videoId, !isSelected);
        });
    });
}

/**
 * Show loading state
 */
export function showLoading() {
    const grid = document.getElementById('video-grid');
    const emptyState = document.getElementById('empty-state');
    const loadingSpinner = document.getElementById('loading-spinner');

    grid.innerHTML = '';
    emptyState.classList.add('hidden');
    loadingSpinner.classList.remove('hidden');
}

/**
 * Show initial empty state
 */
export function showEmptyState(message = 'Select a playlist to get started') {
    const grid = document.getElementById('video-grid');
    const emptyState = document.getElementById('empty-state');
    const emptyText = document.getElementById('empty-text');
    const loadingSpinner = document.getElementById('loading-spinner');

    grid.innerHTML = '';
    loadingSpinner.classList.add('hidden');
    emptyState.classList.remove('hidden');
    emptyText.textContent = message;
}

/**
 * Set view mode
 */
export function setViewMode(mode) {
    currentView = mode;
    const grid = document.getElementById('video-grid');
    const gridBtn = document.getElementById('btn-grid-view');
    const listBtn = document.getElementById('btn-list-view');

    if (mode === 'list') {
        grid.classList.add('list-view');
        listBtn.classList.add('active');
        gridBtn.classList.remove('active');
    } else {
        grid.classList.remove('list-view');
        gridBtn.classList.add('active');
        listBtn.classList.remove('active');
    }
}

/**
 * Filter videos by search query + duration + date + channel (client-side)
 * @param {Array} items
 * @param {string} query - text search
 * @param {Object} filters - { duration: 'all'|'short'|'medium'|'long' }
 * @returns {Array}
 */
export function filterVideos(items, query, filters = {}) {
    let result = items;

    // Text search
    if (query) {
        const q = query.toLowerCase();
        result = result.filter(item => {
            const title = (item.snippet?.title || '').toLowerCase();
            const channel = (item.snippet?.videoOwnerChannelTitle || '').toLowerCase();
            return title.includes(q) || channel.includes(q);
        });
    }

    // Duration filter
    if (filters.duration && filters.duration !== 'all') {
        result = result.filter(item => {
            const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId || item.id;
            const dur = videoDurations.get(videoId);
            if (dur == null) return true; // don't filter out if we don't have duration data
            switch (filters.duration) {
                case 'short': return dur < 300;       // < 5 min
                case 'medium': return dur >= 300 && dur <= 1200; // 5-20 min
                case 'long': return dur > 1200;       // > 20 min
                default: return true;
            }
        });
    }

    return result;
}

/**
 * Sort videos
 * @param {Array} items
 * @param {string} sortBy - 'default'|'title'|'date'|'duration'|'channel'
 * @param {string} sortDir - 'asc'|'desc'
 * @returns {Array} sorted copy
 */
export function sortVideos(items, sortBy = 'default', sortDir = 'asc') {
    if (sortBy === 'default') return items;

    const sorted = [...items].sort((a, b) => {
        let valA, valB;

        switch (sortBy) {
            case 'title':
                valA = (a.snippet?.title || '').toLowerCase();
                valB = (b.snippet?.title || '').toLowerCase();
                return valA.localeCompare(valB);

            case 'date':
                valA = a.snippet?.publishedAt || '';
                valB = b.snippet?.publishedAt || '';
                return valA.localeCompare(valB);

            case 'duration': {
                const idA = a.contentDetails?.videoId || a.snippet?.resourceId?.videoId || a.id;
                const idB = b.contentDetails?.videoId || b.snippet?.resourceId?.videoId || b.id;
                valA = videoDurations.get(idA) ?? 0;
                valB = videoDurations.get(idB) ?? 0;
                return valA - valB;
            }

            case 'channel':
                valA = (a.snippet?.videoOwnerChannelTitle || '').toLowerCase();
                valB = (b.snippet?.videoOwnerChannelTitle || '').toLowerCase();
                return valA.localeCompare(valB);

            default:
                return 0;
        }
    });

    return sortDir === 'desc' ? sorted.reverse() : sorted;
}

export function getViewMode() {
    return currentView;
}

function _formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function _escapeAttr(str) {
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _highlightText(text, query) {
    const escaped = _escapeHtml(text);
    if (!query) return escaped;
    const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${q})`, 'gi');
    return escaped.replace(regex, '<span class="search-highlight">$1</span>');
}
