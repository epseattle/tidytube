// ============================================
// TidyTube — Main App Controller
// ============================================

import { initAuth, signIn, signOut, tryRestoreSession, getClientId, saveClientId, clearClientId } from './auth.js';
import {
    fetchUserInfo,
    fetchPlaylists,
    fetchPlaylistItems,
    fetchLikedVideos,
    fetchVideoDurations,
    findDeadLinks,
    scanForDuplicates,
    fetchSubscriptions,
    fetchChannelDetails,
    batchUnsubscribe,
    batchDelete,
    batchUnlike,
    batchCopy,
    batchMove,
    addVideoToPlaylist,
    unlikeVideo,
    reLikeVideo,
    createPlaylist,
    deletePlaylist,
    deletePlaylistItem,
    onQuotaChange,
    getQuota,
    LIKED_VIDEOS_ID,
} from './api.js';
import { renderSidebar, renderSidebarLoading } from './components/sidebar.js';
import {
    renderVideoGrid,
    showLoading,
    showEmptyState,
    setViewMode,
    filterVideos,
    sortVideos,
    setVideoDurations,
} from './components/video-grid.js';
import { updateActionBar } from './components/action-bar.js';
import { openPlaylistPicker } from './components/playlist-picker.js';
import { showToast } from './utils/toast.js';
import { showProgress, updateProgress, hideProgress } from './utils/progress.js';
import { initUndo, pushUndo } from './utils/undo.js';
import {
    renderSubscriptions,
    showSubsLoading,
    getSelectedSubIds,
    clearSubSelection,
    setSubSort,
} from './components/subscriptions.js';

// ---------- App State ----------
let playlists = [];
let currentPlaylistId = null;
let currentItems = []; // All items in current playlist
let filteredItems = []; // Filtered by search + filters
let selectedItems = new Map(); // Map<playlistItemId, videoId>
let searchQuery = '';
let durationFilter = 'all';   // 'all' | 'short' | 'medium' | 'long'
let sortBy = 'default';       // 'default' | 'title' | 'date' | 'duration' | 'channel'
let sortDir = 'asc';          // 'asc' | 'desc'

// ---------- DOM References ----------
const landingScreen = document.getElementById('landing-screen');
const setupWizard = document.getElementById('setup-wizard');
const signinContainer = document.getElementById('signin-container');
const inputClientId = document.getElementById('input-client-id');
const btnSaveKey = document.getElementById('btn-save-key');
const btnChangeKey = document.getElementById('btn-change-key');
const mainApp = document.getElementById('main-app');
const signinBtn = document.getElementById('btn-google-signin');
const signoutBtn = document.getElementById('btn-signout');
const userAvatar = document.getElementById('user-avatar');
const searchInput = document.getElementById('search-input');
const searchClearBtn = document.getElementById('btn-search-clear');
const selectAllBtn = document.getElementById('btn-select-all');
const gridViewBtn = document.getElementById('btn-grid-view');
const listViewBtn = document.getElementById('btn-list-view');
const sidebar = document.getElementById('sidebar');
const contentTitle = document.getElementById('current-playlist-title');

// Action bar buttons
const deselectBtn = document.getElementById('btn-deselect');
const copyBtn = document.getElementById('btn-copy');
const moveBtn = document.getElementById('btn-move');
const deleteBtn = document.getElementById('btn-delete');
const unlikeAllBtn = document.getElementById('btn-unlike-all');

// Delete modal
const deleteOverlay = document.getElementById('delete-overlay');
const deleteModalTitle = document.getElementById('delete-modal-title');
const deleteMessage = document.getElementById('delete-message');
const deleteNote = document.getElementById('delete-note');
const deleteCancelBtn = document.getElementById('btn-delete-cancel');
const deleteConfirmBtn = document.getElementById('btn-delete-confirm');

// Watch Later modal
const wlOverlay = document.getElementById('watchlater-overlay');
const wlCloseBtn = document.getElementById('btn-wl-close');
const wlDismissBtn = document.getElementById('btn-wl-dismiss');
const wlCreateBtn = document.getElementById('btn-create-wl-playlist');
const wlCreateStatus = document.getElementById('wl-create-status');

// Filter bar
const filterBar = document.getElementById('filter-bar');
const durationFiltersEl = document.getElementById('duration-filters');
const sortSelect = document.getElementById('sort-select');
const sortDirBtn = document.getElementById('btn-sort-dir');

// Dead link
const cleanDeadBtn = document.getElementById('btn-clean-dead');
const deadlinkOverlay = document.getElementById('deadlink-overlay');
const deadlinkSummary = document.getElementById('deadlink-summary');
const deadlinkList = document.getElementById('deadlink-list');
const deadlinkCancelBtn = document.getElementById('btn-deadlink-cancel');
const deadlinkCleanBtn = document.getElementById('btn-deadlink-clean');
let pendingDeadLinks = [];

// Dedup
const findDupesBtn = document.getElementById('btn-find-dupes');
const dedupSummary = document.getElementById('dedup-summary');
const dedupList = document.getElementById('dedup-list');
const dedupCleanBtn = document.getElementById('btn-dedup-clean');
let pendingDuplicates = [];

