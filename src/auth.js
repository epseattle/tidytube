// ============================================
// TidyTube — Auth Module (Google OAuth 2.0)
// ============================================

// Client ID is now provided by the user (BYOK)
const SCOPES = 'https://www.googleapis.com/auth/youtube';

let tokenClient = null;
let accessToken = null;
let onSignInCallback = null;
let onSignOutCallback = null;

/**
 * Initialize Google Identity Services
 */
export function initAuth({ onSignIn, onSignOut }) {
  onSignInCallback = onSignIn;
  onSignOutCallback = onSignOut;

  // Wait for GIS library to load
  if (typeof google === 'undefined' || !google.accounts) {
    window.addEventListener('load', () => _setupTokenClient());
    return;
  }
  _setupTokenClient();
}

function _setupTokenClient() {
  if (typeof google === 'undefined' || !google.accounts) {
    console.warn('Google Identity Services not loaded. Retrying in 1s...');
    setTimeout(_setupTokenClient, 1000);
    return;
  }

  const clientId = getClientId();
  if (!clientId) {
    console.warn('No Client ID found. Skipping token client setup.');
    return;
  }

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: _handleTokenResponse,
    error_callback: (err) => {
      console.error('OAuth error:', err);
    },
  });
}

/**
 * Get the saved Client ID
 */
export function getClientId() {
  return localStorage.getItem('tidytube_client_id');
}

/**
 * Save the Client ID and re-initialize the auth client
 */
export function saveClientId(id) {
  localStorage.setItem('tidytube_client_id', id.trim());
  _setupTokenClient();
}

/**
 * Clear the saved Client ID
 */
export function clearClientId() {
  localStorage.removeItem('tidytube_client_id');
  tokenClient = null;
}

function _handleTokenResponse(response) {
  if (response.error) {
    console.error('Token error:', response.error);
    return;
  }
  accessToken = response.access_token;
  // Store expiry time (response.expires_in is in seconds)
  const expiresAt = Date.now() + (response.expires_in * 1000);
  sessionStorage.setItem('tidytube_token', accessToken);
  sessionStorage.setItem('tidytube_token_expiry', expiresAt.toString());

  if (onSignInCallback) onSignInCallback(accessToken);
}

/**
 * Trigger the Google sign-in flow
 */
export function signIn() {
  if (!tokenClient) {
    console.error('Auth not initialized');
    return;
  }
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

/**
 * Sign out — revoke token and clear state
 */
export function signOut() {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken);
  }
  accessToken = null;
  sessionStorage.removeItem('tidytube_token');
  sessionStorage.removeItem('tidytube_token_expiry');
  if (onSignOutCallback) onSignOutCallback();
}

/**
 * Get the current access token (if still valid)
 */
export function getAccessToken() {
  // Check if token is expired
  const expiry = sessionStorage.getItem('tidytube_token_expiry');
  if (expiry && Date.now() > parseInt(expiry)) {
    accessToken = null;
    sessionStorage.removeItem('tidytube_token');
    sessionStorage.removeItem('tidytube_token_expiry');
    return null;
  }
  return accessToken || sessionStorage.getItem('tidytube_token');
}

/**
 * Check if we have a valid stored token on page load
 */
export function tryRestoreSession() {
  const storedToken = sessionStorage.getItem('tidytube_token');
  const expiry = sessionStorage.getItem('tidytube_token_expiry');

  if (storedToken && expiry && Date.now() < parseInt(expiry)) {
    accessToken = storedToken;
    return storedToken;
  }
  return null;
}

/**
 * Refresh the token silently (prompt: 'none')
 */
export function refreshToken() {
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      reject(new Error('Auth not initialized'));
      return;
    }
    const originalCallback = onSignInCallback;
    onSignInCallback = (token) => {
      onSignInCallback = originalCallback;
      resolve(token);
    };
    tokenClient.requestAccessToken({ prompt: '' });
  });
}
