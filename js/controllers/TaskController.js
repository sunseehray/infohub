/**
 * TaskController
 * Handles all task-page interactions: search, status filter, column sort, pagination.
 * Reads from TaskModel, delegates rendering to TaskView.
 */
const TaskController = (() => {

  // ── Core render call ─────────────────────────────────────────────────────────

  function _refresh() {
    const searchTerm   = document.getElementById('taskSearch')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('statusFilter')?.value || '';

    const result = TaskModel.getPage(searchTerm, statusFilter);

    TaskView.render(
      result,
      TaskModel.getSortCol(),
      TaskModel.getSortDir(),
      TaskModel.getCurrentPage(),
      TaskModel.getStatusClass(),
      _onSort,
      _onPage,
    );
  }

  // ── Event handlers ───────────────────────────────────────────────────────────

  function _onSort(col) {
    TaskModel.setSort(col);
    _refresh();
  }

  function _onPage(pageNum) {
    const searchTerm   = document.getElementById('taskSearch')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('statusFilter')?.value || '';
    const total = TaskModel.getPage(searchTerm, statusFilter).total;
    TaskModel.setPage(pageNum, total);
    _refresh();
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  function init() {
    // Search input
    document.getElementById('taskSearch')
      ?.addEventListener('input', _refresh);

    // Status filter dropdown
    document.getElementById('statusFilter')
      ?.addEventListener('change', _refresh);

    // Sortable column headers (use data attributes to avoid inline onclick)
    document.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => _onSort(th.dataset.sort));
    });

    // Initial render
    _refresh();
  }

  return { init };

})();
