// ============================================
// TidyTube — YouTube Data API v3 Wrapper
// ============================================

import { getAccessToken, refreshToken } from './auth.js';

const API_BASE = 'https://www.googleapis.com/youtube/v3';

// Sentinel IDs for special playlists
export const LIKED_VIDEOS_ID = '__liked_videos__';
export const WATCH_LATER_ID = '__watch_later__';

// Quota tracking (resets daily at midnight PT)
let quotaUsed = 0;
const QUOTA_LIMIT = 10000;
const QUOTA_KEY = 'tidytube_quota';
const QUOTA_DATE_KEY = 'tidytube_quota_date';

// Initialize quota from storage
function _initQuota() {
    const savedDate = localStorage.getItem(QUOTA_DATE_KEY);
    const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' });
    if (savedDate === today) {
        quotaUsed = parseInt(localStorage.getItem(QUOTA_KEY) || '0');
    } else {
        quotaUsed = 0;
        localStorage.setItem(QUOTA_DATE_KEY, today);
        localStorage.setItem(QUOTA_KEY, '0');
    }
}

function _addQuota(units) {
    quotaUsed += units;
    const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' });
    localStorage.setItem(QUOTA_KEY, quotaUsed.toString());
    localStorage.setItem(QUOTA_DATE_KEY, today);
    _notifyQuotaChange();
}

let quotaChangeCallback = null;

export function onQuotaChange(cb) {
    quotaChangeCallback = cb;
}

function _notifyQuotaChange() {
    if (quotaChangeCallback) {
        quotaChangeCallback(quotaUsed, QUOTA_LIMIT);
    }
}

export function getQuota() {
    _initQuota();
    return { used: quotaUsed, limit: QUOTA_LIMIT };
}

// ---------- Core Fetch Helper ----------

async function _apiFetch(endpoint, options = {}) {
    let token = getAccessToken();
    if (!token) {
        try {
            token = await refreshToken();
        } catch {
            throw new Error('Not authenticated. Please sign in again.');
        }
    }

    const url = new URL(`${API_BASE}/${endpoint}`);
    if (options.params) {
        for (const [key, value] of Object.entries(options.params)) {
            url.searchParams.set(key, value);
        }
    }

    const fetchOptions = {
        method: options.method || 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    };

    if (options.body) {
        fetchOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(url.toString(), fetchOptions);

    if (response.status === 401) {
        // Token expired, try refresh
        try {
            token = await refreshToken();
            fetchOptions.headers['Authorization'] = `Bearer ${token}`;
            const retryResponse = await fetch(url.toString(), fetchOptions);
            if (!retryResponse.ok) {
                const err = await retryResponse.json();
                throw new Error(err.error?.message || `API error: ${retryResponse.status}`);
            }
            return retryResponse.status === 204 ? null : retryResponse.json();
        } catch {
            throw new Error('Session expired. Please sign in again.');
        }
    }

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `API error: ${response.status}`);
    }

    return response.status === 204 ? null : response.json();
}

// ---------- User Info ----------

export async function fetchUserInfo() {
    const token = getAccessToken();
    if (!token) return null;

    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) return null;
    return response.json();
}

// ---------- Playlists ----------

/**
 * Fetch all playlists for the authenticated user
 * Quota: 1 unit per page
 */
export async function fetchPlaylists() {
    _initQuota();
    const playlists = [];
    let pageToken = '';

    do {
        const params = {
            part: 'snippet,contentDetails',
            mine: 'true',
            maxResults: '50',
        };
        if (pageToken) params.pageToken = pageToken;

        const data = await _apiFetch('playlists', { params });
        _addQuota(1);

        if (data.items) {
            playlists.push(...data.items);
        }
        pageToken = data.nextPageToken || '';
    } while (pageToken);

    // Read cached liked video count
    const cachedLikedCount = localStorage.getItem('tidytube_liked_count');

    // Always add Liked Videos at the top (uses videos.list?myRating=like endpoint)
    playlists.unshift({
        id: LIKED_VIDEOS_ID,
        snippet: {
            title: 'Liked Videos',
            thumbnails: { default: { url: '' } },
        },
        contentDetails: { itemCount: cachedLikedCount || '?' },
        _isSpecial: true,
        _type: 'likes',
    });

    // Add Watch Later right after Liked Videos (locked — API blocks access)
    playlists.splice(1, 0, {
        id: WATCH_LATER_ID,
        snippet: {
            title: 'Watch Later',
            thumbnails: { default: { url: '' } },
        },
        contentDetails: { itemCount: '?' },
        _isSpecial: true,
        _type: 'watchLater',
        _locked: true,
    });

    return playlists;
}

// ---------- Playlist Items ----------

/**
 * Fetch all items in a playlist (paginated)
 * Quota: 1 unit per page
 */
