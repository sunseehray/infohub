/**
 * middleware/auth.js
 * JWT authentication and role-based authorisation middleware.
 *
 * Usage in routes:
 *   const { requireAuth, requireAdmin, requireSelfOrAdmin } = require('../middleware/auth');
 *
 *   router.get('/',     requireAuth,                  listUsers);
 *   router.post('/',    requireAuth, requireAdmin,     createUser);
 *   router.put('/:id',  requireAuth, requireSelfOrAdmin, updateUser);
 *   router.delete('/:id', requireAuth, requireAdmin,  deleteUser);
 */

'use strict';

const jwt = require('jsonwebtoken');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set.');
  return secret;
}

/**
 * Extract a Bearer token from the Authorization header or the
 * `infohub_token` cookie (for browser clients that store it as a cookie).
 */
function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  // Cookie fallback — set by the login route when ?cookie=1 is passed
  if (req.cookies?.infohub_token) {
    return req.cookies.infohub_token;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core middleware
// ─────────────────────────────────────────────────────────────────────────────

/**
 * requireAuth
 * Verifies the JWT and attaches req.user = { id, username, role }.
 * Returns 401 if the token is missing or invalid.
 */
function requireAuth(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const payload = jwt.verify(token, getSecret());
    // Attach a clean user object — never expose the full JWT payload
    req.user = {
      id:       payload.sub,       // subject = user id (number)
      username: payload.username,
      role:     payload.role,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid token.' });
  }
}

/**
 * requireAdmin
 * Must be chained after requireAuth.
 * Returns 403 if the authenticated user is not an admin.
 */
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

/**
 * requireSelfOrAdmin
 * Must be chained after requireAuth.
 * Allows the request if:
 *   - the authenticated user is an admin, OR
 *   - the authenticated user's id matches req.params.id
 *
 * Returns 403 otherwise.
 */
function requireSelfOrAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const isAdmin      = req.user.role === 'admin';
  const isSelf       = req.user.id === Number(req.params.id);

  if (isAdmin || isSelf) {
    return next();
  }

  return res.status(403).json({ error: 'You can only modify your own account.' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Token generation utility (used by auth route)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Issue a short-lived access token.
 * @param {{ id: number, username: string, role: string }} user
 * @returns {string} signed JWT
 */
function issueAccessToken(user) {
  return jwt.sign(
    { username: user.username, role: user.role },
    getSecret(),
    {
      subject:   String(user.id),
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
      issuer:    'infohub',
    },
  );
}

module.exports = { requireAuth, requireAdmin, requireSelfOrAdmin, issueAccessToken };