# InfoHub — Local Network Setup

## Project Structure

```
infohub/
│
├── package.json                  ← npm config & scripts
│
├── server/                       ← Express backend
│   ├── app.js                    ← Entry point, mounts routes, serves /public
│   ├── db.js                     ← SQLite connection, schema, seed data
│   ├── infohub.db                ← Created automatically on first run
│   └── routes/
│       ├── users.js              ← GET/POST/PUT/DELETE /api/users
│       ├── tasks.js              ← GET/POST/PUT/DELETE /api/tasks
│       └── calendar.js           ← GET/POST/PUT/DELETE /api/calendar
│
└── public/                       ← Frontend (your existing files, moved here)
    ├── index.html
    ├── css/
    │   ├── base.css
    │   ├── layout.css
    │   ├── home.css
    │   ├── calendar.css
    │   ├── tasks.css
    │   └── modals.css
    └── js/
        ├── models/
        │   ├── CalendarModel.js  ← Now fetches from /api/calendar
        │   └── TaskModel.js      ← Now fetches from /api/tasks
        ├── views/
        │   ├── CalendarView.js   ← Unchanged
        │   └── TaskView.js       ← Unchanged
        ├── controllers/
        │   ├── AppController.js      ← Unchanged
        │   ├── CalendarController.js ← Now uses async model calls
        │   └── TaskController.js     ← Now uses async model calls
        └── main.js               ← Unchanged
```

---

## First-Time Setup

> **One-time requirement:** Node.js must be installed. After that, the app
> runs fully offline on your local network.

### 1. Install Node.js (once, needs internet)

Download from https://nodejs.org — use the LTS version.

### 2. Install dependencies (once, needs internet)

```bash
cd infohub
npm install
```

### 3. Move your frontend files into /public

Copy your existing HTML, CSS, and JS files into the `public/` folder,
matching the structure shown above. Replace the model and controller files
with the new API-backed versions provided.

### 4. Start the server

```bash
npm start
```

You should see:
```
InfoHub running at http://localhost:3000
Local network: http://<your-ip>:3000
```

### 5. Find your local IP address

**macOS/Linux:**
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

**Windows:**
```bash
ipconfig
```
Look for your `IPv4 Address` (e.g. `192.168.1.42`).

Other devices on your WiFi can now open `http://192.168.1.42:3000`.

---

## Development (auto-restart on file changes)

```bash
npm run dev
```

Requires `nodemon` (included as a dev dependency).

---

## Resetting Data

Delete `server/infohub.db` and restart. The database and demo seed data
will be recreated automatically.

---

## API Reference

All endpoints return `{ data: ... }` on success or `{ error: "..." }` on failure.

### Users

| Method | Endpoint          | Description     |
|--------|-------------------|-----------------|
| GET    | /api/users        | List all users  |
| GET    | /api/users/:id    | Get one user    |
| POST   | /api/users        | Create user     |
| PUT    | /api/users/:id    | Update user     |
| DELETE | /api/users/:id    | Delete user     |

**POST/PUT body:**
```json
{
  "username":     "j.smith",
  "display_name": "Jane Smith",
  "email":        "jane@home.local",
  "role":         "member"
}
```

### Tasks

| Method | Endpoint          | Description                     |
|--------|-------------------|---------------------------------|
| GET    | /api/tasks        | List tasks (filterable, paged)  |
| GET    | /api/tasks/:id    | Get one task                    |
| POST   | /api/tasks        | Create task                     |
| PUT    | /api/tasks/:id    | Update task                     |
| DELETE | /api/tasks/:id    | Delete task                     |

**GET query params:** `?search=text&status=Open&sort=due_date&dir=asc&page=1&per_page=8`

**POST/PUT body:**
```json
{
  "title":       "Fix the gate",
  "description": "Latch is broken on the side gate.",
  "points":      5,
  "due_date":    "2026-05-01",
  "status":      "Open",
  "assignee_id": 2
}
```

### Calendar

| Method | Endpoint                    | Description              |
|--------|-----------------------------|--------------------------|
| GET    | /api/calendar               | All entries (date range) |
| GET    | /api/calendar/date/:date    | Entries for one day      |
| GET    | /api/calendar/:id           | Get one entry            |
| POST   | /api/calendar               | Create entry             |
| PUT    | /api/calendar/:id           | Update entry             |
| DELETE | /api/calendar/:id           | Delete entry             |

**GET query params:** `?from=2026-04-01&to=2026-04-30`

**POST/PUT body:**
```json
{
  "type":       "event",
  "title":      "Family dinner",
  "entry_date": "2026-04-25",
  "time":       "18:30",
  "color":      "#2E6B4F"
}
```