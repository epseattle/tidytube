// ============================================
// TidyTube — Playlist Picker Modal
// ============================================

let selectedDestPlaylistId = null;
let onConfirmCallback = null;
let currentMode = 'copy'; // 'copy' or 'move'

/**
 * Open the playlist picker modal
 * @param {string} mode - 'copy' or 'move'
 * @param {Array} playlists - All user playlists
 * @param {string} currentPlaylistId - ID of the source playlist (to disable in move mode)
 * @param {function} onConfirm - Callback(destPlaylistId)
 * @param {function} onCreatePlaylist - Callback(title, privacy) => Promise<playlist>
 */
export function openPlaylistPicker(mode, playlists, currentPlaylistId, onConfirm, onCreatePlaylist) {
    currentMode = mode;
    selectedDestPlaylistId = null;
    onConfirmCallback = onConfirm;

    const overlay = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const confirmBtn = document.getElementById('btn-modal-confirm');
    const listContainer = document.getElementById('modal-playlist-list');

    modalTitle.textContent = mode === 'copy' ? 'Copy to playlist' : 'Move to playlist';
    confirmBtn.disabled = true;
    confirmBtn.textContent = mode === 'copy' ? 'Copy' : 'Move';

    // Render playlists (exclude locked ones)
    const validPlaylists = playlists.filter(p => !p._locked);

    listContainer.innerHTML = validPlaylists.map(playlist => {
        const isCurrentSource = playlist.id === currentPlaylistId;
        const thumb = playlist.snippet.thumbnails?.default?.url ||
            playlist.snippet.thumbnails?.medium?.url || '';
        const count = playlist.contentDetails?.itemCount ?? '?';

        return `
      <div class="modal-playlist-item ${isCurrentSource && mode === 'move' ? 'disabled' : ''}"
           data-playlist-id="${playlist.id}"
           ${isCurrentSource && mode === 'move' ? 'title="Cannot move to the same playlist"' : ''}>
        ${thumb
                ? `<img class="modal-playlist-thumb" src="${thumb}" alt="" loading="lazy" />`
                : `<div class="modal-playlist-thumb" style="display:flex;align-items:center;justify-content:center;font-size:0.9rem;">🎵</div>`
            }
        <span class="modal-playlist-name">${_escapeHtml(playlist.snippet.title)}</span>
        <span class="modal-playlist-count">${count}</span>
      </div>
    `;
    }).join('');

    // Click handlers for playlist selection
    listContainer.querySelectorAll('.modal-playlist-item:not(.disabled)').forEach(el => {
        el.addEventListener('click', () => {
            // Deselect previous
            listContainer.querySelectorAll('.modal-playlist-item.selected').forEach(s => s.classList.remove('selected'));
            // Select this one
            el.classList.add('selected');
            selectedDestPlaylistId = el.dataset.playlistId;
            confirmBtn.disabled = false;
        });
    });

    // Setup create new playlist form
    _setupCreateForm(onCreatePlaylist, listContainer, confirmBtn);

    // Show modal
    overlay.classList.remove('hidden');

    // Confirm button
    confirmBtn.onclick = () => {
        if (selectedDestPlaylistId && onConfirmCallback) {
            overlay.classList.add('hidden');
            onConfirmCallback(selectedDestPlaylistId);
        }
    };

    // Close handlers
    document.getElementById('btn-modal-close').onclick = () => overlay.classList.add('hidden');
    document.getElementById('btn-modal-cancel').onclick = () => overlay.classList.add('hidden');
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.add('hidden');
    });
}

function _setupCreateForm(onCreatePlaylist, listContainer, confirmBtn) {
    const createBtn = document.getElementById('btn-create-playlist');
    const form = document.getElementById('new-playlist-form');
    const nameInput = document.getElementById('new-playlist-name');
    const privacySelect = document.getElementById('new-playlist-privacy');
    const cancelBtn = document.getElementById('btn-cancel-create');
    const confirmCreateBtn = document.getElementById('btn-confirm-create');

    // Reset form
    form.classList.add('hidden');
    nameInput.value = '';
    privacySelect.value = 'private';

    createBtn.onclick = () => {
        form.classList.toggle('hidden');
        if (!form.classList.contains('hidden')) {
            nameInput.focus();
        }
    };

    cancelBtn.onclick = () => {
        form.classList.add('hidden');
        nameInput.value = '';
    };

    confirmCreateBtn.onclick = async () => {
        const title = nameInput.value.trim();
        if (!title) {
            nameInput.focus();
            return;
        }

        confirmCreateBtn.disabled = true;
        confirmCreateBtn.textContent = 'Creating...';

        try {
            const newPlaylist = await onCreatePlaylist(title, privacySelect.value);
            if (newPlaylist) {
                // Add to list and auto-select
                const newEl = document.createElement('div');
                newEl.className = 'modal-playlist-item selected';
                newEl.dataset.playlistId = newPlaylist.id;
                newEl.innerHTML = `
          <div class="modal-playlist-thumb" style="display:flex;align-items:center;justify-content:center;font-size:0.9rem;">🎵</div>
          <span class="modal-playlist-name">${_escapeHtml(title)}</span>
          <span class="modal-playlist-count">0</span>
        `;

                // Deselect previous
                listContainer.querySelectorAll('.modal-playlist-item.selected').forEach(s => s.classList.remove('selected'));

                listContainer.prepend(newEl);
                selectedDestPlaylistId = newPlaylist.id;
                confirmBtn.disabled = false;

                newEl.addEventListener('click', () => {
                    listContainer.querySelectorAll('.modal-playlist-item.selected').forEach(s => s.classList.remove('selected'));
                    newEl.classList.add('selected');
                    selectedDestPlaylistId = newPlaylist.id;
                    confirmBtn.disabled = false;
                });

                form.classList.add('hidden');
                nameInput.value = '';
            }
        } catch (e) {
            console.error('Failed to create playlist:', e);
        } finally {
            confirmCreateBtn.disabled = false;
            confirmCreateBtn.textContent = 'Create & Select';
        }
    };
}

function _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