export async function fetchPlaylistItems(playlistId) {
    const items = [];
    let pageToken = '';

    do {
        const params = {
            part: 'snippet,contentDetails',
            playlistId,
            maxResults: '50',
        };
        if (pageToken) params.pageToken = pageToken;

        const data = await _apiFetch('playlistItems', { params });
        _addQuota(1);

        if (data.items) {
            // Filter out deleted/private videos
            const validItems = data.items.filter(item =>
                item.snippet.title !== 'Deleted video' &&
                item.snippet.title !== 'Private video'
            );
            items.push(...validItems);
        }
        pageToken = data.nextPageToken || '';
    } while (pageToken);

    return items;
}

/**
 * Delete a single playlist item
 * Quota: 50 units
 */
export async function deletePlaylistItem(playlistItemId) {
    await _apiFetch('playlistItems', {
        method: 'DELETE',
        params: { id: playlistItemId },
    });
    _addQuota(50);
}

// ---------- Video Metadata ----------

/**
 * Parse ISO 8601 duration (PT1H2M3S) to seconds
 */
function _parseDuration(iso) {
    const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    const h = parseInt(match[1] || '0');
    const m = parseInt(match[2] || '0');
    const s = parseInt(match[3] || '0');
    return h * 3600 + m * 60 + s;
}

/**
 * Fetch durations for a list of video IDs
 * Batches up to 50 per request (1 quota unit each)
 * @returns {Map<string, number>} videoId → duration in seconds
 */
export async function fetchVideoDurations(videoIds) {
    const durations = new Map();

    for (let i = 0; i < videoIds.length; i += 50) {
        const batch = videoIds.slice(i, i + 50);
        const data = await _apiFetch('videos', {
            params: {
                part: 'contentDetails',
                id: batch.join(','),
            },
        });
        _addQuota(1);

        if (data.items) {
            data.items.forEach(video => {
                durations.set(video.id, _parseDuration(video.contentDetails.duration));
            });
        }
    }

    return durations;
}

/**
 * Scan all playlists for duplicate videos
 * @param {Array} playlists - array of playlist objects
 * @param {function} onProgress - callback(completed, total)
 * @returns {Array<{videoId: string, title: string, locations: Array<{playlistId, playlistItemId, playlistTitle}>}>}
 */
export async function scanForDuplicates(playlists, onProgress) {
    const videoMap = new Map(); // videoId → { title, locations: [...] }
    const scannable = playlists.filter(p => !p._locked && p.id !== LIKED_VIDEOS_ID && p.id !== WATCH_LATER_ID);
    let completed = 0;

    for (const playlist of scannable) {
        try {
            const items = await fetchPlaylistItems(playlist.id);
            items.forEach(item => {
                const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId || '';
                if (!videoId) return;

                if (!videoMap.has(videoId)) {
                    videoMap.set(videoId, {
                        videoId,
                        title: item.snippet?.title || 'Untitled',
                        locations: [],
                    });
                }

                videoMap.get(videoId).locations.push({
                    playlistId: playlist.id,
                    playlistItemId: item.id,
                    playlistTitle: playlist.snippet?.title || 'Unknown',
                });
            });
        } catch (e) {
            console.warn(`Failed to scan playlist ${playlist.snippet?.title}:`, e);
        }

        completed++;
        if (onProgress) onProgress(completed, scannable.length);
    }

    // Return only entries with 2+ locations (actual duplicates)
    return Array.from(videoMap.values()).filter(v => v.locations.length > 1);
}

/**
 * Check which videos are dead (deleted, private, unavailable)
 * @param {Array<{videoId: string, playlistItemId: string}>} items
 * @returns {Array<{videoId: string, playlistItemId: string, title: string, reason: string}>}
 */
export async function findDeadLinks(items) {
    const dead = [];
    const knownTitles = new Map();

    // Build title lookup from items
    items.forEach(item => {
        const title = item.snippet?.title || '';
        const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId || item.id;
        knownTitles.set(videoId, title);
    });

    // Check in batches of 50
    const videoIds = items.map(item =>
        item.contentDetails?.videoId || item.snippet?.resourceId?.videoId || item.id
    ).filter(Boolean);

    const validIds = new Set();

    for (let i = 0; i < videoIds.length; i += 50) {
        const batch = videoIds.slice(i, i + 50);
        const data = await _apiFetch('videos', {
            params: {
                part: 'status,snippet',
                id: batch.join(','),
            },
        });
        _addQuota(1);

        if (data.items) {
            data.items.forEach(v => validIds.add(v.id));
        }
    }

    // Videos not returned = deleted
    items.forEach(item => {
        const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId || item.id;
        const playlistItemId = item.id;
        const title = knownTitles.get(videoId) || 'Unknown';

        if (!validIds.has(videoId)) {
            dead.push({ videoId, playlistItemId, title, reason: 'Deleted' });
        } else if (title === 'Deleted video') {
            dead.push({ videoId, playlistItemId, title, reason: 'Deleted' });
        } else if (title === 'Private video') {
            dead.push({ videoId, playlistItemId, title, reason: 'Private' });
        }
    });

    return dead;
}

