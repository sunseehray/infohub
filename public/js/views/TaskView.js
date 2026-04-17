/**
 * TaskView
 * Responsible for all task-table DOM rendering.
 * Never mutates model state — receives data, writes to DOM only.
 */
const TaskView = (() => {

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function _fmtDate(iso) {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  }

  function _dueCls(iso) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const due   = new Date(iso + 'T00:00:00');
    if (due < today) return 'overdue';
    if (due.toDateString() === today.toDateString()) return 'today';
    return '';
  }

  function _dueLabel(iso) {
    const cls = _dueCls(iso), base = _fmtDate(iso);
    return cls === 'overdue' ? `${base} (overdue)` : cls === 'today' ? `${base} (today)` : base;
  }

  function _initials(username) {
    if (!username) return '?';
    return username.replace(/[._]/g, ' ').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }

  function _ptsCls(p) { return p >= 10 ? 'high' : p >= 5 ? 'med' : ''; }

  // ── Public ───────────────────────────────────────────────────────────────────

  /**
   * Re-render the table body, count label, sort icons, and pagination.
   *
   * @param {Object}   result       Return value of TaskModel.getPage()
   * @param {string}   sortCol      Current sort column key
   * @param {string}   sortDir      'asc' | 'desc'
   * @param {number}   currentPage
   * @param {Object}   statusClass  Map of status string → CSS class
   * @param {function} onSort       (col) => void
   * @param {function} onPage       (pageNum) => void
   */
  function render(result, sortCol, sortDir, currentPage, statusClass, onSort, onPage) {
    const { rows, total, start, pages } = result;

    _renderSortIcons(sortCol, sortDir);
    _renderCount(total, start, rows.length);
    _renderRows(rows, statusClass);
    _renderPagination(currentPage, pages, onPage);
  }

  function _renderSortIcons(sortCol, sortDir) {
    ['title', 'points', 'dueDate', 'status'].forEach(col => {
      const el = document.getElementById('sort-' + col);
      if (!el) return;
      el.textContent = col === sortCol ? (sortDir === 'asc' ? '↑' : '↓') : '↕';
      el.parentElement.classList.toggle('sorted', col === sortCol);
    });
  }

  function _renderCount(total, start, pageLen) {
    const el = document.getElementById('tableCount');
    if (!el) return;
    el.textContent = total === 0
      ? 'No tasks found'
      : `Showing ${start + 1}–${start + pageLen} of ${total} task${total !== 1 ? 's' : ''}`;
  }

  function _renderRows(rows, statusClass) {
    const tbody = document.getElementById('taskTableBody');
    if (!tbody) return;

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:48px;color:var(--ink-muted);font-style:italic;">No tasks match your filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(t => `
      <tr>
        <td class="td-title">${_esc(t.title)}</td>
        <td class="td-desc"><div class="td-desc-text">${_esc(t.description)}</div></td>
        <td><span class="points-badge ${_ptsCls(t.points)}">${t.points}</span></td>
        <td class="td-due ${_dueCls(t.dueDate)}">${_dueLabel(t.dueDate)}</td>
        <td><span class="status-pill ${statusClass[t.status]}">${_esc(t.status)}</span></td>
        <td>${t.assignee
          ? `<div class="td-assignee"><div class="avatar">${_initials(t.assignee)}</div><span class="assignee-name">@${_esc(t.assignee)}</span></div>`
          : '<span class="unassigned">Unassigned</span>'
        }</td>
      </tr>
    `).join('');
  }

  function _renderPagination(currentPage, pages, onPage) {
    const el = document.getElementById('pagination');
    if (!el) return;

    let html = `<button class="pg-btn" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">← Prev</button>`;
    for (let i = 1; i <= pages; i++) {
      html += `<button class="pg-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    html += `<button class="pg-btn" ${currentPage === pages ? 'disabled' : ''} data-page="${currentPage + 1}">Next →</button>`;

    el.innerHTML = html;

    // Delegate click — avoids inline onclick attributes
    el.querySelectorAll('.pg-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => onPage(Number(btn.dataset.page)));
    });
  }

  return { render };

})();
