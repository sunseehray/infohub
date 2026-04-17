/**
 * TaskModel.js  (API-backed)
 * All data now lives in SQLite via the Express API.
 * The in-memory sort/page state is kept here; actual filtering/sorting/pagination
 * is delegated to the server so the query is always consistent.
 */
const TaskModel = (() => {

  // ── UI state ───────────────────────────────────────────────────────────────
  let sortCol     = 'due_date';
  let sortDir     = 'asc';
  let currentPage = 1;
  const PER_PAGE  = 8;

  const STATUS_CLASS = {
    'Open':       's-open',
    'Reserved':   's-reserved',
    'For Review': 's-forreview',
    'Issue':      's-issue',
    'Done':       's-done',
  };

  // ── Accessors ──────────────────────────────────────────────────────────────
  function getSortCol()     { return sortCol; }
  function getSortDir()     { return sortDir; }
  function getCurrentPage() { return currentPage; }
  function getPerPage()     { return PER_PAGE; }
  function getStatusClass() { return STATUS_CLASS; }

  function setSort(col) {
    // Map frontend col key → DB column name
    const colMap = { title: 'title', points: 'points', dueDate: 'due_date', status: 'status' };
    const dbCol  = colMap[col] || col;
    sortDir  = (sortCol === dbCol && sortDir === 'asc') ? 'desc' : 'asc';
    sortCol  = dbCol;
    currentPage = 1;
  }

  function setPage(p) {
    currentPage = Math.max(1, p);
  }

  /**
   * Fetch a page of tasks from the API.
   * Returns a Promise that resolves to { rows, total, start, pages }.
   */
  async function getPage(searchTerm = '', statusFilter = '') {
    const params = new URLSearchParams({
      search:   searchTerm,
      status:   statusFilter,
      sort:     sortCol,
      dir:      sortDir,
      page:     currentPage,
      per_page: PER_PAGE,
    });

    const res  = await fetch(`/api/tasks?${params}`);
    const json = await res.json();

    if (!res.ok) throw new Error(json.error || 'Failed to fetch tasks');

    const { data, meta } = json;

    // Remap snake_case DB fields → camelCase for TaskView compatibility
    const rows = data.map(t => ({
      id:          t.id,
      title:       t.title,
      description: t.description,
      points:      t.points,
      dueDate:     t.due_date,
      status:      t.status,
      assignee:    t.assignee_username || null,
    }));

    // Clamp currentPage in case server adjusted it
    currentPage = meta.page;

    return {
      rows,
      total: meta.total,
      start: (meta.page - 1) * meta.per_page,
      pages: meta.pages,
    };
  }

  /**
   * Create a new task.
   * @param {Object} fields  { title, description, points, due_date, status, assignee_id }
   * @returns {Promise<Object>}  created task
   */
  async function createTask(fields) {
    const res  = await fetch('/api/tasks', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(fields),
    });
    const json = await res.json();
    if (!res.ok) throw new Error((json.errors || [json.error]).join(', '));
    return json.data;
  }

  /**
   * Update an existing task.
   * @param {number} id
   * @param {Object} fields  Partial task fields
   * @returns {Promise<Object>}  updated task
   */
  async function updateTask(id, fields) {
    const res  = await fetch(`/api/tasks/${id}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(fields),
    });
    const json = await res.json();
    if (!res.ok) throw new Error((json.errors || [json.error]).join(', '));
    return json.data;
  }

  /**
   * Delete a task by ID.
   * @param {number} id
   */
  async function deleteTask(id) {
    const res  = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Delete failed');
    return json.message;
  }

  /**
   * Fetch all users for the assignee dropdown.
   * @returns {Promise<Array>}
   */
  async function getUsers() {
    const res  = await fetch('/api/users');
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch users');
    return json.data;
  }

  return {
    getSortCol, getSortDir, getCurrentPage, getPerPage, getStatusClass,
    setSort, setPage,
    getPage, createTask, updateTask, deleteTask, getUsers,
  };

})();