// Main Views & Action Containers
const videoViewContainer = document.getElementById('video-view-container');
const subsListContainer = document.getElementById('subs-list');
const dedupView = document.getElementById('dedup-view');
const videoActions = document.getElementById('video-actions');
const subsActions = document.getElementById('subs-actions');
const dedupActions = document.getElementById('dedup-actions');

// Subscriptions
const showSubsBtn = document.getElementById('btn-show-subs');
const subsSortSelect = document.getElementById('subs-sort');
const subsSelectionCount = document.getElementById('subs-selection-count');
const unsubBtn = document.getElementById('btn-unsub');
let cachedSubs = null;
let cachedChannelDetails = null;

// Delete playlist modal
const delPlaylistOverlay = document.getElementById('delete-playlist-overlay');
const delPlaylistName = document.getElementById('delete-playlist-name');
const delPlaylistCancelBtn = document.getElementById('btn-delete-playlist-cancel');
const delPlaylistConfirmBtn = document.getElementById('btn-delete-playlist-confirm');
let pendingDeletePlaylistId = null;

// ---------- Initialization ----------

export function initApp() {
    // Setup auth
    initAuth({
        onSignIn: _handleSignIn,
        onSignOut: _handleSignOut,
    });

    // Try restore session
    const restoredToken = tryRestoreSession();
    if (restoredToken) {
        _handleSignIn(restoredToken);
    }

    // Setup quota change listener
    onQuotaChange(_updateQuotaUI);
    _updateQuotaUI(...Object.values(getQuota()));

    // Init undo system
    initUndo();

    // Check BYOK state
    if (getClientId()) {
        setupWizard.classList.add('hidden');
        signinContainer.classList.remove('hidden');
    } else {
        setupWizard.classList.remove('hidden');
        signinContainer.classList.add('hidden');
    }

    // Landing Page Event listeners
    btnSaveKey.addEventListener('click', () => {
        const id = inputClientId.value.trim();
        if (!id) {
            showToast('Please enter a Client ID', 'error');
            return;
        }
        saveClientId(id);
        setupWizard.classList.add('hidden');
        signinContainer.classList.remove('hidden');
        showToast('Client ID saved! You can now sign in.', 'success');
    });

    btnChangeKey.addEventListener('click', () => {
        clearClientId();
        inputClientId.value = '';
        setupWizard.classList.remove('hidden');
        signinContainer.classList.add('hidden');
    });

    // App Event listeners
    signinBtn.addEventListener('click', () => signIn());
    signoutBtn.addEventListener('click', () => signOut());
    searchInput.addEventListener('input', _handleSearch);
    searchClearBtn.addEventListener('click', _handleSearchClear);
    selectAllBtn.addEventListener('click', _handleSelectAll);
    gridViewBtn.addEventListener('click', () => setViewMode('grid'));
    listViewBtn.addEventListener('click', () => setViewMode('list'));

    // Filter bar
    durationFiltersEl.addEventListener('click', (e) => {
        const pill = e.target.closest('.filter-pill');
        if (!pill) return;
        durationFilter = pill.dataset.duration;
        durationFiltersEl.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        _applyFilters();
    });
    sortSelect.addEventListener('change', () => {
        sortBy = sortSelect.value;
        _applyFilters();
    });
    sortDirBtn.addEventListener('click', () => {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        sortDirBtn.classList.toggle('desc', sortDir === 'desc');
        _applyFilters();
    });

    // Action bar
    deselectBtn.addEventListener('click', _clearSelection);
    copyBtn.addEventListener('click', () => _openPicker('copy'));
    moveBtn.addEventListener('click', () => _openPicker('move'));
    deleteBtn.addEventListener('click', _showDeleteConfirm);
    unlikeAllBtn.addEventListener('click', _handleUnlikeAll);

    // Delete modal
    deleteCancelBtn.addEventListener('click', () => deleteOverlay.classList.add('hidden'));
    deleteConfirmBtn.addEventListener('click', _handleDelete);

    // Watch Later modal
    wlCloseBtn.addEventListener('click', () => wlOverlay.classList.add('hidden'));
    wlDismissBtn.addEventListener('click', () => wlOverlay.classList.add('hidden'));
    wlOverlay.addEventListener('click', (e) => {
        if (e.target === wlOverlay) wlOverlay.classList.add('hidden');
    });
    wlCreateBtn.addEventListener('click', _handleCreateWatchLater);

    // Delete playlist modal
    delPlaylistCancelBtn.addEventListener('click', () => delPlaylistOverlay.classList.add('hidden'));
    delPlaylistConfirmBtn.addEventListener('click', _handleDeletePlaylist);
    delPlaylistOverlay.addEventListener('click', (e) => {
        if (e.target === delPlaylistOverlay) delPlaylistOverlay.classList.add('hidden');
    });

    // Dead link modal
    cleanDeadBtn.addEventListener('click', _handleScanDeadLinks);
    deadlinkCancelBtn.addEventListener('click', () => deadlinkOverlay.classList.add('hidden'));
    deadlinkCleanBtn.addEventListener('click', _handleCleanDeadLinks);
    deadlinkOverlay.addEventListener('click', (e) => {
        if (e.target === deadlinkOverlay) deadlinkOverlay.classList.add('hidden');
    });

    // Dedup
    findDupesBtn.addEventListener('click', _handleScanDuplicates);
    dedupCleanBtn.addEventListener('click', _handleCleanDuplicates);

    // Subscriptions
    showSubsBtn.addEventListener('click', _handleShowSubscriptions);
    subsSortSelect.addEventListener('change', () => {
        setSubSort(subsSortSelect.value, 'asc');
        if (cachedSubs) renderSubscriptions(cachedSubs, cachedChannelDetails, _handleSubSelectionChange);
    });
    unsubBtn.addEventListener('click', _handleBatchUnsubscribe);

    // Close sidebar on main content click (mobile)
    document.getElementById('main-content').addEventListener('click', () => {
        sidebar.classList.remove('open');
    });

    // Show initial empty state
    _switchView('empty');
    showEmptyState();
}

