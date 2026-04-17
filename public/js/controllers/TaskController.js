/**
 * TaskController.js  (async)
 * Handles all task-page interactions. TaskModel.getPage() is now async
 * so _refresh() is an async function — errors are caught and shown inline.
 */
const TaskController = (() => {

  // ── Core render call ─────────────────────────────────────────────────────────

  async function _refresh() {
    const searchTerm   = document.getElementById('taskSearch')?.value.toLowerCase().trim() || '';
    const statusFilter = document.getElementById('statusFilter')?.value || '';

    try {
      const result = await TaskModel.getPage(searchTerm, statusFilter);

      TaskView.render(
        result,
        TaskModel.getSortCol(),
        TaskModel.getSortDir(),
        TaskModel.getCurrentPage(),
        TaskModel.getStatusClass(),
        _onSort,
        _onPage,
      );
    } catch (err) {
      console.error('TaskController._refresh error:', err);
      const tbody = document.getElementById('taskTableBody');
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:48px;color:var(--accent-warm);font-style:italic;">
          ⚠️ Could not load tasks: ${err.message}
        </td></tr>`;
      }
    }
  }

  // ── Event handlers ────────────────────────────────────────────────────────────

  function _onSort(col) {
    TaskModel.setSort(col);
    _refresh();
  }

  function _onPage(pageNum) {
    TaskModel.setPage(pageNum);
    _refresh();
  }

  // ── Init ──────────────────────────────────────────────────────────────────────

  function init() {
    document.getElementById('taskSearch')
      ?.addEventListener('input', _refresh);

    document.getElementById('statusFilter')
      ?.addEventListener('change', _refresh);

    document.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => _onSort(th.dataset.sort));
    });

    _refresh();
  }

  return { init, refresh: _refresh };

})();