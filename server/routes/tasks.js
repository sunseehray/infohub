/**
 * routes/tasks.js
 * Full CRUD for tasks — auth-protected, PostgreSQL-compatible.
 *
 * GET    /api/tasks        → requireAuth  (any member can view)
 * GET    /api/tasks/:id    → requireAuth
 * POST   /api/tasks        → requireAuth  (any member can create)
 * PUT    /api/tasks/:id    → requireAuth  (assignee or admin)
 * DELETE /api/tasks/:id    → requireAuth + requireAdmin
 */

'use strict';

const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const isPg = db.client === 'postgres';

const VALID_STATUSES = ['Open', 'Reserved', 'For Review', 'Issue', 'Done'];
const VALID_SORTS    = ['title', 'points', 'due_date', 'status'];

// ── Validation ────────────────────────────────────────────────────────────────

function validate(body, requireAll = true) {
  const errors = [];

  if (requireAll || body.title !== undefined) {
    if (!body.title?.trim()) errors.push('title is required');
  }
  if (body.points !== undefined) {
    const p = Number(body.points);
    if (isNaN(p) || p < 1 || p > 100) errors.push('points must be between 1 and 100');
  }
  if (requireAll || body.due_date !== undefined) {
    if (!body.due_date) errors.push('due_date is required');
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(body.due_date)) errors.push('due_date must be YYYY-MM-DD');
  }
  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    errors.push(`status must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  return errors;
}

// ── GET /api/tasks ────────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const {
      search   = '',
      status   = '',
      sort     = 'due_date',
      dir      = 'asc',
      page     = '1',
      per_page = '8',
    } = req.query;

    const sortCol  = VALID_SORTS.includes(sort) ? sort : 'due_date';
    const sortDir  = dir === 'desc' ? 'DESC' : 'ASC';
    const limit    = Math.min(Math.max(parseInt(per_page, 10) || 8, 1), 100);
    const offset   = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit;

    // Build WHERE clause
    const conditions = [];
    const params     = [];

    if (search) {
      if (isPg) {
        conditions.push(`(t.title ILIKE ? OR t.description ILIKE ? OR u.username ILIKE ?)`);
      } else {
        conditions.push(`(t.title LIKE ? OR t.description LIKE ? OR u.username LIKE ?)`);
      }
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    if (status && VALID_STATUSES.includes(status)) {
      conditions.push('t.status = ?');
      params.push(status);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const baseQuery = `
      FROM tasks t
      LEFT JOIN users u ON u.id = t.assignee_id
      ${where}
    `;

    // Count total for pagination
    const countRow = await db.get(`SELECT COUNT(*) AS n ${baseQuery}`, params);
    const total    = parseInt(countRow.n || countRow.count, 10);
    const pages    = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(Math.max(parseInt(page, 10) || 1, 1), pages);
    const safeOffset = (safePage - 1) * limit;

    const rows = await db.all(
      `SELECT t.id, t.title, t.description, t.points, t.due_date, t.status,
              t.assignee_id, u.username AS assignee_username, u.display_name AS assignee_display,
              u.avatar_initials AS assignee_initials,
              t.created_at, t.updated_at
       ${baseQuery}
       ORDER BY t.${sortCol} ${sortDir}
       LIMIT ? OFFSET ?`,
      [...params, limit, safeOffset],
    );

    res.json({
      data: rows,
      meta: { total, page: safePage, per_page: limit, pages },
    });
  } catch (err) {
    console.error('GET /tasks error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tasks/:id ────────────────────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const task = await db.get(
      `SELECT t.*, u.username AS assignee_username, u.display_name AS assignee_display
       FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
       WHERE t.id = ?`,
      [req.params.id],
    );
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    res.json({ data: task });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/tasks ───────────────────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
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
    let task;
    if (isPg) {
      const result = await db.run(
        `INSERT INTO tasks (title, description, points, due_date, status, assignee_id)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
        [title.trim(), description.trim(), Number(points), due_date, status, assignee_id],
      );
      task = await db.get('SELECT * FROM tasks WHERE id = ?', [result.lastID]);
    } else {
      const result = await db.run(
        `INSERT INTO tasks (title, description, points, due_date, status, assignee_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [title.trim(), description.trim(), Number(points), due_date, status, assignee_id],
      );
      task = await db.get('SELECT * FROM tasks WHERE id = ?', [result.lastID]);
    }
    res.status(201).json({ data: task });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/tasks/:id ────────────────────────────────────────────────────────
/**
 * Members can update tasks assigned to them.
 * Admins can update any task.
 * Changing assignee_id requires admin.
 */
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const existing = await db.get('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Task not found.' });

    const isAdmin    = req.user.role === 'admin';
    const isAssignee = existing.assignee_id === req.user.id;

    if (!isAdmin && !isAssignee) {
      return res.status(403).json({ error: 'You can only update tasks assigned to you.' });
    }

    // Members cannot reassign tasks
    if (!isAdmin && req.body.assignee_id !== undefined) {
      return res.status(403).json({ error: 'Only admins can reassign tasks.' });
    }

    const errors = validate(req.body, false);
    if (errors.length) return res.status(400).json({ errors });

    const title       = req.body.title?.trim()   ?? existing.title;
    const description = req.body.description     ?? existing.description;
    const points      = req.body.points          ?? existing.points;
    const due_date    = req.body.due_date        ?? existing.due_date;
    const status      = req.body.status          ?? existing.status;
    const assignee_id = isAdmin
      ? (req.body.assignee_id !== undefined ? req.body.assignee_id : existing.assignee_id)
      : existing.assignee_id;

    const nowExpr = isPg ? 'NOW()' : "datetime('now')";

    await db.run(
      `UPDATE tasks
       SET title = ?, description = ?, points = ?, due_date = ?, status = ?,
           assignee_id = ?, updated_at = ${nowExpr}
       WHERE id = ?`,
      [title, description, Number(points), due_date, status, assignee_id, req.params.id],
    );

    const updated = await db.get(
      `SELECT t.*, u.username AS assignee_username FROM tasks t
       LEFT JOIN users u ON u.id = t.assignee_id WHERE t.id = ?`,
      [req.params.id],
    );
    res.json({ data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/tasks/:id ─────────────────────────────────────────────────────
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const existing = await db.get('SELECT id, title FROM tasks WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Task not found.' });

    await db.run('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    res.json({ message: `Task '${existing.title}' deleted.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;