// ---------- View Router ----------
function _switchView(viewName) {
    // Hide all view containers
    videoViewContainer.classList.add('hidden');
    subsListContainer.classList.add('hidden');
    dedupView.classList.add('hidden');
    document.getElementById('empty-state').classList.add('hidden');

    // Hide all action groups and filter bar
    videoActions.classList.add('hidden');
    subsActions.classList.add('hidden');
    dedupActions.classList.add('hidden');
    filterBar.classList.add('hidden');

    // Reset common header elements
    document.getElementById('video-count').textContent = '';

    if (viewName === 'video') {
        videoViewContainer.classList.remove('hidden');
        videoActions.classList.remove('hidden');
    } else if (viewName === 'subs') {
        subsListContainer.classList.remove('hidden');
        subsActions.classList.remove('hidden');
        contentTitle.textContent = 'Subscriptions';
    } else if (viewName === 'dedup') {
        dedupView.classList.remove('hidden');
        dedupActions.classList.remove('hidden');
        contentTitle.textContent = 'Deduplicate Videos';
    } else if (viewName === 'empty') {
        contentTitle.textContent = 'Select a playlist';
        document.getElementById('empty-state').classList.remove('hidden');
    }
}

// ---------- Auth Handlers ----------

async function _handleSignIn(token) {
    landingScreen.classList.add('hidden');
    mainApp.classList.remove('hidden');

    // Fetch user info for avatar
    try {
        const user = await fetchUserInfo();
        if (user?.picture) {
            userAvatar.src = user.picture;
            userAvatar.style.display = 'block';
        }
    } catch (e) {
        console.warn('Could not fetch user info:', e);
    }

    // Load playlists
    await _loadPlaylists();

    // Auto-select Liked Videos on initial load
    if (playlists.length > 0) {
        await _handlePlaylistSelect(LIKED_VIDEOS_ID);
    }
}

function _handleSignOut() {
    mainApp.classList.add('hidden');
    landingScreen.classList.remove('hidden');

    // Reset state
    playlists = [];
    currentPlaylistId = null;
    currentItems = [];
    filteredItems = [];
    selectedItems.clear();
    searchQuery = '';
    searchInput.value = '';
    contentTitle.textContent = 'Select a playlist';
    updateActionBar(0);
}

// ---------- Playlist Loading ----------

async function _loadPlaylists() {
    renderSidebarLoading();

    try {
        playlists = await fetchPlaylists();
        renderSidebar(playlists, currentPlaylistId, _handlePlaylistSelect, _showWatchLaterModal, _showDeletePlaylistConfirm);
        showToast(`Loaded ${playlists.filter(p => !p._locked).length} playlists`, 'success');
    } catch (e) {
        console.error('Failed to load playlists:', e);
        showToast('Failed to load playlists: ' + e.message, 'error');
    }
}

async function _handlePlaylistSelect(playlistId) {
    if (playlistId === currentPlaylistId) return;

    currentPlaylistId = playlistId;
    _clearSelection();
    searchInput.value = '';
    searchQuery = '';

    _switchView('video');

    // Update sidebar active state
    renderSidebar(playlists, currentPlaylistId, _handlePlaylistSelect, _showWatchLaterModal, _showDeletePlaylistConfirm);

    // Update header
    const playlist = playlists.find(p => p.id === playlistId);
    contentTitle.textContent = playlist?.snippet?.title || 'Playlist';

    // Toggle Unlike All visibility & update Delete/Unlike button
    const isLiked = playlistId === LIKED_VIDEOS_ID;
    unlikeAllBtn.classList.toggle('hidden', !isLiked);
    _updateDeleteButtonForPlaylist(isLiked);

    // Close mobile sidebar
    sidebar.classList.remove('open');

    // Load videos
    showLoading();
    try {
        if (playlistId === LIKED_VIDEOS_ID) {
            currentItems = await fetchLikedVideos();
        } else {
            currentItems = await fetchPlaylistItems(playlistId);
        }

        // Show filter bar and clean button
        filterBar.classList.remove('hidden');
        cleanDeadBtn.classList.toggle('hidden', playlistId === LIKED_VIDEOS_ID);

        _applyFilters();

        // Fetch durations in background (don't block rendering)
        const videoIds = currentItems.map(item =>
            item.contentDetails?.videoId || item.snippet?.resourceId?.videoId || item.id
        ).filter(Boolean);
        if (videoIds.length > 0) {
            fetchVideoDurations(videoIds).then(durations => {
                setVideoDurations(durations);
                // Re-render to show duration badges
                renderVideoGrid(filteredItems, new Set(selectedItems.keys()), _handleVideoToggle, searchQuery);
            }).catch(e => console.warn('Could not fetch durations:', e));
        }

        // After loading liked videos, update the count in the sidebar
        if (playlistId === LIKED_VIDEOS_ID) {
            const likedPlaylist = playlists.find(p => p.id === LIKED_VIDEOS_ID);
            if (likedPlaylist) {
                likedPlaylist.contentDetails.itemCount = currentItems.length;
            }
            renderSidebar(playlists, currentPlaylistId, _handlePlaylistSelect, _showWatchLaterModal, _showDeletePlaylistConfirm);
        }
    } catch (e) {
        console.error('Failed to load playlist items:', e);
        showToast('Failed to load videos: ' + e.message, 'error');
        showEmptyState('Failed to load videos');
    }
}

