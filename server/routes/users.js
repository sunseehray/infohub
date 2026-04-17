/**
 * routes/users.js
 * Full CRUD for users.
 *
 * GET    /api/users          — list all users
 * GET    /api/users/:id      — get one user
 * POST   /api/users          — create user
 * PUT    /api/users/:id      — update user
 * DELETE /api/users/:id      — delete user
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');

// ── Validation helper ────────────────────────────────────────────────────────
function validate(body, requireAll = true) {
  const errors = [];
  if (requireAll || body.username  !== undefined) {
    if (!body.username?.trim())      errors.push('username is required');
    if (body.username?.length > 40)  errors.push('username must be 40 chars or less');
  }
  if (requireAll || body.display_name !== undefined) {
    if (!body.display_name?.trim())  errors.push('display_name is required');
  }
  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    errors.push('email format is invalid');
  }
  if (body.role && !['admin', 'member'].includes(body.role)) {
    errors.push('role must be admin or member');
  }
  return errors;
}

// ── GET /api/users ───────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const users = db.prepare(`
      SELECT id, username, display_name, email, role, avatar_initials, created_at
      FROM users
      ORDER BY display_name ASC
    `).all();
    res.json({ data: users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/users/:id ───────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  try {
    const user = db.prepare(`
      SELECT id, username, display_name, email, role, avatar_initials, created_at
      FROM users WHERE id = ?
    `).get(req.params.id);

    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ data: user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/users ──────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const errors = validate(req.body, true);
  if (errors.length) return res.status(400).json({ errors });

  const { username, display_name, email = null, role = 'member' } = req.body;

  // Auto-generate initials from display_name
  const avatar_initials = display_name
    .trim()
    .split(/\s+/)
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  try {
    const result = db.prepare(`
      INSERT INTO users (username, display_name, email, role, avatar_initials)
      VALUES (@username, @display_name, @email, @role, @avatar_initials)
    `).run({ username: username.trim(), display_name: display_name.trim(), email, role, avatar_initials });

    const created = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ data: created });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/users/:id ───────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const errors = validate(req.body, false);
  if (errors.length) return res.status(400).json({ errors });

  // Merge incoming fields over existing values
  const username     = req.body.username?.trim()      ?? existing.username;
  const display_name = req.body.display_name?.trim()  ?? existing.display_name;
  const email        = req.body.email                 ?? existing.email;
  const role         = req.body.role                  ?? existing.role;

  const avatar_initials = display_name
    .split(/\s+/)
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  try {
    db.prepare(`
      UPDATE users
      SET username = @username, display_name = @display_name,
          email = @email, role = @role, avatar_initials = @avatar_initials
      WHERE id = @id
    `).run({ username, display_name, email, role, avatar_initials, id: req.params.id });

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    res.json({ data: updated });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/users/:id ────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  // Tasks assigned to this user will have assignee_id set to NULL (ON DELETE SET NULL)
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ message: `User '${existing.display_name}' deleted` });
});

module.exports = router;