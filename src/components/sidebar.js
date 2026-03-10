// ============================================
// TidyTube — Sidebar Component
// ============================================

/**
 * Render the playlist sidebar
 * @param {Array} playlists - YouTube playlist objects
 * @param {string} activeId - Currently selected playlist ID
 * @param {function} onSelect - Callback when a playlist is clicked
 * @param {function} onWatchLaterClick - Callback when Watch Later is clicked
 * @param {function} onDeletePlaylist - Callback(playlistId, title) when delete is clicked
 */
export function renderSidebar(playlists, activeId, onSelect, onWatchLaterClick, onDeletePlaylist) {
  const container = document.getElementById('playlist-list');
  const countEl = document.getElementById('playlist-count');

  if (!playlists || playlists.length === 0) {
    container.innerHTML = _renderSkeletons(6);
    countEl.textContent = '';
    return;
  }

  countEl.textContent = `${playlists.filter(p => !p._locked).length}`;

  container.innerHTML = playlists.map(playlist => {
    const isActive = playlist.id === activeId;
    const isLocked = playlist._locked;
    const isSpecial = playlist._isSpecial;
    const thumb = playlist.snippet.thumbnails?.default?.url ||
      playlist.snippet.thumbnails?.medium?.url || '';
    const count = playlist.contentDetails?.itemCount ?? '?';
    const title = playlist.snippet.title;
    const canDelete = !isLocked && !isSpecial;

    let typeIcon = '';
    if (playlist._type === 'likes') {
      typeIcon = '❤️ ';
    } else if (playlist._type === 'watchLater') {
      typeIcon = '⏰ ';
    }

    return `
      <div class="playlist-item ${isActive ? 'active' : ''} ${isLocked ? 'locked' : ''}"
           data-playlist-id="${playlist.id}">
        ${thumb
        ? `<img class="playlist-thumb" src="${thumb}" alt="" loading="lazy" />`
        : `<div class="playlist-thumb" style="display:flex;align-items:center;justify-content:center;font-size:1.2rem;">${typeIcon || '🎵'}</div>`
      }
        <div class="playlist-info">
          <div class="playlist-name">${typeIcon}${_escapeHtml(title)}</div>
          <div class="playlist-meta">
            ${count} video${count !== 1 ? 's' : ''}
            ${isLocked ? `
              <svg class="playlist-lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
            ` : ''}
          </div>
        </div>
        ${canDelete ? `
          <button class="playlist-delete-btn" data-delete-id="${playlist.id}" data-delete-title="${_escapeAttr(title)}" title="Delete playlist">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
            </svg>
          </button>
        ` : ''}
      </div>
    `;
  }).join('');

  // Attach click listeners for playlist selection
  container.querySelectorAll('.playlist-item:not(.locked)').forEach(el => {
    el.addEventListener('click', (e) => {
      // Don't select if they clicked the delete button
      if (e.target.closest('.playlist-delete-btn')) return;
      const id = el.dataset.playlistId;
      onSelect(id);
    });
  });

  // Attach click listener for locked Watch Later
  if (onWatchLaterClick) {
    container.querySelectorAll('.playlist-item.locked').forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => onWatchLaterClick());
    });
  }

  // Attach delete button listeners
  if (onDeletePlaylist) {
    container.querySelectorAll('.playlist-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.deleteId;
        const title = btn.dataset.deleteTitle;
        onDeletePlaylist(id, title);
      });
    });
  }
}

/**
 * Show loading skeletons
 */
export function renderSidebarLoading() {
  const container = document.getElementById('playlist-list');
  container.innerHTML = _renderSkeletons(6);
}

function _renderSkeletons(count) {
  return Array(count).fill(0).map(() => `
    <div class="skeleton-playlist">
      <div class="skeleton skeleton-thumb"></div>
      <div style="flex:1">
        <div class="skeleton skeleton-text"></div>
        <div class="skeleton skeleton-text-sm"></div>
      </div>
    </div>
  `).join('');
}

function _escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function _escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