// ---------- Liked Videos ----------

/**
 * Fetch liked videos using videos.list?myRating=like
 * This is the only reliable way to get liked videos (playlistItems.list is deprecated for LL)
 * Quota: 1 unit per page
 * Returns items in the same shape as fetchPlaylistItems for compatibility
 */
export async function fetchLikedVideos() {
    const items = [];
    let pageToken = '';

    do {
        const params = {
            part: 'snippet,contentDetails',
            myRating: 'like',
            maxResults: '50',
        };
        if (pageToken) params.pageToken = pageToken;

        const data = await _apiFetch('videos', { params });
        _addQuota(1);

        if (data.items) {
            // Normalize video objects to look like playlistItem objects
            const normalized = data.items
                .filter(item =>
                    item.snippet.title !== 'Deleted video' &&
                    item.snippet.title !== 'Private video'
                )
                .map(video => ({
                    // Use the video ID as both the item ID and video ID
                    // (Liked Videos don't have a separate playlistItemId)
                    id: video.id,
                    contentDetails: {
                        videoId: video.id,
                    },
                    snippet: {
                        title: video.snippet.title,
                        thumbnails: video.snippet.thumbnails,
                        videoOwnerChannelTitle: video.snippet.channelTitle,
                        resourceId: {
                            kind: 'youtube#video',
                            videoId: video.id,
                        },
                    },
                    _isLikedVideo: true,
                }));
            items.push(...normalized);
        }
        pageToken = data.nextPageToken || '';
    } while (pageToken);

    // Cache the count for sidebar display
    localStorage.setItem('tidytube_liked_count', items.length.toString());

    return items;
}

/**
 * Unlike a video (remove from Liked Videos)
 * Uses videos.rate with rating=none
 * Quota: 50 units
 */
export async function unlikeVideo(videoId) {
    await _apiFetch('videos/rate', {
        method: 'POST',
        params: { id: videoId, rating: 'none' },
    });
    _addQuota(50);
}

/**
 * Re-like a video (undo an unlike)
 * Uses videos.rate with rating=like
 * Quota: 50 units
 */
export async function reLikeVideo(videoId) {
    await _apiFetch('videos/rate', {
        method: 'POST',
        params: { id: videoId, rating: 'like' },
    });
    _addQuota(50);
}

/**
 * Batch unlike videos (remove from Liked Videos)
 * @param {string[]} videoIds
 * @param {function} onProgress
 */
export async function batchUnlike(videoIds, onProgress) {
    let success = 0;
    let failed = 0;

    for (let i = 0; i < videoIds.length; i++) {
        try {
            await unlikeVideo(videoIds[i]);
            success++;
        } catch (e) {
            console.error(`Failed to unlike video ${videoIds[i]}:`, e);
            failed++;
        }
        if (onProgress) onProgress(i + 1, videoIds.length);
        if (i < videoIds.length - 1) {
            await _delay(200);
        }
    }

    return { success, failed };
}

/**
 * Add a video to a playlist
 * Quota: 50 units
 */
export async function addVideoToPlaylist(playlistId, videoId) {
    const result = await _apiFetch('playlistItems', {
        method: 'POST',
        params: { part: 'snippet' },
        body: {
            snippet: {
                playlistId,
                resourceId: {
                    kind: 'youtube#video',
                    videoId,
                },
            },
        },
    });
    _addQuota(50);
    return result;
}

/**
 * Create a new playlist
 * Quota: 50 units
 */
export async function createPlaylist(title, privacyStatus = 'private') {
    const result = await _apiFetch('playlists', {
        method: 'POST',
        params: { part: 'snippet,status' },
        body: {
            snippet: { title },
            status: { privacyStatus },
        },
    });
    _addQuota(50);
    return result;
}

/**
 * Delete an entire playlist
 * Quota: 50 units
 */
export async function deletePlaylist(playlistId) {
    await _apiFetch('playlists', {
        method: 'DELETE',
        params: { id: playlistId },
    });
    _addQuota(50);
}

// ---------- Batch Operations ----------

/**
 * Batch delete items from a playlist
 * @param {string[]} playlistItemIds - Array of playlist item IDs
 * @param {function} onProgress - Callback (completed, total)
 * @returns {Promise<{success: number, failed: number}>}
 */