// ---------- Video Selection ----------

function _handleVideoToggle(itemId, videoId, isSelected) {
    if (isSelected) {
        selectedItems.set(itemId, videoId);
    } else {
        selectedItems.delete(itemId);
    }
    updateActionBar(selectedItems.size);
    renderVideoGrid(filteredItems, new Set(selectedItems.keys()), _handleVideoToggle, searchQuery);
}

function _handleSelectAll() {
    if (selectedItems.size === filteredItems.length) {
        // Deselect all
        _clearSelection();
    } else {
        // Select all
        selectedItems.clear();
        filteredItems.forEach(item => {
            const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId || '';
            selectedItems.set(item.id, videoId);
        });
        updateActionBar(selectedItems.size);
        renderVideoGrid(filteredItems, new Set(selectedItems.keys()), _handleVideoToggle, searchQuery);
        selectAllBtn.textContent = 'Deselect All';
    }
}

function _clearSelection() {
    selectedItems.clear();
    updateActionBar(0);
    selectAllBtn.textContent = 'Select All';
    renderVideoGrid(filteredItems, new Set(selectedItems.keys()), _handleVideoToggle, searchQuery);
}

// ---------- Search / Filter ----------

function _applyFilters() {
    const filters = { duration: durationFilter };
    filteredItems = filterVideos(currentItems, searchQuery, filters);
    filteredItems = sortVideos(filteredItems, sortBy, sortDir);
    if (filteredItems.length === 0 && (searchQuery || durationFilter !== 'all') && currentItems.length > 0) {
        showEmptyState('No videos match the current filters');
    } else {
        renderVideoGrid(filteredItems, new Set(selectedItems.keys()), _handleVideoToggle, searchQuery);
    }
}

function _handleSearch() {
    searchQuery = searchInput.value.trim();
    searchClearBtn.classList.toggle('hidden', !searchQuery);
    _applyFilters();
}

function _handleSearchClear() {
    searchInput.value = '';
    searchQuery = '';
    searchClearBtn.classList.add('hidden');
    _applyFilters();
}

// ---------- Batch Operations ----------

function _openPicker(mode) {
    openPlaylistPicker(
        mode,
        playlists,
        currentPlaylistId,
        (destPlaylistId) => _handleBatchOperation(mode, destPlaylistId),
        async (title, privacy) => {
            try {
                const newPlaylist = await createPlaylist(title, privacy);
                showToast(`Created playlist "${title}"`, 'success');
                // Refresh playlists
                playlists = await fetchPlaylists();
                renderSidebar(playlists, currentPlaylistId, _handlePlaylistSelect, _showWatchLaterModal, _showDeletePlaylistConfirm);
                return newPlaylist;
            } catch (e) {
                showToast('Failed to create playlist: ' + e.message, 'error');
                return null;
            }
        }
    );
}

