/**
 * js/auth.js
 * Client-side authentication module.
 *
 * Responsibilities:
 *  - Store / retrieve the access token (sessionStorage)
 *  - Intercept 401 responses and redirect to /login.html
 *  - Expose apiFetch() — a drop-in fetch() wrapper that injects the Bearer token
 *  - Expose Auth.user — the current user profile
 *  - Expose Auth.logout() — clears tokens and redirects to /login.html
 *  - Restore session on page load (via refresh token if available)
 *
 * All models and controllers should use apiFetch() instead of fetch() directly.
 */

const Auth = (() => {

  // ── Token storage ───────────────────────────────────────────────────────────
  // Access token: in-memory (fastest, most secure — lost on tab close)
  // sessionStorage mirror: survives F5 within the same tab session
  // Refresh token: localStorage (persists across tabs / restarts)

  let _accessToken = sessionStorage.getItem('infohub_token') || null;
  let _user        = null;

  try {
    const stored = sessionStorage.getItem('infohub_user');
    if (stored) _user = JSON.parse(stored);
  } catch { /* ignore */ }

  function _setTokens(accessToken, user) {
    _accessToken = accessToken;
    _user        = user;
    sessionStorage.setItem('infohub_token', accessToken);
    if (user) sessionStorage.setItem('infohub_user', JSON.stringify(user));
  }

  function _clearTokens() {
    _accessToken = null;
    _user        = null;
    sessionStorage.removeItem('infohub_token');
    sessionStorage.removeItem('infohub_user');
    localStorage.removeItem('infohub_refresh');
  }

  // ── Redirect helpers ────────────────────────────────────────────────────────

  function _redirectToLogin() {
    _clearTokens();
    window.location.href = '/login.html';
  }

  // ── apiFetch — authenticated fetch wrapper ──────────────────────────────────

  /**
   * Drop-in replacement for fetch() that:
   *  1. Injects Authorization: Bearer <token>
   *  2. On 401 → tries to refresh; on second 401 → redirects to login
   *  3. Returns the raw Response (callers can call .json() themselves)
   *
   * @param {string}       url
   * @param {RequestInit}  options
   * @returns {Promise<Response>}
   */
  async function apiFetch(url, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (_accessToken) {
      headers['Authorization'] = `Bearer ${_accessToken}`;
    }

    let res = await fetch(url, { ...options, headers });

    // Auto-refresh on 401
    if (res.status === 401) {
      const refreshed = await _tryRefresh();
      if (refreshed) {
        // Retry the original request with the new token
        headers['Authorization'] = `Bearer ${_accessToken}`;
        res = await fetch(url, { ...options, headers });
      } else {
        _redirectToLogin();
        // Return a fake Response so callers don't crash before redirect fires
        return new Response(JSON.stringify({ error: 'Session expired' }), { status: 401 });
      }
    }

    return res;
  }

  // ── Refresh ─────────────────────────────────────────────────────────────────

  async function _tryRefresh() {
    const refreshToken = localStorage.getItem('infohub_refresh');
    if (!refreshToken) return false;

    try {
      const res  = await fetch('/api/auth/refresh', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refreshToken }),
      });

      if (!res.ok) {
        localStorage.removeItem('infohub_refresh');
        return false;
      }

      const json = await res.json();
      _setTokens(json.accessToken, _user);
      return true;
    } catch {
      return false;
    }
  }

  // ── Session restore on load ──────────────────────────────────────────────────

  /**
   * Called once on DOMContentLoaded.
   * - If we have a valid token, verify it via /api/auth/me and update _user.
   * - If not, attempt a refresh.
   * - If all fails, redirect to /login.html.
   */
  async function init() {
    // Already on the login page — do nothing
    if (window.location.pathname.includes('login')) return;

    if (_accessToken) {
      try {
        const res = await apiFetch('/api/auth/me');
        if (res.ok) {
          const json = await res.json();
          _user = json.data;
          sessionStorage.setItem('infohub_user', JSON.stringify(_user));
          return; // ✅ session is valid
        }
      } catch { /* fall through to refresh */ }
    }

    // No token or token invalid — try refresh
    const refreshed = await _tryRefresh();
    if (refreshed) {
      // Fetch user profile with the new token
      try {
        const res  = await apiFetch('/api/auth/me');
        if (res.ok) {
          const json = await res.json();
          _user = json.data;
          sessionStorage.setItem('infohub_user', JSON.stringify(_user));
          return;
        }
      } catch { /* fall through */ }
    }

    _redirectToLogin();
  }

  // ── Logout ───────────────────────────────────────────────────────────────────

  async function logout() {
    const refreshToken = localStorage.getItem('infohub_refresh');
    try {
      await apiFetch('/api/auth/logout', {
        method: 'POST',
        body:   JSON.stringify({ refreshToken: refreshToken || undefined }),
      });
    } catch { /* best-effort */ }
    _redirectToLogin();
  }

  // ── Public interface ─────────────────────────────────────────────────────────

  return {
    init,
    logout,
    apiFetch,

    get user()        { return _user; },
    get isAdmin()     { return _user?.role === 'admin'; },
    get token()       { return _accessToken; },
  };

})();