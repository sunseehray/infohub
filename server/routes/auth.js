/**
 * routes/auth.js
 * Authentication endpoints.
 *
 * POST /api/auth/login    — exchange username + password for a JWT
 * POST /api/auth/logout   — invalidate the refresh token (if used)
 * GET  /api/auth/me       — return the currently authenticated user's profile
 *
 * Refresh tokens are optional. The frontend can store the access token in
 * memory (most secure) or in an httpOnly cookie. See login notes below.
 */

'use strict';

const express  = require('express');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const router   = express.Router();
const db       = require('../db');
const { requireAuth, issueAccessToken } = require('../middleware/auth');

const isPg = db.client === 'postgres';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Set an httpOnly cookie for browser clients */
function setTokenCookie(res, token) {
  res.cookie('infohub_token', token, {
    httpOnly: true,
    sameSite: 'Strict',
    // secure: true  ← uncomment if you add HTTPS (even self-signed)
    maxAge: 8 * 60 * 60 * 1000, // 8 hours — matches JWT expiry
  });
}

/** Issue and persist a refresh token, return its raw value */
async function issueRefreshToken(userId) {
  const raw   = crypto.randomBytes(40).toString('hex');
  const hash  = crypto.createHash('sha256').update(raw).digest('hex');
  const exp   = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  const expIso = exp.toISOString();

  if (isPg) {
    await db.run(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, ?) RETURNING id`,
      [userId, hash, expIso],
    );
  } else {
    await db.run(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, ?)`,
      [userId, hash, expIso],
    );
  }

  return raw;
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────
/**
 * Body: { username, password, remember? }
 *
 * Returns:
 *   { user: { id, username, display_name, role, avatar_initials },
 *     accessToken,
 *     refreshToken? }   ← only if remember=true
 *
 * The frontend should store `accessToken` in memory (a JS variable or
 * React state) and send it as `Authorization: Bearer <token>` on each
 * request. For pure browser clients, pass ?cookie=1 and the server sets
 * an httpOnly cookie instead — no JS token storage needed.
 */
router.post('/login', async (req, res) => {
  const { username, password, remember = false } = req.body;

  if (!username?.trim() || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    const user = await db.get(
      `SELECT id, username, display_name, role, avatar_initials, password_hash
       FROM users WHERE username = ?`,
      [username.trim()],
    );

    // Use a constant-time comparison even for "user not found" to prevent
    // username enumeration via timing attacks.
    const dummyHash = '$2b$12$invalidhashfortimingpurposesonly000000000000000000000000';
    const hashToCheck = user?.password_hash || dummyHash;
    const match = await bcrypt.compare(password, hashToCheck);

    if (!user || !match) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    if (!user.password_hash) {
      // Account exists but has no password set (e.g. seeded without one)
      return res.status(401).json({ error: 'Account not yet activated. Contact an admin.' });
    }

    // Update last_login
    await db.run(
      `UPDATE users SET last_login = ${isPg ? 'NOW()' : "datetime('now')"} WHERE id = ?`,
      [user.id],
    );

    const accessToken = issueAccessToken(user);

    const safeUser = {
      id:              user.id,
      username:        user.username,
      display_name:    user.display_name,
      role:            user.role,
      avatar_initials: user.avatar_initials,
    };

    // httpOnly cookie mode (browser clients that prefer not to touch JS storage)
    if (req.query.cookie === '1') {
      setTokenCookie(res, accessToken);
    }

    const response = { user: safeUser, accessToken };

    if (remember) {
      response.refreshToken = await issueRefreshToken(user.id);
    }

    return res.json(response);
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
/**
 * Body (optional): { refreshToken }
 * Clears the httpOnly cookie and invalidates the refresh token if provided.
 */
router.post('/logout', requireAuth, async (req, res) => {
  // Clear cookie (no-op if not using cookie mode)
  res.clearCookie('infohub_token');

  const { refreshToken } = req.body;
  if (refreshToken) {
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await db.run('DELETE FROM refresh_tokens WHERE token_hash = ?', [hash]);
  }

  return res.json({ message: 'Logged out.' });
});

// ── POST /api/auth/refresh ────────────────────────────────────────────────────
/**
 * Body: { refreshToken }
 * Returns a fresh accessToken if the refresh token is valid and not expired.
 */
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: 'refreshToken is required.' });
  }

  try {
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const record = await db.get(
      `SELECT rt.id, rt.user_id, rt.expires_at, u.username, u.role, u.display_name, u.avatar_initials
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = ?`,
      [hash],
    );

    if (!record) {
      return res.status(401).json({ error: 'Invalid refresh token.' });
    }

    if (new Date(record.expires_at) < new Date()) {
      await db.run('DELETE FROM refresh_tokens WHERE id = ?', [record.id]);
      return res.status(401).json({ error: 'Refresh token expired. Please log in again.' });
    }

    const user = {
      id:              record.user_id,
      username:        record.username,
      role:            record.role,
      display_name:    record.display_name,
      avatar_initials: record.avatar_initials,
    };

    const accessToken = issueAccessToken(user);

    if (req.query.cookie === '1') {
      setTokenCookie(res, accessToken);
    }

    return res.json({ accessToken });
  } catch (err) {
    console.error('Refresh error:', err);
    return res.status(500).json({ error: 'Could not refresh token.' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
/**
 * Returns the authenticated user's profile.
 * Used by the frontend on page load to restore session from a stored token.
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await db.get(
      `SELECT id, username, display_name, role, avatar_initials, last_login, created_at
       FROM users WHERE id = ?`,
      [req.user.id],
    );

    if (!user) return res.status(404).json({ error: 'User not found.' });

    return res.json({ data: user });
  } catch (err) {
    console.error('/me error:', err);
    return res.status(500).json({ error: 'Could not fetch profile.' });
  }
});

module.exports = router;