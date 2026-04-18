/**
 * migrate-sqlite-to-pg.js
 * One-time migration from SQLite to PostgreSQL.
 * 
 * Usage: NODE_ENV=migration DB_CLIENT=postgres DATABASE_URL=... node migrate-sqlite-to-pg.js
 * 
 * This script:
 * 1. Reads all data from SQLite (./infohub.db)
 * 2. Creates fresh schema in PostgreSQL
 * 3. Copies all data over while handling dialect differences
 * 4. Verifies row counts match
 */

'use strict';

const Database = require('better-sqlite3');
const { Pool } = require('pg');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────
const SQLITE_PATH = process.env.DB_PATH || path.join(__dirname, 'infohub.db');
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not set. Usage:\n');
  console.error('  DATABASE_URL=postgresql://user:pass@localhost/infohub node migrate-sqlite-to-pg.js');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup connections
// ─────────────────────────────────────────────────────────────────────────────
const sqlite = new Database(SQLITE_PATH);
sqlite.pragma('foreign_keys = ON');

const pgPool = new Pool({ connectionString: DATABASE_URL });

// ─────────────────────────────────────────────────────────────────────────────
// Schema for PostgreSQL (matches migrate.js)
// ─────────────────────────────────────────────────────────────────────────────
const PG_SCHEMA = `
  DROP TABLE IF EXISTS refresh_tokens CASCADE;
  DROP TABLE IF EXISTS calendar_entries CASCADE;
  DROP TABLE IF EXISTS tasks CASCADE;
  DROP TABLE IF EXISTS users CASCADE;

  CREATE TABLE users (
    id               SERIAL PRIMARY KEY,
    username         TEXT        NOT NULL UNIQUE,
    display_name     TEXT        NOT NULL,
    email            TEXT        UNIQUE,
    role             TEXT        NOT NULL DEFAULT 'member',
    avatar_initials  TEXT,
    password_hash    TEXT,
    last_login       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (role IN ('admin','member'))
  );

  CREATE TABLE tasks (
    id           SERIAL PRIMARY KEY,
    title        TEXT        NOT NULL,
    description  TEXT        NOT NULL DEFAULT '',
    points       INTEGER     NOT NULL DEFAULT 1,
    due_date     TEXT        NOT NULL,
    status       TEXT        NOT NULL DEFAULT 'Open',
    assignee_id  INTEGER     REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (points >= 1 AND points <= 100),
    CHECK (status IN ('Open','Reserved','For Review','Issue','Done'))
  );

  CREATE TABLE calendar_entries (
    id           SERIAL PRIMARY KEY,
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
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (type IN ('event','task','reminder'))
  );

  CREATE TABLE refresh_tokens (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX idx_calendar_date   ON calendar_entries(entry_date);
  CREATE INDEX idx_tasks_due        ON tasks(due_date);
  CREATE INDEX idx_tasks_assignee   ON tasks(assignee_id);
  CREATE INDEX idx_refresh_user     ON refresh_tokens(user_id);
`;