async function _handleBatchOperation(mode, destPlaylistId) {
    const count = selectedItems.size;
    if (count === 0) return;

    const destPlaylist = playlists.find(p => p.id === destPlaylistId);
    const destName = destPlaylist?.snippet?.title || 'playlist';

    if (mode === 'copy') {
        showProgress(`Copying ${count} video${count > 1 ? 's' : ''} to "${destName}"...`);

        const videoIds = Array.from(selectedItems.values());
        const result = await batchCopy(destPlaylistId, videoIds, updateProgress);

        hideProgress();
        if (result.success > 0) {
            showToast(`Copied ${result.success} video${result.success > 1 ? 's' : ''} to "${destName}"`, 'success');
            // Note: copy doesn't remove from source — no undo needed for source
            // But we offer undo that removes the copies from destination
            pushUndo(`Copied ${result.success} video${result.success > 1 ? 's' : ''}`, async () => {
                // We can't easily identify the new playlistItemIds, so just show toast
                showToast('Undo for copy: please manually remove from destination', 'info');
            });
        }
        if (result.failed > 0) {
            showToast(`${result.failed} video${result.failed > 1 ? 's' : ''} failed to copy`, 'error');
        }
        _clearSelection();

    } else if (mode === 'move') {
        showProgress(`Moving ${count} video${count > 1 ? 's' : ''} to "${destName}"...`);

        const isLiked = currentPlaylistId === LIKED_VIDEOS_ID;

        if (isLiked) {
            // Move from Liked Videos = copy to dest + unlike
            const videoIds = Array.from(selectedItems.values());
            const total = videoIds.length * 2;
            let completed = 0;
            let success = 0;
            let failed = 0;

            for (let i = 0; i < videoIds.length; i++) {
                try {
                    await addVideoToPlaylist(destPlaylistId, videoIds[i]);
                    completed++;
                    updateProgress(completed, total);

                    await unlikeVideo(videoIds[i]);
                    completed++;
                    updateProgress(completed, total);

                    success++;
                } catch (e) {
                    console.error(`Failed to move liked video ${videoIds[i]}:`, e);
                    failed++;
                    completed += 2;
                    updateProgress(completed, total);
                }
            }

            hideProgress();
            if (success > 0) {
                showToast(`Moved ${success} video${success > 1 ? 's' : ''} to "${destName}"`, 'success');
                currentItems = currentItems.filter(i => !selectedItems.has(i.id));
                filteredItems = filterVideos(currentItems, searchQuery, { duration: durationFilter });

                // Push undo: re-like videos (dest copies stay)
                const undoIds = [...videoIds];
                pushUndo(`Moved ${success} video${success > 1 ? 's' : ''} from Liked Videos`, async () => {
                    for (const id of undoIds) {
                        await reLikeVideo(id);
                    }
                    await _handlePlaylistSelect(LIKED_VIDEOS_ID);
                });
            }
            if (failed > 0) {
                showToast(`${failed} video${failed > 1 ? 's' : ''} failed to move`, 'error');
            }
        } else {
            const items = Array.from(selectedItems.entries()).map(([playlistItemId, videoId]) => ({
                playlistItemId,
                videoId,
            }));
            const sourcePlaylistId = currentPlaylistId;
            const result = await batchMove(destPlaylistId, items, updateProgress);

            hideProgress();
            if (result.success > 0) {
                showToast(`Moved ${result.success} video${result.success > 1 ? 's' : ''} to "${destName}"`, 'success');
                currentItems = currentItems.filter(i => !selectedItems.has(i.id));
                filteredItems = filterVideos(currentItems, searchQuery, { duration: durationFilter });

                // Push undo: re-add to source playlist
                const undoVideoIds = items.map(i => i.videoId);
                const undoSourceId = sourcePlaylistId;
                pushUndo(`Moved ${result.success} video${result.success > 1 ? 's' : ''}`, async () => {
                    for (const vid of undoVideoIds) {
                        await addVideoToPlaylist(undoSourceId, vid);
                    }
                    await _handlePlaylistSelect(undoSourceId);
                });
            }
            if (result.failed > 0) {
                showToast(`${result.failed} video${result.failed > 1 ? 's' : ''} failed to move`, 'error');
            }
        }

        _clearSelection();
        renderVideoGrid(filteredItems, new Set(), _handleVideoToggle, searchQuery);

        // Refresh playlists to update counts
        playlists = await fetchPlaylists();
        renderSidebar(playlists, currentPlaylistId, _handlePlaylistSelect, _showWatchLaterModal, _showDeletePlaylistConfirm);
    }
}

// ---------- Delete / Unlike ----------

const DELETE_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`;
const UNLIKE_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/><line x1="4" y1="4" x2="20" y2="20"/></svg>`;

function _updateDeleteButtonForPlaylist(isLiked) {
    if (isLiked) {
        deleteBtn.innerHTML = `${UNLIKE_ICON_SVG} Unlike`;
        deleteBtn.title = 'Unlike selected videos';
    } else {
        deleteBtn.innerHTML = `${DELETE_ICON_SVG} Delete`;
        deleteBtn.title = 'Delete selected videos from playlist';
    }
}

function _showDeleteConfirm() {
    const count = selectedItems.size;
    if (count === 0) return;

    const isLiked = currentPlaylistId === LIKED_VIDEOS_ID;
    if (isLiked) {
        deleteModalTitle.textContent = 'Confirm Unlike';
        deleteMessage.innerHTML = `Unlike <strong>${count} video${count > 1 ? 's' : ''}</strong>? They will be removed from your Liked Videos.`;
        deleteNote.textContent = 'This will remove your "like" from these videos.';
        deleteConfirmBtn.textContent = 'Unlike';
    } else {
        deleteModalTitle.textContent = 'Confirm Delete';
        deleteMessage.innerHTML = `Remove <strong>${count} video${count > 1 ? 's' : ''}</strong> from this playlist?`;
        deleteNote.textContent = "This won't delete the videos from YouTube — only removes them from the playlist.";
        deleteConfirmBtn.textContent = 'Delete';
    }
    deleteOverlay.classList.remove('hidden');
}

async function _handleUnlikeAll() {
    if (currentPlaylistId !== LIKED_VIDEOS_ID || currentItems.length === 0) return;

    // Select all and show unlike confirm
    selectedItems.clear();
    currentItems.forEach(item => {
        const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId || item.id;
        selectedItems.set(item.id, videoId);
    });
    updateActionBar(selectedItems.size);
    renderVideoGrid(filteredItems, new Set(selectedItems.keys()), _handleVideoToggle, searchQuery);

    _showDeleteConfirm();
}

