/**
 * app.js
 * Express entry point — serves static frontend and mounts all API routes.
 * Auth is now required for all /api/* endpoints (except /api/auth/login).
 */

'use strict';

// Load .env file into process.env (must be first!)
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express      = require('express');
const path         = require('path');
const cookieParser = require('cookie-parser');
const migrate      = require('./migrate');

const authRouter     = require('./routes/auth');
const usersRouter    = require('./routes/users');
const tasksRouter    = require('./routes/tasks');
const calendarRouter = require('./routes/calendar');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());

// Serve frontend from /public
app.use(express.static(path.join(__dirname, '../public')));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',     authRouter);
app.use('/api/users',    usersRouter);
app.use('/api/tasks',    tasksRouter);
app.use('/api/calendar', calendarRouter);

// ── Catch-all: return index.html for any non-API route ───────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── Start after migrations complete ──────────────────────────────────────────
migrate()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`InfoHub running at http://localhost:${PORT}`);
      console.log(`Local network: http://<your-ip>:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Startup failed during migration:', err);
    process.exit(1);
  });