// ─────────────────────────────────────────────────────────────────────────────
// Main migration
// ─────────────────────────────────────────────────────────────────────────────
async function migrate() {
  try {
    console.log('📋 Starting SQLite → PostgreSQL migration...\n');

    // Step 1: Create schema in PostgreSQL
    console.log('1️⃣  Creating PostgreSQL schema...');
    const client = await pgPool.connect();
    await client.query(PG_SCHEMA);
    client.release();
    console.log('   ✅ Schema created\n');

    // Step 2: Migrate users
    console.log('2️⃣  Migrating users...');
    const users = sqlite.prepare('SELECT * FROM users').all();
    for (const user of users) {
      const createdAt = user.created_at ? new Date(user.created_at) : new Date();
      const lastLogin = user.last_login ? new Date(user.last_login) : null;
      
      await pgPool.query(
        `INSERT INTO users (id, username, display_name, email, role, avatar_initials, password_hash, last_login, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO NOTHING`,
        [user.id, user.username, user.display_name, user.email, user.role, user.avatar_initials, user.password_hash, lastLogin, createdAt]
      );
    }
    console.log(`   ✅ Migrated ${users.length} users\n`);

    // Step 3: Migrate tasks
    console.log('3️⃣  Migrating tasks...');
    const tasks = sqlite.prepare('SELECT * FROM tasks').all();
    for (const task of tasks) {
      const createdAt = task.created_at ? new Date(task.created_at) : new Date();
      const updatedAt = task.updated_at ? new Date(task.updated_at) : new Date();
      
      await pgPool.query(
        `INSERT INTO tasks (id, title, description, points, due_date, status, assignee_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO NOTHING`,
        [task.id, task.title, task.description, task.points, task.due_date, task.status, task.assignee_id, createdAt, updatedAt]
      );
    }
    console.log(`   ✅ Migrated ${tasks.length} tasks\n`);

    // Step 4: Migrate calendar entries
    console.log('4️⃣  Migrating calendar entries...');
    const calendarEntries = sqlite.prepare('SELECT * FROM calendar_entries').all();
    for (const entry of calendarEntries) {
      const createdAt = entry.created_at ? new Date(entry.created_at) : new Date();
      
      await pgPool.query(
        `INSERT INTO calendar_entries (id, type, title, entry_date, time, end_date, end_time, location, description, color, repeat, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO NOTHING`,
        [entry.id, entry.type, entry.title, entry.entry_date, entry.time, entry.end_date, entry.end_time, entry.location, entry.description, entry.color, entry.repeat, createdAt]
      );
    }
    console.log(`   ✅ Migrated ${calendarEntries.length} calendar entries\n`);

    // Step 5: Migrate refresh tokens
    console.log('5️⃣  Migrating refresh tokens...');
    const refreshTokens = sqlite.prepare('SELECT * FROM refresh_tokens').all();
    for (const token of refreshTokens) {
      const createdAt = token.created_at ? new Date(token.created_at) : new Date();
      const expiresAt = token.expires_at ? new Date(token.expires_at) : new Date();
      
      await pgPool.query(
        `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [token.id, token.user_id, token.token_hash, expiresAt, createdAt]
      );
    }
    console.log(`   ✅ Migrated ${refreshTokens.length} refresh tokens\n`);

    // Step 6: Verify counts
    console.log('6️⃣  Verifying migration...');
    const pgUserCount = await pgPool.query('SELECT COUNT(*) FROM users');
    const pgTaskCount = await pgPool.query('SELECT COUNT(*) FROM tasks');
    const pgCalCount = await pgPool.query('SELECT COUNT(*) FROM calendar_entries');
    const pgTokenCount = await pgPool.query('SELECT COUNT(*) FROM refresh_tokens');

    console.log(`
   SQLite → PostgreSQL:
   • Users:        ${users.length} → ${pgUserCount.rows[0].count}
   • Tasks:        ${tasks.length} → ${pgTaskCount.rows[0].count}
   • Calendar:     ${calendarEntries.length} → ${pgCalCount.rows[0].count}
   • Tokens:       ${refreshTokens.length} → ${pgTokenCount.rows[0].count}
    `);

    if (
      users.length === parseInt(pgUserCount.rows[0].count) &&
      tasks.length === parseInt(pgTaskCount.rows[0].count) &&
      calendarEntries.length === parseInt(pgCalCount.rows[0].count) &&
      refreshTokens.length === parseInt(pgTokenCount.rows[0].count)
    ) {
      console.log('✅ Migration successful! All data transferred.\n');
    } else {
      console.warn('⚠️  Row counts don\'t match. Review the migration.\n');
    }

    sqlite.close();
    await pgPool.end();

  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    sqlite.close();
    await pgPool.end();
    process.exit(1);
  }
}

migrate();
