/**
 * routes/tasks.js
 * Full CRUD for tasks, with filtering, sorting, and pagination.
 *
 * GET    /api/tasks           — list tasks (supports ?search=, ?status=, ?sort=, ?dir=, ?page=, ?per_page=)
 * GET    /api/tasks/:id       — get one task (with assignee joined)
 * POST   /api/tasks           — create task
 * PUT    /api/tasks/:id       — update task
 * DELETE /api/tasks/:id       — delete task
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');

const VALID_STATUSES  = ['Open', 'Reserved', 'For Review', 'Issue', 'Done'];
const VALID_SORT_COLS = ['title', 'points', 'due_date', 'status'];

// ── Validation helper ────────────────────────────────────────────────────────
function validate(body, requireAll = true) {
  const errors = [];
  if (requireAll || body.title !== undefined) {
    if (!body.title?.trim()) errors.push('title is required');
  }
  if (requireAll || body.due_date !== undefined) {
    if (!body.due_date)                               errors.push('due_date is required');
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(body.due_date)) errors.push('due_date must be YYYY-MM-DD');
  }
  if (body.points !== undefined) {
    const p = Number(body.points);
    if (!Number.isInteger(p) || p < 1 || p > 100)    errors.push('points must be an integer 1–100');
  }
  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    errors.push(`status must be one of: ${VALID_STATUSES.join(', ')}`);
  }
  return errors;
}

// ── Shared join query ────────────────────────────────────────────────────────
const WITH_ASSIGNEE = `
  SELECT t.*,
         u.username        AS assignee_username,
         u.display_name    AS assignee_display_name,
         u.avatar_initials AS assignee_initials
  FROM tasks t
  LEFT JOIN users u ON t.assignee_id = u.id
`;

// ── GET /api/tasks ───────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const search   = (req.query.search   || '').toLowerCase().trim();
    const status   = req.query.status   || '';
    const sortCol  = VALID_SORT_COLS.includes(req.query.sort) ? req.query.sort : 'due_date';
    const sortDir  = req.query.dir === 'desc' ? 'DESC' : 'ASC';
    const page     = Math.max(1, parseInt(req.query.page)     || 1);
    const perPage  = Math.min(50, Math.max(1, parseInt(req.query.per_page) || 8));

    // Build WHERE clause dynamically
    const conditions = [];
    const params     = [];

    if (search) {
      conditions.push(`(LOWER(t.title) LIKE ? OR LOWER(t.description) LIKE ? OR LOWER(u.username) LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status && VALID_STATUSES.includes(status)) {
      conditions.push(`t.status = ?`);
      params.push(status);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Total count for pagination
    const countSQL = `
      SELECT COUNT(*) as n
      FROM tasks t
      LEFT JOIN users u ON t.assignee_id = u.id
      ${where}
    `;
    const total = db.prepare(countSQL).get(...params).n;
    const pages = Math.max(1, Math.ceil(total / perPage));
    const safePage = Math.min(page, pages);
    const offset   = (safePage - 1) * perPage;

    const rows = db.prepare(`
      ${WITH_ASSIGNEE}
      ${where}
      ORDER BY t.${sortCol} ${sortDir}
      LIMIT ? OFFSET ?
    `).all(...params, perPage, offset);

    res.json({
      data: rows,
      meta: { total, page: safePage, per_page: perPage, pages },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tasks/:id ───────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  try {
    const task = db.prepare(`${WITH_ASSIGNEE} WHERE t.id = ?`).get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json({ data: task });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/tasks ──────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const errors = validate(req.body, true);
  if (errors.length) return res.status(400).json({ errors });

  const {
    title,
    description  = '',
    points       = 1,
    due_date,
    status       = 'Open',
    assignee_id  = null,
  } = req.body;

  try {
    const result = db.prepare(`
      INSERT INTO tasks (title, description, points, due_date, status, assignee_id)
      VALUES (@title, @description, @points, @due_date, @status, @assignee_id)
    `).run({ title: title.trim(), description, points: Number(points), due_date, status, assignee_id });

    const created = db.prepare(`${WITH_ASSIGNEE} WHERE t.id = ?`).get(result.lastInsertRowid);
    res.status(201).json({ data: created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/tasks/:id ───────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  const errors = validate(req.body, false);
  if (errors.length) return res.status(400).json({ errors });

  const title       = req.body.title?.trim()  ?? existing.title;
  const description = req.body.description    ?? existing.description;
  const points      = req.body.points !== undefined ? Number(req.body.points) : existing.points;
  const due_date    = req.body.due_date       ?? existing.due_date;
  const status      = req.body.status         ?? existing.status;
  const assignee_id = req.body.assignee_id !== undefined ? req.body.assignee_id : existing.assignee_id;

  try {
    db.prepare(`
      UPDATE tasks
      SET title = @title, description = @description, points = @points,
          due_date = @due_date, status = @status, assignee_id = @assignee_id,
          updated_at = datetime('now')
      WHERE id = @id
    `).run({ title, description, points, due_date, status, assignee_id, id: req.params.id });

    const updated = db.prepare(`${WITH_ASSIGNEE} WHERE t.id = ?`).get(req.params.id);
    res.json({ data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/tasks/:id ────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ message: `Task '${existing.title}' deleted` });
});

module.exports = router;