export async function batchDelete(playlistItemIds, onProgress) {
    let success = 0;
    let failed = 0;

    for (let i = 0; i < playlistItemIds.length; i++) {
        try {
            await deletePlaylistItem(playlistItemIds[i]);
            success++;
        } catch (e) {
            console.error(`Failed to delete item ${playlistItemIds[i]}:`, e);
            failed++;
        }
        if (onProgress) onProgress(i + 1, playlistItemIds.length);
        // Small delay to avoid rate limiting
        if (i < playlistItemIds.length - 1) {
            await _delay(200);
        }
    }

    return { success, failed };
}

/**
 * Batch copy videos to a destination playlist
 * @param {string} destPlaylistId
 * @param {string[]} videoIds
 * @param {function} onProgress
 */
export async function batchCopy(destPlaylistId, videoIds, onProgress) {
    let success = 0;
    let failed = 0;

    for (let i = 0; i < videoIds.length; i++) {
        try {
            await addVideoToPlaylist(destPlaylistId, videoIds[i]);
            success++;
        } catch (e) {
            console.error(`Failed to copy video ${videoIds[i]}:`, e);
            failed++;
        }
        if (onProgress) onProgress(i + 1, videoIds.length);
        if (i < videoIds.length - 1) {
            await _delay(200);
        }
    }

    return { success, failed };
}

/**
 * Batch move videos: copy to dest + delete from source
 * @param {string} destPlaylistId
 * @param {Array<{playlistItemId: string, videoId: string}>} items
 * @param {function} onProgress
 */
export async function batchMove(destPlaylistId, items, onProgress) {
    let success = 0;
    let failed = 0;
    const total = items.length * 2; // copy + delete for each

    for (let i = 0; i < items.length; i++) {
        try {
            // Step 1: Copy to destination
            await addVideoToPlaylist(destPlaylistId, items[i].videoId);
            if (onProgress) onProgress(i * 2 + 1, total);

            // Step 2: Delete from source
            await deletePlaylistItem(items[i].playlistItemId);
            if (onProgress) onProgress(i * 2 + 2, total);

            success++;
        } catch (e) {
            console.error(`Failed to move item ${items[i].videoId}:`, e);
            failed++;
            if (onProgress) onProgress(i * 2 + 2, total);
        }
        if (i < items.length - 1) {
            await _delay(200);
        }
    }

    return { success, failed };
}

function _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------- Subscriptions ----------

/**
 * Fetch all subscriptions for the authenticated user
 * Quota: 1 unit per page
 */
export async function fetchSubscriptions() {
    const subs = [];
    let pageToken = '';

    do {
        const params = {
            part: 'snippet',
            mine: true,
            maxResults: 50,
        };
        if (pageToken) params.pageToken = pageToken;

        const data = await _apiFetch('subscriptions', { params });
        _addQuota(1);

        if (data.items) {
            subs.push(...data.items);
        }
        pageToken = data.nextPageToken || '';
    } while (pageToken);

    return subs;
}

/**
 * Fetch channel details (for last upload date, subscriber count)
 * @param {string[]} channelIds
 * @returns {Map<string, {lastUpload: string, subscriberCount: number, videoCount: number}>}
 */
export async function fetchChannelDetails(channelIds) {
    const details = new Map();

    for (let i = 0; i < channelIds.length; i += 50) {
        const batch = channelIds.slice(i, i + 50);
        const data = await _apiFetch('channels', {
            params: {
                part: 'snippet,statistics,contentDetails',
                id: batch.join(','),
            },
        });
        _addQuota(1);

        if (data.items) {
            data.items.forEach(ch => {
                // Try to get last upload from activity — not available directly,
                // but we can use the uploads playlist's last video
                details.set(ch.id, {
                    subscriberCount: parseInt(ch.statistics?.subscriberCount || '0'),
                    videoCount: parseInt(ch.statistics?.videoCount || '0'),
                    publishedAt: ch.snippet?.publishedAt || '',
                    thumbnail: ch.snippet?.thumbnails?.default?.url || '',
                });
            });
        }
    }

    return details;
}

/**
 * Unsubscribe from a channel
 * @param {string} subscriptionId - the subscription resource ID (not channel ID)
 * Quota: 50 units
 */
export async function unsubscribeChannel(subscriptionId) {
    await _apiFetch('subscriptions', {
        method: 'DELETE',
        params: { id: subscriptionId },
    });
    _addQuota(50);
}

/**
 * Batch unsubscribe from channels
 * @param {string[]} subscriptionIds
 * @param {function} onProgress
 */
export async function batchUnsubscribe(subscriptionIds, onProgress) {
    let success = 0;
    let failed = 0;

    for (let i = 0; i < subscriptionIds.length; i++) {
        try {
            await unsubscribeChannel(subscriptionIds[i]);
            success++;
        } catch (e) {
            console.error(`Failed to unsubscribe ${subscriptionIds[i]}:`, e);
            failed++;
        }

        if (onProgress) onProgress(i + 1, subscriptionIds.length);
        if (i < subscriptionIds.length - 1) await _delay(300);
    }

    return { success, failed };
}