async function _handleDelete() {
    deleteOverlay.classList.add('hidden');

    const count = selectedItems.size;
    const isLiked = currentPlaylistId === LIKED_VIDEOS_ID;

    if (isLiked) {
        showProgress(`Unliking ${count} video${count > 1 ? 's' : ''}...`);
        const videoIds = Array.from(selectedItems.values());
        const result = await batchUnlike(videoIds, updateProgress);

        hideProgress();
        if (result.success > 0) {
            showToast(`Unliked ${result.success} video${result.success > 1 ? 's' : ''}`, 'success');
            currentItems = currentItems.filter(i => !selectedItems.has(i.id));
            filteredItems = filterVideos(currentItems, searchQuery, { duration: durationFilter });

            // Push undo: re-like videos
            const undoIds = [...videoIds];
            pushUndo(`Unliked ${result.success} video${result.success > 1 ? 's' : ''}`, async () => {
                for (const id of undoIds) {
                    await reLikeVideo(id);
                }
                await _handlePlaylistSelect(LIKED_VIDEOS_ID);
            });
        }
        if (result.failed > 0) {
            showToast(`${result.failed} video${result.failed > 1 ? 's' : ''} failed to unlike`, 'error');
        }
    } else {
        showProgress(`Deleting ${count} video${count > 1 ? 's' : ''} from playlist...`);
        const itemIds = Array.from(selectedItems.keys());
        const videoIds = Array.from(selectedItems.values());
        const playlistId = currentPlaylistId;
        const result = await batchDelete(itemIds, updateProgress);

        hideProgress();
        if (result.success > 0) {
            showToast(`Deleted ${result.success} video${result.success > 1 ? 's' : ''} from playlist`, 'success');
            currentItems = currentItems.filter(i => !selectedItems.has(i.id));
            filteredItems = filterVideos(currentItems, searchQuery, { duration: durationFilter });

            // Push undo: re-add videos
            const undoVideoIds = [...videoIds];
            const undoPlaylistId = playlistId;
            pushUndo(`Deleted ${result.success} video${result.success > 1 ? 's' : ''}`, async () => {
                for (const vid of undoVideoIds) {
                    await addVideoToPlaylist(undoPlaylistId, vid);
                }
                await _handlePlaylistSelect(undoPlaylistId);
            });
        }
        if (result.failed > 0) {
            showToast(`${result.failed} video${result.failed > 1 ? 's' : ''} failed to delete`, 'error');
        }
    }

    _clearSelection();
    renderVideoGrid(filteredItems, new Set(), _handleVideoToggle, searchQuery);

    // Refresh playlists to update counts
    playlists = await fetchPlaylists();
    renderSidebar(playlists, currentPlaylistId, _handlePlaylistSelect, _showWatchLaterModal, _showDeletePlaylistConfirm);
}

// ---------- Dead Link Cleaner ----------

async function _handleScanDeadLinks() {
    if (!currentItems || currentItems.length === 0) {
        showToast('No videos to scan', 'info');
        return;
    }

    showToast('Scanning for dead links...', 'info');

    try {
        const dead = await findDeadLinks(currentItems);
        pendingDeadLinks = dead;

        if (dead.length === 0) {
            showToast('No dead links found — playlist is clean!', 'success');
            return;
        }

        deadlinkSummary.textContent = `Found ${dead.length} dead/unavailable video${dead.length > 1 ? 's' : ''}:`;
        deadlinkList.innerHTML = dead.map(d => `
            <div class="deadlink-item">
                <span class="deadlink-title">${d.title || d.videoId}</span>
                <span class="deadlink-badge ${d.reason.toLowerCase()}">${d.reason}</span>
            </div>
        `).join('');

        deadlinkOverlay.classList.remove('hidden');
    } catch (e) {
        console.error('Dead link scan failed:', e);
        showToast('Failed to scan for dead links: ' + e.message, 'error');
    }
}

async function _handleCleanDeadLinks() {
    deadlinkOverlay.classList.add('hidden');

    const count = pendingDeadLinks.length;
    if (count === 0) return;

    showProgress(`Removing ${count} dead link${count > 1 ? 's' : ''}...`);
    const itemIds = pendingDeadLinks.map(d => d.playlistItemId);
    const result = await batchDelete(itemIds, updateProgress);

    hideProgress();
    if (result.success > 0) {
        showToast(`Removed ${result.success} dead link${result.success > 1 ? 's' : ''}`, 'success');
        currentItems = currentItems.filter(i => !itemIds.includes(i.id));
        _applyFilters();

        // Push undo (re-add if possible — note: deleted videos can't be re-added)
        pushUndo(`Removed ${result.success} dead link${result.success > 1 ? 's' : ''}`, async () => {
            showToast('Dead links cannot be restored (videos are deleted/private)', 'info');
        });
    }
    if (result.failed > 0) {
        showToast(`${result.failed} item${result.failed > 1 ? 's' : ''} failed to remove`, 'error');
    }

    pendingDeadLinks = [];

    // Refresh playlists to update counts
    playlists = await fetchPlaylists();
    renderSidebar(playlists, currentPlaylistId, _handlePlaylistSelect, _showWatchLaterModal, _showDeletePlaylistConfirm);
}

