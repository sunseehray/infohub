/**
 * TaskModel
 * Holds the task dataset and all UI state for filtering, sorting, and pagination.
 * Replace TASKS with an API fetch when the backend is ready.
 */
const TaskModel = (() => {

  // ── Static seed data (replace with API response) ──────────────────────────
  const TASKS = [
    { id: 1,  title: 'Submit quarterly budget report',  description: 'Compile all departmental spending data and submit the Q1 2026 budget report to the finance team.',  points: 15, dueDate: '2026-04-10', status: 'Issue',      assignee: 'lmartin'  },
    { id: 2,  title: 'Book dentist appointment',         description: 'Schedule a routine check-up and cleaning at the dentist. Preferred times are weekday mornings.',     points: 3,  dueDate: '2026-04-15', status: 'Open',       assignee: null       },
    { id: 3,  title: 'Water the indoor plants',          description: 'Give all indoor plants a thorough watering and check the soil moisture levels for each pot.',        points: 2,  dueDate: '2026-04-11', status: 'Open',       assignee: 'j.doe'    },
    { id: 4,  title: 'Prep meal plan for next week',     description: 'Plan out 7 days of meals and generate a grocery list from the plan for review.',                     points: 8,  dueDate: '2026-04-13', status: 'Reserved',   assignee: 'sarah_k'  },
    { id: 5,  title: 'Reply to HOA email',               description: 'Respond to the HOA regarding the upcoming community meeting and proposed bylaw changes.',             points: 4,  dueDate: '2026-04-18', status: 'Open',       assignee: 'lmartin'  },
    { id: 6,  title: 'Deep clean kitchen',               description: 'Scrub stovetop, clean oven, wipe cabinets, and sanitise all countertops and the sink.',              points: 10, dueDate: '2026-04-20', status: 'For Review', assignee: 'j.doe'    },
    { id: 7,  title: 'Renew car registration',           description: 'Complete the annual vehicle registration renewal online and update the license plate sticker.',       points: 5,  dueDate: '2026-04-25', status: 'Open',       assignee: null       },
    { id: 8,  title: 'Organise garage storage',          description: 'Sort, label, and shelve boxes. Dispose of unneeded items and donate to local charity.',              points: 12, dueDate: '2026-05-02', status: 'Open',       assignee: 'sarah_k'  },
    { id: 9,  title: 'Update home insurance policy',     description: 'Review coverage and update to reflect recent renovations and new property valuation.',                points: 6,  dueDate: '2026-04-30', status: 'Reserved',   assignee: 'lmartin'  },
    { id: 10, title: 'Fix leaking bathroom tap',         description: 'Hot-water tap in main bathroom is dripping. Replace washer or call plumber.',                        points: 8,  dueDate: '2026-04-14', status: 'Open',       assignee: null       },
    { id: 11, title: 'Research summer vacation options', description: 'Compare holiday destinations for late July — flights, accommodations, and activities.',               points: 7,  dueDate: '2026-05-10', status: 'Open',       assignee: 'sarah_k'  },
    { id: 12, title: 'Sort and file tax documents',      description: 'Organise all 2025 tax documents and send to accountant for end-of-financial-year processing.',       points: 10, dueDate: '2026-04-09', status: 'Done',       assignee: 'lmartin'  },
  ];

  // ── UI state ───────────────────────────────────────────────────────────────
  let sortCol     = 'dueDate';
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
  function getAll()          { return [...TASKS]; }
  function getSortCol()      { return sortCol; }
  function getSortDir()      { return sortDir; }
  function getCurrentPage()  { return currentPage; }
  function getPerPage()      { return PER_PAGE; }
  function getStatusClass()  { return STATUS_CLASS; }

  function setSort(col) {
    sortDir = (sortCol === col && sortDir === 'asc') ? 'desc' : 'asc';
    sortCol = col;
    currentPage = 1;
  }

  function setPage(p, totalFiltered) {
    const pages = Math.max(1, Math.ceil(totalFiltered / PER_PAGE));
    currentPage = Math.max(1, Math.min(p, pages));
  }

  /** Return filtered + sorted slice and total for the current state */
  function getPage(searchTerm, statusFilter) {
    let rows = TASKS.filter(t => {
      const matchSearch = !searchTerm ||
        t.title.toLowerCase().includes(searchTerm) ||
        t.description.toLowerCase().includes(searchTerm) ||
        (t.assignee && t.assignee.toLowerCase().includes(searchTerm));
      const matchStatus = !statusFilter || t.status === statusFilter;
      return matchSearch && matchStatus;
    });

    rows.sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol];
      if (sortCol === 'dueDate') { av = new Date(av); bv = new Date(bv); }
      return (av < bv ? -1 : av > bv ? 1 : 0) * (sortDir === 'asc' ? 1 : -1);
    });

    const total  = rows.length;
    const pages  = Math.max(1, Math.ceil(total / PER_PAGE));
    if (currentPage > pages) currentPage = pages;
    const start  = (currentPage - 1) * PER_PAGE;

    return {
      rows:    rows.slice(start, start + PER_PAGE),
      total,
      start,
      pages,
    };
  }

  return { getAll, getSortCol, getSortDir, getCurrentPage, getPerPage, getStatusClass, setSort, setPage, getPage };

})();
