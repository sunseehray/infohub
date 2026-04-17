/**
 * routes/calendar.js
 * Full CRUD for calendar entries.
 *
 * GET    /api/calendar              — all entries (optionally ?from=YYYY-MM-DD&to=YYYY-MM-DD)
 * GET    /api/calendar/date/:date   — all entries for a specific date (YYYY-MM-DD)
 * GET    /api/calendar/:id          — get one entry
 * POST   /api/calendar              — create entry
 * PUT    /api/calendar/:id          — update entry
 * DELETE /api/calendar/:id          — delete entry
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');

const VALID_TYPES = ['event', 'task', 'reminder'];

// ── Validation ───────────────────────────────────────────────────────────────
function validate(body, requireAll = true) {
  const errors = [];
  if (requireAll || body.type !== undefined) {
    if (!VALID_TYPES.includes(body.type)) errors.push(`type must be one of: ${VALID_TYPES.join(', ')}`);
  }
  if (requireAll || body.title !== undefined) {
    if (!body.title?.trim()) errors.push('title is required');
  }
  if (requireAll || body.entry_date !== undefined) {
    if (!body.entry_date) errors.push('entry_date is required');
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(body.entry_date)) errors.push('entry_date must be YYYY-MM-DD');
  }
  return errors;
}

// ── GET /api/calendar ────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const { from, to } = req.query;
    let sql    = 'SELECT * FROM calendar_entries';
    const params = [];

    if (from && to) {
      sql += ' WHERE entry_date BETWEEN ? AND ?';
      params.push(from, to);
    } else if (from) {
      sql += ' WHERE entry_date >= ?';
      params.push(from);
    }

    sql += ' ORDER BY entry_date ASC, time ASC';
    const entries = db.prepare(sql).all(...params);
    res.json({ data: entries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/calendar/date/:date ─────────────────────────────────────────────
router.get('/date/:date', (req, res) => {
  try {
    const entries = db.prepare(`
      SELECT * FROM calendar_entries
      WHERE entry_date = ?
      ORDER BY time ASC
    `).all(req.params.date);
    res.json({ data: entries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/calendar/:id ────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  try {
    const entry = db.prepare('SELECT * FROM calendar_entries WHERE id = ?').get(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    res.json({ data: entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/calendar ───────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const errors = validate(req.body, true);
  if (errors.length) return res.status(400).json({ errors });

  const {
    type, title, entry_date,
    time = null, end_date = null, end_time = null,
    location = null, description = null, color = null, repeat = null,
  } = req.body;

  try {
    const result = db.prepare(`
      INSERT INTO calendar_entries
        (type, title, entry_date, time, end_date, end_time, location, description, color, repeat)
      VALUES
        (@type, @title, @entry_date, @time, @end_date, @end_time, @location, @description, @color, @repeat)
    `).run({ type, title: title.trim(), entry_date, time, end_date, end_time, location, description, color, repeat });

    const created = db.prepare('SELECT * FROM calendar_entries WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ data: created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/calendar/:id ────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM calendar_entries WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Entry not found' });

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

  try {
    db.prepare(`
      UPDATE calendar_entries
      SET type = @type, title = @title, entry_date = @entry_date, time = @time,
          end_date = @end_date, end_time = @end_time, location = @location,
          description = @description, color = @color, repeat = @repeat
      WHERE id = @id
    `).run({ type, title, entry_date, time, end_date, end_time, location, description, color, repeat, id: req.params.id });

    const updated = db.prepare('SELECT * FROM calendar_entries WHERE id = ?').get(req.params.id);
    res.json({ data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/calendar/:id ─────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM calendar_entries WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Entry not found' });

  db.prepare('DELETE FROM calendar_entries WHERE id = ?').run(req.params.id);
  res.json({ message: `Entry '${existing.title}' deleted` });
});

module.exports = router;