/**
 * migrate.js
 * Creates all tables (if they don't exist) and runs the first-time seed.
 * Called once at server startup from app.js.
 *
 * Dialect differences handled here so route files stay clean:
 *   - SQLite:     INTEGER PRIMARY KEY AUTOINCREMENT, datetime('now'), ?
 *   - PostgreSQL: SERIAL PRIMARY KEY, NOW(), $N  (placeholders rewritten by db.js)
 */

'use strict';

const db     = require('./db');
const bcrypt = require('bcryptjs');

// ─────────────────────────────────────────────────────────────────────────────
// Dialect helpers
// ─────────────────────────────────────────────────────────────────────────────
const isPg   = db.client === 'postgres';
const PK     = isPg ? 'SERIAL PRIMARY KEY'           : 'INTEGER PRIMARY KEY AUTOINCREMENT';
const NOW    = isPg ? 'NOW()'                         : "datetime('now')";
const TSTYPE = isPg ? 'TIMESTAMPTZ'                   : 'TEXT';

// ─────────────────────────────────────────────────────────────────────────────
// Schema DDL
// ─────────────────────────────────────────────────────────────────────────────
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id               ${PK},
    username         TEXT        NOT NULL,
    display_name     TEXT        NOT NULL,
    email            TEXT,
    role             TEXT        NOT NULL DEFAULT 'member',
    avatar_initials  TEXT,
    password_hash    TEXT,
    last_login       ${TSTYPE},
    created_at       ${TSTYPE}   NOT NULL DEFAULT (${NOW}),
    CONSTRAINT users_username_uq UNIQUE (username),
    CONSTRAINT users_email_uq    UNIQUE (email),
    CONSTRAINT users_role_ck     CHECK  (role IN ('admin','member'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id           ${PK},
    title        TEXT        NOT NULL,
    description  TEXT        NOT NULL DEFAULT '',
    points       INTEGER     NOT NULL DEFAULT 1,
    due_date     TEXT        NOT NULL,
    status       TEXT        NOT NULL DEFAULT 'Open',
    assignee_id  INTEGER     REFERENCES users(id) ON DELETE SET NULL,
    created_at   ${TSTYPE}   NOT NULL DEFAULT (${NOW}),
    updated_at   ${TSTYPE}   NOT NULL DEFAULT (${NOW}),
    CONSTRAINT tasks_points_ck  CHECK (points >= 1 AND points <= 100),
    CONSTRAINT tasks_status_ck  CHECK (status IN ('Open','Reserved','For Review','Issue','Done'))
  );

  CREATE TABLE IF NOT EXISTS calendar_entries (
    id           ${PK},
    type         TEXT        NOT NULL,
    title        TEXT        NOT NULL,
    entry_date   TEXT        NOT NULL,
    time         TEXT,
    end_date     TEXT,
    end_time     TEXT,
    location     TEXT,
    description  TEXT,
    color        TEXT,
    repeat       TEXT,
    created_at   ${TSTYPE}   NOT NULL DEFAULT (${NOW}),
    CONSTRAINT cal_type_ck CHECK (type IN ('event','task','reminder'))
  );

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          ${PK},
    user_id     INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL,
    expires_at  ${TSTYPE}   NOT NULL,
    created_at  ${TSTYPE}   NOT NULL DEFAULT (${NOW}),
    CONSTRAINT refresh_tokens_hash_uq UNIQUE (token_hash)
  );
