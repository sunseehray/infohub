/**
 * routes/calendar.js
 * Full CRUD for calendar entries — auth-protected, PostgreSQL-compatible.
 *
 * GET    /api/calendar              → requireAuth (any member)
 * GET    /api/calendar/date/:date   → requireAuth
 * GET    /api/calendar/:id          → requireAuth
 * POST   /api/calendar              → requireAuth (any member can create)
 * PUT    /api/calendar/:id          → requireAuth (any member can edit)
 * DELETE /api/calendar/:id          → requireAuth (creator or admin)
 */

'use strict';

const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const { requireAuth } = require('../middleware/auth');

const isPg         = db.client === 'postgres';
const VALID_TYPES  = ['event', 'task', 'reminder'];

// ── Validation ────────────────────────────────────────────────────────────────

function validate(body, requireAll = true) {
  const errors = [];

  if (requireAll || body.type !== undefined) {
    if (!VALID_TYPES.includes(body.type)) {
      errors.push(`type must be one of: ${VALID_TYPES.join(', ')}`);
    }
  }
  if (requireAll || body.title !== undefined) {
    if (!body.title?.trim()) errors.push('title is required');
  }
  if (requireAll || body.entry_date !== undefined) {
    if (!body.entry_date) errors.push('entry_date is required');
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(body.entry_date)) {
      errors.push('entry_date must be YYYY-MM-DD');
    }
  }

  return errors;
}

// ── GET /api/calendar ─────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const { from, to } = req.query;
    const conditions = [];
    const params     = [];

    if (from) { conditions.push('entry_date >= ?'); params.push(from); }
    if (to)   { conditions.push('entry_date <= ?'); params.push(to); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows  = await db.all(
      `SELECT * FROM calendar_entries ${where} ORDER BY entry_date ASC, time ASC`,
      params,
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/calendar/date/:date ──────────────────────────────────────────────
// Must be registered before /:id to avoid 'date' being treated as an id
router.get('/date/:date', requireAuth, async (req, res) => {
  try {
    const rows = await db.all(
      'SELECT * FROM calendar_entries WHERE entry_date = ? ORDER BY time ASC',
      [req.params.date],
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/calendar/:id ─────────────────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const entry = await db.get('SELECT * FROM calendar_entries WHERE id = ?', [req.params.id]);
    if (!entry) return res.status(404).json({ error: 'Entry not found.' });
    res.json({ data: entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/calendar ────────────────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  const errors = validate(req.body, true);
  if (errors.length) return res.status(400).json({ errors });

  const {
    type, title, entry_date,
    time        = null,
    end_date    = null,
    end_time    = null,
    location    = null,
    description = null,
    color       = null,
    repeat      = null,
  } = req.body;

  try {
    let entry;
    if (isPg) {
      const result = await db.run(
        `INSERT INTO calendar_entries
           (type, title, entry_date, time, end_date, end_time, location, description, color, repeat)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [type, title.trim(), entry_date, time, end_date, end_time, location, description, color, repeat],
      );
      entry = await db.get('SELECT * FROM calendar_entries WHERE id = ?', [result.lastID]);
    } else {
      const result = await db.run(
        `INSERT INTO calendar_entries
           (type, title, entry_date, time, end_date, end_time, location, description, color, repeat)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [type, title.trim(), entry_date, time, end_date, end_time, location, description, color, repeat],
      );
      entry = await db.get('SELECT * FROM calendar_entries WHERE id = ?', [result.lastID]);
    }
    res.status(201).json({ data: entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/calendar/:id ─────────────────────────────────────────────────────
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const existing = await db.get('SELECT * FROM calendar_entries WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Entry not found.' });

    const errors = validate(req.body, false);
    if (errors.length) return res.status(400).json({ errors });

    const type        = req.body.type        ?? existing.type;
    const title       = req.body.title?.trim() ?? existing.title;
    const entry_date  = req.body.entry_date  ?? existing.entry_date;
    const time        = req.body.time        ?? existing.time;
    const end_date    = req.body.end_date    ?? existing.end_date;
    const end_time    = req.body.end_time    ?? existing.end_time;
    const location    = req.body.location    ?? existing.location;
    const description = req.body.description ?? existing.description;
    const color       = req.body.color       ?? existing.color;
    const repeat      = req.body.repeat      ?? existing.repeat;

    await db.run(
      `UPDATE calendar_entries
       SET type = ?, title = ?, entry_date = ?, time = ?, end_date = ?, end_time = ?,
           location = ?, description = ?, color = ?, repeat = ?
       WHERE id = ?`,
      [type, title, entry_date, time, end_date, end_time, location, description, color, repeat, req.params.id],
    );

    const updated = await db.get('SELECT * FROM calendar_entries WHERE id = ?', [req.params.id]);
    res.json({ data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/calendar/:id ──────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const existing = await db.get('SELECT * FROM calendar_entries WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Entry not found.' });

    // Any authenticated user can delete calendar entries for now;
    // add requireAdmin if you want to restrict this.
    await db.run('DELETE FROM calendar_entries WHERE id = ?', [req.params.id]);
    res.json({ message: `Entry '${existing.title}' deleted.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;