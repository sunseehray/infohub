/**
 * db.js
 * Database abstraction layer.
 *
 * Supports SQLite (default, via better-sqlite3) and PostgreSQL (via pg).
 * Switch by setting the DB_CLIENT environment variable:
 *
 *   DB_CLIENT=sqlite   (default) — file at DB_PATH or ./server/infohub.db
 *   DB_CLIENT=postgres           — connection via DATABASE_URL
 *
 * The exported `db` object exposes a unified async interface so all route
 * files work identically against either backend:
 *
 *   db.get(sql, params)      → Promise<row | undefined>
 *   db.all(sql, params)      → Promise<row[]>
 *   db.run(sql, params)      → Promise<{ lastID, changes }>
 *   db.exec(sql)             → Promise<void>          (DDL / migrations)
 *   db.transaction(fn)       → Promise<T>             (atomic batch)
 *   db.client                → 'sqlite' | 'postgres'
 */

'use strict';

const DB_CLIENT = (process.env.DB_CLIENT || 'sqlite').toLowerCase();

// ─────────────────────────────────────────────────────────────────────────────
// SQLite adapter
// ─────────────────────────────────────────────────────────────────────────────
function buildSQLiteAdapter() {
  const Database = require('better-sqlite3');
  const path     = require('path');
  const dbPath   = process.env.DB_PATH || path.join(__dirname, 'infohub.db');
  const raw      = new Database(dbPath);

  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');

  return {
    client: 'sqlite',

    get(sql, params = []) {
      return Promise.resolve(raw.prepare(sql).get(...params));
    },

    all(sql, params = []) {
      return Promise.resolve(raw.prepare(sql).all(...params));
    },

    run(sql, params = []) {
      const info = raw.prepare(sql).run(...params);
      return Promise.resolve({ lastID: info.lastInsertRowid, changes: info.changes });
    },

    exec(sql) {
      raw.exec(sql);
      return Promise.resolve();
    },

    async transaction(fn) {
      // better-sqlite3 transactions are synchronous — wrap result in a Promise
      let result;
      const txn = raw.transaction(() => { result = fn(); });
      txn();
      return result;
    },

    // Expose raw handle for migrations / introspection
    _raw: raw,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PostgreSQL adapter
// ─────────────────────────────────────────────────────────────────────────────
function buildPostgresAdapter() {
  const { Pool } = require('pg');

  if (!process.env.DATABASE_URL) {
    throw new Error('DB_CLIENT=postgres requires DATABASE_URL to be set.');
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Recommended for local network / self-hosted deployments:
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  pool.on('error', (err) => {
    console.error('PostgreSQL pool error:', err.message);
  });

  /**
   * SQLite uses positional ? placeholders; PostgreSQL uses $1, $2 …
   * This helper rewrites ? → $N so callers can write SQLite-style SQL.
   */
  function rewritePlaceholders(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  }

  return {
    client: 'postgres',

    async get(sql, params = []) {
      const { rows } = await pool.query(rewritePlaceholders(sql), params);
      return rows[0];
    },

    async all(sql, params = []) {
      const { rows } = await pool.query(rewritePlaceholders(sql), params);
      return rows;
    },

    async run(sql, params = []) {
      // PostgreSQL doesn't return lastInsertRowid unless we ask with RETURNING
      // Route files must append "RETURNING id" for INSERT statements.
      const { rows, rowCount } = await pool.query(rewritePlaceholders(sql), params);
      return {
        lastID:  rows[0]?.id ?? null,
        changes: rowCount,
      };
    },

    async exec(sql) {
      await pool.query(sql);
    },

    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },

    // Expose pool for advanced use
    _pool: pool,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Build the adapter
// ─────────────────────────────────────────────────────────────────────────────
let db;
if (DB_CLIENT === 'postgres') {
  db = buildPostgresAdapter();
  console.log('Database: PostgreSQL');
} else {
  db = buildSQLiteAdapter();
  console.log(`Database: SQLite (${process.env.DB_PATH || './server/infohub.db'})`);
}

module.exports = db;