// ---------- Subscription Management ----------

async function _handleShowSubscriptions() {
    _switchView('subs');
    currentPlaylistId = null;
    renderSidebar(playlists, currentPlaylistId, _handlePlaylistSelect, _showWatchLaterModal, _showDeletePlaylistConfirm);
    showSubsLoading();


    try {
        if (!cachedSubs) {
            cachedSubs = await fetchSubscriptions();
        }

        // Fetch channel details
        if (!cachedChannelDetails) {
            const channelIds = cachedSubs.map(s => s.snippet?.resourceId?.channelId).filter(Boolean);
            cachedChannelDetails = await fetchChannelDetails(channelIds);
        }

        renderSubscriptions(cachedSubs, cachedChannelDetails, _handleSubSelectionChange);
    } catch (e) {
        console.error('Failed to load subscriptions:', e);
        showToast('Failed to load subscriptions: ' + e.message, 'error');
    }
}

function _handleSubSelectionChange(count) {
    if (count > 0) {
        subsSelectionCount.classList.remove('hidden');
        unsubBtn.classList.remove('hidden');
        subsSelectionCount.textContent = `${count} channel${count > 1 ? 's' : ''} selected`;
    } else {
        subsSelectionCount.classList.add('hidden');
        unsubBtn.classList.add('hidden');
    }
}

async function _handleBatchUnsubscribe() {
    const subIds = getSelectedSubIds();
    if (subIds.length === 0) return;

    const confirmed = confirm(`Unsubscribe from ${subIds.length} channel${subIds.length > 1 ? 's' : ''}? This action cannot be undone.`);
    if (!confirmed) return;

    showProgress(`Unsubscribing from ${subIds.length} channel${subIds.length > 1 ? 's' : ''}...`);
    const result = await batchUnsubscribe(subIds, updateProgress);

    hideProgress();
    if (result.success > 0) {
        showToast(`Unsubscribed from ${result.success} channel${result.success > 1 ? 's' : ''}`, 'success');
        // Remove from cache
        cachedSubs = cachedSubs.filter(s => !subIds.includes(s.id));
        clearSubSelection();
        subsSelectionCount.classList.add('hidden');
        unsubBtn.classList.add('hidden');
        renderSubscriptions(cachedSubs, cachedChannelDetails, _handleSubSelectionChange);
    }
    if (result.failed > 0) {
        showToast(`${result.failed} channel${result.failed > 1 ? 's' : ''} failed to unsubscribe`, 'error');
    }
}

// ---------- Cross-Playlist Dedup ----------

async function _handleScanDuplicates() {
    if (!playlists || playlists.length === 0) {
        showToast('No playlists to scan', 'info');
        return;
    }

    _switchView('dedup');
    currentPlaylistId = null;
    renderSidebar(playlists, currentPlaylistId, _handlePlaylistSelect, _showWatchLaterModal, _showDeletePlaylistConfirm);

    showToast('Scanning all playlists for duplicates...', 'info');

    try {
        const duplicates = await scanForDuplicates(playlists, (done, total) => {
            showToast(`Scanning playlist ${done}/${total}...`, 'info');
        });

        pendingDuplicates = duplicates;

        if (duplicates.length === 0) {
            showToast('No duplicates found — all playlists are clean!', 'success');
            dedupSummary.textContent = '';
            dedupList.innerHTML = `
                <div class="empty-state" style="display:flex; flex-direction:column; align-items:center; padding-top: 60px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" class="empty-icon" style="width: 48px; height: 48px; margin-bottom: 20px;">
                        <rect x="2" y="6" width="20" height="12" rx="2" />
                        <polygon points="10,9 16,12 10,15" />
                    </svg>
                    <p style="color: var(--text-tertiary);">No duplicate videos found — all playlists are clean!</p>
                </div>
            `;
            document.getElementById('btn-dedup-clean').classList.add('hidden');
            return;
        }

        const totalExtras = duplicates.reduce((sum, d) => sum + d.locations.length - 1, 0);
        dedupSummary.textContent = `Found ${duplicates.length} video${duplicates.length > 1 ? 's' : ''} appearing in multiple playlists (${totalExtras} extra${totalExtras > 1 ? 's' : ''} to remove):`;

        dedupList.innerHTML = duplicates.map(d => {
            const locationsHtml = d.locations.map((loc, i) => {
                const cls = i === 0 ? 'keep' : 'remove';
                const label = i === 0 ? '✓ keep' : '✕ remove';
                return `<span class="dedup-tag ${cls}" title="${label}">${loc.playlistTitle}</span>`;
            }).join('');

            return `
                <div class="dedup-group">
                    <div class="dedup-group-title">
                        ${d.title}
                        <span class="dedup-group-count">${d.locations.length}×</span>
                    </div>
                    <div class="dedup-locations">${locationsHtml}</div>
                </div>
            `;
        }).join('');
        
        document.getElementById('btn-dedup-clean').classList.remove('hidden');
    } catch (e) {
        console.error('Duplicate scan failed:', e);
        showToast('Failed to scan for duplicates: ' + e.message, 'error');
    }
}