`;

// PostgreSQL needs indexes created separately (SQLite CREATE INDEX IF NOT EXISTS is fine inline)
const INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_calendar_date   ON calendar_entries(entry_date);
  CREATE INDEX IF NOT EXISTS idx_tasks_due        ON tasks(due_date);
  CREATE INDEX IF NOT EXISTS idx_tasks_assignee   ON tasks(assignee_id);
  CREATE INDEX IF NOT EXISTS idx_refresh_user     ON refresh_tokens(user_id);
`;

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap: first admin from environment variables
// ─────────────────────────────────────────────────────────────────────────────
async function bootstrap() {
  const row = await db.get('SELECT COUNT(*) AS n FROM users');
  // pg returns numeric strings; sqlite returns numbers
  const count = parseInt(row.n || row.count || 0, 10);

  if (count > 0) {
    // Warn if someone accidentally left bootstrap vars set after first run
    if (process.env.INFOHUB_ADMIN_USER) {
      console.warn('⚠️  INFOHUB_ADMIN_USER is set but users already exist — bootstrap skipped.');
    }
    return;
  }

  const adminUser = process.env.INFOHUB_ADMIN_USER;
  const adminPass = process.env.INFOHUB_ADMIN_PASS;

  if (!adminUser || !adminPass) {
    console.warn('⚠️  No users exist. Set INFOHUB_ADMIN_USER and INFOHUB_ADMIN_PASS to create the first admin on next start.');
    return;
  }

  if (adminPass.length < 8) {
    console.error('❌ INFOHUB_ADMIN_PASS must be at least 8 characters.');
    process.exit(1);
  }

  const hash     = await bcrypt.hash(adminPass, 12);
  const initials = adminUser.slice(0, 2).toUpperCase();

  if (isPg) {
    await db.run(
      `INSERT INTO users (username, display_name, role, avatar_initials, password_hash)
       VALUES (?, ?, 'admin', ?, ?) RETURNING id`,
      [adminUser, adminUser, initials, hash],
    );
  } else {
    await db.run(
      `INSERT INTO users (username, display_name, role, avatar_initials, password_hash)
       VALUES (?, ?, 'admin', ?, ?)`,
      [adminUser, adminUser, initials, hash],
    );
  }

  console.log(`✅ Admin account '${adminUser}' created. You can now unset INFOHUB_ADMIN_USER and INFOHUB_ADMIN_PASS.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo seed (only if zero tasks exist — safe to skip in production)
// ─────────────────────────────────────────────────────────────────────────────
async function seedDemo() {
  if (process.env.INFOHUB_SKIP_SEED === 'true') return;

  const row = await db.get('SELECT COUNT(*) AS n FROM tasks');
  const count = parseInt(row.n || row.count || 0, 10);
  if (count > 0) return;

  // Need at least one user to assign tasks to
  const adminRow = await db.get("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (!adminRow) return; // no admin yet — seed will run after bootstrap next time

  const adminId = adminRow.id;

  // ── Create demo member users ──
  const memberHash = await bcrypt.hash('changeme123', 12);

  const insertUser = async (username, displayName) => {
    const initials = displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    if (isPg) {
      const r = await db.run(
        `INSERT INTO users (username, display_name, role, avatar_initials, password_hash)
         VALUES (?, ?, 'member', ?, ?) ON CONFLICT DO NOTHING RETURNING id`,
        [username, displayName, initials, memberHash],
      );
      if (r.lastID) return r.lastID;
      const existing = await db.get('SELECT id FROM users WHERE username = ?', [username]);
      return existing?.id;
    } else {
      await db.run(
        `INSERT OR IGNORE INTO users (username, display_name, role, avatar_initials, password_hash)
         VALUES (?, ?, 'member', ?, ?)`,
        [username, displayName, initials, memberHash],
      );
      const existing = await db.get('SELECT id FROM users WHERE username = ?', [username]);
      return existing?.id;
    }
  };

  const jdoeId   = await insertUser('j.doe',   'John Doe');
  const sarahId  = await insertUser('sarah_k', 'Sarah K');

  // ── Demo tasks ──
  const tasks = [
    { title: 'Submit quarterly budget report',  description: 'Compile all departmental spending data and submit the Q1 2026 budget report to the finance team.',  points: 15, due_date: '2026-04-10', status: 'Issue',      assignee_id: adminId  },
    { title: 'Book dentist appointment',         description: 'Schedule a routine check-up and cleaning at the dentist. Preferred times are weekday mornings.',     points: 3,  due_date: '2026-04-15', status: 'Open',       assignee_id: null     },
    { title: 'Water the indoor plants',          description: 'Give all indoor plants a thorough watering and check the soil moisture levels for each pot.',        points: 2,  due_date: '2026-04-11', status: 'Open',       assignee_id: jdoeId   },
    { title: 'Prep meal plan for next week',     description: 'Plan out 7 days of meals and generate a grocery list from the plan for review.',                     points: 8,  due_date: '2026-04-13', status: 'Reserved',   assignee_id: sarahId  },
    { title: 'Reply to HOA email',               description: 'Respond to the HOA regarding the upcoming community meeting and proposed bylaw changes.',             points: 4,  due_date: '2026-04-18', status: 'Open',       assignee_id: adminId  },
    { title: 'Deep clean kitchen',               description: 'Scrub stovetop, clean oven, wipe cabinets, and sanitise all countertops and the sink.',              points: 10, due_date: '2026-04-20', status: 'For Review', assignee_id: jdoeId   },
    { title: 'Renew car registration',           description: 'Complete the annual vehicle registration renewal online and update the license plate sticker.',       points: 5,  due_date: '2026-04-25', status: 'Open',       assignee_id: null     },
    { title: 'Organise garage storage',          description: 'Sort, label, and shelve boxes. Dispose of unneeded items and donate to local charity.',              points: 12, due_date: '2026-05-02', status: 'Open',       assignee_id: sarahId  },
    { title: 'Update home insurance policy',     description: 'Review coverage and update to reflect recent renovations and new property valuation.',                points: 6,  due_date: '2026-04-30', status: 'Reserved',   assignee_id: adminId  },
    { title: 'Fix leaking bathroom tap',         description: 'Hot-water tap in main bathroom is dripping. Replace washer or call plumber.',                        points: 8,  due_date: '2026-04-14', status: 'Open',       assignee_id: null     },
    { title: 'Research summer vacation options', description: 'Compare holiday destinations for late July — flights, accommodations, and activities.',               points: 7,  due_date: '2026-05-10', status: 'Open',       assignee_id: sarahId  },
    { title: 'Sort and file tax documents',      description: 'Organise all 2025 tax documents and send to accountant for end-of-financial-year processing.',       points: 10, due_date: '2026-04-09', status: 'Done',       assignee_id: adminId  },
  ];

  for (const t of tasks) {
    if (isPg) {
      await db.run(
        `INSERT INTO tasks (title, description, points, due_date, status, assignee_id)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
        [t.title, t.description, t.points, t.due_date, t.status, t.assignee_id],
      );
    } else {
      await db.run(
        `INSERT INTO tasks (title, description, points, due_date, status, assignee_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [t.title, t.description, t.points, t.due_date, t.status, t.assignee_id],
      );
    }
  }

  // ── Demo calendar entries ──
  function offsetDate(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  const calEntries = [
    { type: 'event',    title: 'Team standup',        entry_date: offsetDate(0),  time: '09:00', color: '#1A4F7A' },
    { type: 'reminder', title: 'Pay electricity bill', entry_date: offsetDate(0),  time: '08:00', color: null },
    { type: 'task',     title: 'Submit budget report', entry_date: offsetDate(1),  time: null,    color: null },
    { type: 'event',    title: 'Dentist appointment',  entry_date: offsetDate(1),  time: '14:30', color: '#2E6B4F' },
    { type: 'reminder', title: 'Call landlord',        entry_date: offsetDate(-2), time: null,    color: null },
  ];

  for (const e of calEntries) {
    if (isPg) {
      await db.run(
        `INSERT INTO calendar_entries (type, title, entry_date, time, color)
         VALUES (?, ?, ?, ?, ?) RETURNING id`,
        [e.type, e.title, e.entry_date, e.time, e.color],
      );
    } else {
      await db.run(
        `INSERT INTO calendar_entries (type, title, entry_date, time, color)
         VALUES (?, ?, ?, ?, ?)`,
        [e.type, e.title, e.entry_date, e.time, e.color],
      );
    }
  }

  console.log('Demo data seeded. Member accounts use password: changeme123');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────
async function migrate() {
  console.log('Running migrations…');
  await db.exec(SCHEMA);
  await db.exec(INDEXES);
  await bootstrap();
  await seedDemo();
  console.log('Migrations complete.');
}

module.exports = migrate;