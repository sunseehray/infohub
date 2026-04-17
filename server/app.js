/**
 * app.js
 * Express entry point — serves static frontend and mounts all API routes.
 */

const express = require('express');
const path    = require('path');
const db      = require('./db');

const usersRouter     = require('./routes/users');
const tasksRouter     = require('./routes/tasks');
const calendarRouter  = require('./routes/calendar');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());

// Serve the frontend from /public
app.use(express.static(path.join(__dirname, '../public')));

// ── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/users',    usersRouter);
app.use('/api/tasks',    tasksRouter);
app.use('/api/calendar', calendarRouter);

// ── Catch-all: return index.html for any non-API route ───────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`InfoHub running at http://localhost:${PORT}`);
  console.log(`Local network: http://<your-ip>:${PORT}`);
});