async function _handleCleanDuplicates() {
    // Collect all "extra" playlistItemIds (skip first in each group = keep)
    const itemsToRemove = [];
    pendingDuplicates.forEach(d => {
        d.locations.slice(1).forEach(loc => {
            itemsToRemove.push(loc.playlistItemId);
        });
    });

    if (itemsToRemove.length === 0) return;

    showProgress(`Removing ${itemsToRemove.length} duplicate${itemsToRemove.length > 1 ? 's' : ''}...`);
    const result = await batchDelete(itemsToRemove, updateProgress);

    hideProgress();
    if (result.success > 0) {
        showToast(`Removed ${result.success} duplicate${result.success > 1 ? 's' : ''}`, 'success');

        // Build undo data: re-add to playlists
        const undoItems = [];
        pendingDuplicates.forEach(d => {
            d.locations.slice(1).forEach(loc => {
                undoItems.push({ playlistId: loc.playlistId, videoId: d.videoId });
            });
        });

        pushUndo(`Removed ${result.success} duplicate${result.success > 1 ? 's' : ''}`, async () => {
            for (const item of undoItems) {
                await addVideoToPlaylist(item.playlistId, item.videoId);
            }
            showToast('Duplicates restored', 'success');
        });
    }
    if (result.failed > 0) {
        showToast(`${result.failed} item${result.failed > 1 ? 's' : ''} failed to remove`, 'error');
    }

    pendingDuplicates = [];

    // Reload current playlist if affected
    if (currentPlaylistId) {
        await _handlePlaylistSelect(currentPlaylistId);
    }

    // Refresh playlists to update counts
    playlists = await fetchPlaylists();
    renderSidebar(playlists, currentPlaylistId, _handlePlaylistSelect, _showWatchLaterModal, _showDeletePlaylistConfirm);
}

// ---------- Watch Later Workaround ----------

function _showWatchLaterModal() {
    wlCreateStatus.textContent = '';
    wlCreateBtn.disabled = false;
    wlCreateBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Create "My Watch Later"
    `;
    wlOverlay.classList.remove('hidden');
}

async function _handleCreateWatchLater() {
    wlCreateBtn.disabled = true;
    wlCreateBtn.textContent = 'Creating...';
    wlCreateStatus.textContent = '';

    try {
        const newPlaylist = await createPlaylist('My Watch Later', 'private');
        if (newPlaylist) {
            wlCreateStatus.textContent = '✓ Created!';
            wlCreateBtn.textContent = 'Created!';
            showToast('Created "My Watch Later" playlist', 'success');

            // Refresh playlists
            playlists = await fetchPlaylists();
            renderSidebar(playlists, currentPlaylistId, _handlePlaylistSelect, _showWatchLaterModal, _showDeletePlaylistConfirm);
        }
    } catch (e) {
        wlCreateStatus.textContent = '';
        wlCreateBtn.disabled = false;
        wlCreateBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Create "My Watch Later"
        `;
        showToast('Failed to create playlist: ' + e.message, 'error');
    }
}

// ---------- Delete Playlist ----------

function _showDeletePlaylistConfirm(playlistId, title) {
    pendingDeletePlaylistId = playlistId;
    delPlaylistName.textContent = title;
    delPlaylistConfirmBtn.disabled = false;
    delPlaylistConfirmBtn.textContent = 'Delete Playlist';
    delPlaylistOverlay.classList.remove('hidden');
}

async function _handleDeletePlaylist() {
    if (!pendingDeletePlaylistId) return;

    const playlistId = pendingDeletePlaylistId;
    const playlist = playlists.find(p => p.id === playlistId);
    const title = playlist?.snippet?.title || 'playlist';

    delPlaylistConfirmBtn.disabled = true;
    delPlaylistConfirmBtn.textContent = 'Deleting...';

    try {
        await deletePlaylist(playlistId);
        delPlaylistOverlay.classList.add('hidden');
        showToast(`Deleted playlist "${title}"`, 'success');

        // If we deleted the currently active playlist, clear the view
        if (currentPlaylistId === playlistId) {
            currentPlaylistId = null;
            currentItems = [];
            filteredItems = [];
            _clearSelection();
            contentTitle.textContent = 'Select a playlist';
            showEmptyState();
        }

        // Refresh playlists
        playlists = await fetchPlaylists();
        renderSidebar(playlists, currentPlaylistId, _handlePlaylistSelect, _showWatchLaterModal, _showDeletePlaylistConfirm);
    } catch (e) {
        delPlaylistOverlay.classList.add('hidden');
        showToast('Failed to delete playlist: ' + e.message, 'error');
    }

    pendingDeletePlaylistId = null;
}

// ---------- Quota UI ----------

function _updateQuotaUI(used, limit) {
    const fill = document.getElementById('quota-fill');
    const text = document.getElementById('quota-text');

    const pct = Math.min(100, Math.round((used / limit) * 100));
    fill.style.width = `${pct}%`;
    text.textContent = `${pct}%`;

    fill.classList.remove('warning', 'danger');
    if (pct >= 80) fill.classList.add('danger');
    else if (pct >= 50) fill.classList.add('warning');
}
window.__testLogin = _handleSignIn;
