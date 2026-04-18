/**
 * routes/users.js
 * Full CRUD for users — now auth-protected and PostgreSQL-compatible.
 *
 * GET    /api/users          → requireAuth              (any logged-in user)
 * GET    /api/users/:id      → requireAuth              (any logged-in user)
 * POST   /api/users          → requireAuth + requireAdmin
 * PUT    /api/users/:id      → requireAuth + requireSelfOrAdmin
 * PUT    /api/users/:id/role → requireAuth + requireAdmin
 * DELETE /api/users/:id      → requireAuth + requireAdmin
 * POST   /api/users/:id/set-password → requireAuth + requireSelfOrAdmin
 */

'use strict';

const express  = require('express');
const bcrypt   = require('bcryptjs');
const router   = express.Router();
const db       = require('../db');
const { requireAuth, requireAdmin, requireSelfOrAdmin } = require('../middleware/auth');

const isPg = db.client === 'postgres';

// ── Validation ────────────────────────────────────────────────────────────────

function validateUserFields(body, requireAll = true) {
  const errors = [];

  if (requireAll || body.username !== undefined) {
    if (!body.username?.trim())     errors.push('username is required');
    if (body.username?.length > 40) errors.push('username must be 40 characters or less');
    if (body.username && !/^[\w.\-]+$/.test(body.username)) {
      errors.push('username may only contain letters, numbers, dots, underscores, and hyphens');
    }
  }

  if (requireAll || body.display_name !== undefined) {
    if (!body.display_name?.trim()) errors.push('display_name is required');
  }

  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    errors.push('email format is invalid');
  }

  if (body.role && !['admin', 'member'].includes(body.role)) {
    errors.push('role must be "admin" or "member"');
  }

  return errors;
}

function validatePassword(password) {
  const errors = [];
  if (!password)           errors.push('password is required');
  if (password?.length < 8) errors.push('password must be at least 8 characters');
  return errors;
}

function avatarInitials(displayName) {
  return displayName
    .trim()
    .split(/\s+/)
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// ── GET /api/users ────────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const users = await db.all(
      `SELECT id, username, display_name, email, role, avatar_initials, last_login, created_at
       FROM users
       ORDER BY display_name ASC`,
    );
    res.json({ data: users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/users/:id ────────────────────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const user = await db.get(
      `SELECT id, username, display_name, email, role, avatar_initials, last_login, created_at
       FROM users WHERE id = ?`,
      [req.params.id],
    );
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ data: user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/users — admin creates a new member ──────────────────────────────
/**
 * Body: { username, display_name, email?, role?, password }
 *
 * Admins always set the initial password. The new user can change it via
 * PUT /api/users/:id/set-password once they log in.
 */
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const fieldErrors = validateUserFields(req.body, true);
  const passErrors  = validatePassword(req.body.password);
  const errors      = [...fieldErrors, ...passErrors];
  if (errors.length) return res.status(400).json({ errors });

  const {
    username,
    display_name,
    email    = null,
    role     = 'member',
    password,
  } = req.body;

  // Admins cannot create another admin unless explicitly allowed;
  // role=admin is permitted here (they are already an admin making the call).

  try {
    const hash     = await bcrypt.hash(password, 12);
    const initials = avatarInitials(display_name);

    let newUser;
    if (isPg) {
      const result = await db.run(
        `INSERT INTO users (username, display_name, email, role, avatar_initials, password_hash)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
        [username.trim(), display_name.trim(), email, role, initials, hash],
      );
      newUser = await db.get('SELECT id, username, display_name, email, role, avatar_initials, created_at FROM users WHERE id = ?', [result.lastID]);
    } else {
      const result = await db.run(
        `INSERT INTO users (username, display_name, email, role, avatar_initials, password_hash)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [username.trim(), display_name.trim(), email, role, initials, hash],
      );
      newUser = await db.get('SELECT id, username, display_name, email, role, avatar_initials, created_at FROM users WHERE id = ?', [result.lastID]);
    }

    res.status(201).json({ data: newUser });
  } catch (err) {
    if (err.message.includes('UNIQUE') || err.code === '23505') {
      return res.status(409).json({ error: 'Username or email already exists.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/users/:id — update profile (self or admin) ──────────────────────
/**
 * Body (all optional): { display_name, email }
 * Role and username cannot be changed here — use dedicated endpoints.
 */
router.put('/:id', requireAuth, requireSelfOrAdmin, async (req, res) => {
  try {
    const existing = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'User not found.' });

    // Deliberately not allowing username or role updates through this endpoint
    const display_name = req.body.display_name?.trim() ?? existing.display_name;
    const email        = req.body.email               ?? existing.email;
    const initials     = avatarInitials(display_name);

    const errors = validateUserFields({ display_name, email }, false);
    if (errors.length) return res.status(400).json({ errors });

    await db.run(
      `UPDATE users SET display_name = ?, email = ?, avatar_initials = ? WHERE id = ?`,
      [display_name, email, initials, req.params.id],
    );

    const updated = await db.get(
      'SELECT id, username, display_name, email, role, avatar_initials, last_login, created_at FROM users WHERE id = ?',
      [req.params.id],
    );
    res.json({ data: updated });
  } catch (err) {
    if (err.message.includes('UNIQUE') || err.code === '23505') {
      return res.status(409).json({ error: 'Email already in use.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/users/:id/role — admin changes a user's role ────────────────────
router.put('/:id/role', requireAuth, requireAdmin, async (req, res) => {
  const { role } = req.body;
  if (!['admin', 'member'].includes(role)) {
    return res.status(400).json({ error: 'role must be "admin" or "member".' });
  }

  // Prevent an admin from demoting themselves if they're the last admin
  if (Number(req.params.id) === req.user.id && role === 'member') {
    const adminCount = await db.get("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'");
    if (parseInt(adminCount.n || adminCount.count, 10) <= 1) {
      return res.status(400).json({ error: 'Cannot demote the only admin account.' });
    }
  }

  try {
    const existing = await db.get('SELECT id FROM users WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'User not found.' });

    await db.run('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);

    const updated = await db.get(
      'SELECT id, username, display_name, role FROM users WHERE id = ?',
      [req.params.id],
    );
    res.json({ data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/users/:id/set-password ─────────────────────────────────────────
/**
 * Self:  body must include { currentPassword, newPassword }
 * Admin: body needs only { newPassword } (can reset anyone's password)
 */
router.post('/:id/set-password', requireAuth, requireSelfOrAdmin, async (req, res) => {
  try {
    const target = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!target) return res.status(404).json({ error: 'User not found.' });

    const isSelf  = req.user.id === Number(req.params.id);
    const isAdmin = req.user.role === 'admin';
    const { currentPassword, newPassword } = req.body;

    const passErrors = validatePassword(newPassword);
    if (passErrors.length) return res.status(400).json({ errors: passErrors });

    // Non-admin self-change requires current password
    if (isSelf && !isAdmin) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'currentPassword is required.' });
      }
      const match = await bcrypt.compare(currentPassword, target.password_hash || '');
      if (!match) {
        return res.status(401).json({ error: 'Current password is incorrect.' });
      }
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.params.id]);

    res.json({ message: 'Password updated.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/users/:id ─────────────────────────────────────────────────────
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Prevent deleting the last admin
    const target = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!target) return res.status(404).json({ error: 'User not found.' });

    if (target.role === 'admin') {
      const adminCount = await db.get("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'");
      if (parseInt(adminCount.n || adminCount.count, 10) <= 1) {
        return res.status(400).json({ error: 'Cannot delete the only admin account.' });
      }
    }

    await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ message: `User '${target.display_name}' deleted.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;