/**
 * db.js
 * SQLite connection, schema creation, and demo seed data.
 * Uses the 'better-sqlite3' package for synchronous, simple access.
 *
 * Database file is created at: /server/infohub.db
 * Delete infohub.db and restart to reset all data.
 */

const Database = require('better-sqlite3');
const path     = require('path');

const db = new Database(path.join(__dirname, 'infohub.db'));

// Enable WAL mode — better performance for concurrent reads
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ───────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username     TEXT    NOT NULL UNIQUE,
    display_name TEXT    NOT NULL,
    email        TEXT    UNIQUE,
    role         TEXT    NOT NULL DEFAULT 'member' CHECK(role IN ('admin','member')),
    avatar_initials TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    points      INTEGER NOT NULL DEFAULT 1 CHECK(points >= 1 AND points <= 100),
    due_date    TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'Open'
                CHECK(status IN ('Open','Reserved','For Review','Issue','Done')),
    assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS calendar_entries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type       TEXT    NOT NULL CHECK(type IN ('event','task','reminder')),
    title      TEXT    NOT NULL,
    entry_date TEXT    NOT NULL,
    time       TEXT,
    end_date   TEXT,
    end_time   TEXT,
    location   TEXT,
    description TEXT,
    color      TEXT,
    repeat     TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- Index for fast date lookups on the calendar
  CREATE INDEX IF NOT EXISTS idx_calendar_date ON calendar_entries(entry_date);
`);

// ── Seed demo data (only if tables are empty) ────────────────────────────────
function seed() {
  const userCount = db.prepare('SELECT COUNT(*) as n FROM users').get().n;
  if (userCount > 0) return; // already seeded

  // ── Users ──────────────────────────────────────────────────────────────────
  const insertUser = db.prepare(`
    INSERT INTO users (username, display_name, email, role, avatar_initials)
    VALUES (@username, @display_name, @email, @role, @avatar_initials)
  `);

  const users = db.transaction(() => {
    insertUser.run({ username: 'lmartin',  display_name: 'Laura Martin',  email: 'laura@home.local',  role: 'admin',  avatar_initials: 'LM' });
    insertUser.run({ username: 'j.doe',    display_name: 'John Doe',      email: 'john@home.local',   role: 'member', avatar_initials: 'JD' });
    insertUser.run({ username: 'sarah_k',  display_name: 'Sarah K',       email: 'sarah@home.local',  role: 'member', avatar_initials: 'SK' });
  });
  users();

  // Grab user IDs for FK references
  const lmartin = db.prepare('SELECT id FROM users WHERE username = ?').get('lmartin');
  const jdoe    = db.prepare('SELECT id FROM users WHERE username = ?').get('j.doe');
  const sarahk  = db.prepare('SELECT id FROM users WHERE username = ?').get('sarah_k');

  // ── Tasks ──────────────────────────────────────────────────────────────────
  const insertTask = db.prepare(`
    INSERT INTO tasks (title, description, points, due_date, status, assignee_id)
    VALUES (@title, @description, @points, @due_date, @status, @assignee_id)
  `);

  const tasks = db.transaction(() => {
    insertTask.run({ title: 'Submit quarterly budget report',  description: 'Compile all departmental spending data and submit the Q1 2026 budget report to the finance team.',  points: 15, due_date: '2026-04-10', status: 'Issue',      assignee_id: lmartin.id });
    insertTask.run({ title: 'Book dentist appointment',         description: 'Schedule a routine check-up and cleaning at the dentist. Preferred times are weekday mornings.',     points: 3,  due_date: '2026-04-15', status: 'Open',       assignee_id: null });
    insertTask.run({ title: 'Water the indoor plants',          description: 'Give all indoor plants a thorough watering and check the soil moisture levels for each pot.',        points: 2,  due_date: '2026-04-11', status: 'Open',       assignee_id: jdoe.id });
    insertTask.run({ title: 'Prep meal plan for next week',     description: 'Plan out 7 days of meals and generate a grocery list from the plan for review.',                     points: 8,  due_date: '2026-04-13', status: 'Reserved',   assignee_id: sarahk.id });
    insertTask.run({ title: 'Reply to HOA email',               description: 'Respond to the HOA regarding the upcoming community meeting and proposed bylaw changes.',             points: 4,  due_date: '2026-04-18', status: 'Open',       assignee_id: lmartin.id });
    insertTask.run({ title: 'Deep clean kitchen',               description: 'Scrub stovetop, clean oven, wipe cabinets, and sanitise all countertops and the sink.',              points: 10, due_date: '2026-04-20', status: 'For Review', assignee_id: jdoe.id });
    insertTask.run({ title: 'Renew car registration',           description: 'Complete the annual vehicle registration renewal online and update the license plate sticker.',       points: 5,  due_date: '2026-04-25', status: 'Open',       assignee_id: null });
    insertTask.run({ title: 'Organise garage storage',          description: 'Sort, label, and shelve boxes. Dispose of unneeded items and donate to local charity.',              points: 12, due_date: '2026-05-02', status: 'Open',       assignee_id: sarahk.id });
    insertTask.run({ title: 'Update home insurance policy',     description: 'Review coverage and update to reflect recent renovations and new property valuation.',                points: 6,  due_date: '2026-04-30', status: 'Reserved',   assignee_id: lmartin.id });
    insertTask.run({ title: 'Fix leaking bathroom tap',         description: 'Hot-water tap in main bathroom is dripping. Replace washer or call plumber.',                        points: 8,  due_date: '2026-04-14', status: 'Open',       assignee_id: null });
    insertTask.run({ title: 'Research summer vacation options', description: 'Compare holiday destinations for late July — flights, accommodations, and activities.',               points: 7,  due_date: '2026-05-10', status: 'Open',       assignee_id: sarahk.id });
    insertTask.run({ title: 'Sort and file tax documents',      description: 'Organise all 2025 tax documents and send to accountant for end-of-financial-year processing.',       points: 10, due_date: '2026-04-09', status: 'Done',       assignee_id: lmartin.id });
  });
  tasks();

  // ── Calendar entries (demo, relative to today) ─────────────────────────────
  const insertCal = db.prepare(`
    INSERT INTO calendar_entries (type, title, entry_date, time, color)
    VALUES (@type, @title, @entry_date, @time, @color)
  `);

  function offsetDate(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  const cal = db.transaction(() => {
    insertCal.run({ type: 'event',    title: 'Team standup',         entry_date: offsetDate(0),  time: '09:00', color: '#1A4F7A' });
    insertCal.run({ type: 'reminder', title: 'Pay electricity bill',  entry_date: offsetDate(0),  time: '08:00', color: null });
    insertCal.run({ type: 'task',     title: 'Submit budget report',  entry_date: offsetDate(1),  time: null,    color: null });
    insertCal.run({ type: 'event',    title: 'Dentist appointment',   entry_date: offsetDate(1),  time: '14:30', color: '#2E6B4F' });
    insertCal.run({ type: 'reminder', title: 'Call landlord',         entry_date: offsetDate(-2), time: null,    color: null });
  });
  cal();

  console.log('Database seeded with demo data.');
}

seed();

module.exports = db;