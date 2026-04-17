/**
 * CalendarController
 * Coordinates CalendarModel ↔ CalendarView and handles all calendar interactions:
 * month navigation, day selection, wheel FAB, modals, and touch swipe.
 */
const CalendarController = (() => {

  const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0);

  let calYear      = TODAY.getFullYear();
  let calMonth     = TODAY.getMonth();   // 0-based
  let selectedDate = null;

  let agendaStart  = new Date(TODAY);    // First of the 3 visible agenda days

  const EVENT_COLORS = ['#1A4F7A','#2E6B4F','#C4570F','#5B3A8E','#92400E','#1A6B6B','#7A2E2E','#6B6B1A'];

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function _isMobile() { return window.innerWidth <= 768; }

  function _offsetDate(base, days) {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return d;
  }

  // ── Month calendar ───────────────────────────────────────────────────────────

  function _renderAll() {
    CalendarView.renderMonthGrid(
      calYear, calMonth, TODAY, selectedDate,
      CalendarModel.getEntries,
      _selectDay,
    );
    if (selectedDate) {
      CalendarView.renderDayDetail(
        selectedDate,
        CalendarModel.getEntries(CalendarModel.toKey(selectedDate)),
      );
    }
  }

  function _selectDay(date) {
    selectedDate = date;
    _renderAll();
    CalendarView.renderDayDetail(
      date,
      CalendarModel.getEntries(CalendarModel.toKey(date)),
    );
  }

  function calNav(dir) {
    if (dir === 0) {
      calYear  = TODAY.getFullYear();
      calMonth = TODAY.getMonth();
    } else {
      calMonth += dir;
      if (calMonth < 0)  { calMonth = 11; calYear--; }
      if (calMonth > 11) { calMonth = 0;  calYear++; }
    }
    _renderAll();
  }

  // ── Mobile agenda ────────────────────────────────────────────────────────────

  function agendaNav(delta) {
    agendaStart = _offsetDate(agendaStart, delta);
    CalendarView.renderAgenda(
      agendaStart, TODAY, CalendarModel.getEntries,
      delta < 0 ? 'left' : 'right',
    );
  }

  function _initSwipe() {
    const wrap = document.getElementById('agendaTrackWrap');
    if (!wrap) return;
    let startX = 0, startY = 0;

    wrap.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });

    wrap.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
        agendaNav(dx < 0 ? 3 : -3);
      }
    }, { passive: true });
  }

  // ── Wheel FAB ────────────────────────────────────────────────────────────────

  function toggleWheel() {
    const wrap = document.getElementById('calFabWrap');
    const bd   = document.getElementById('wheelBackdrop');
    const open = wrap.classList.toggle('open');
    bd.classList.toggle('visible', open);
  }

  function closeWheel() {
    document.getElementById('calFabWrap').classList.remove('open');
    document.getElementById('wheelBackdrop').classList.remove('visible');
  }

  // ── Modals ───────────────────────────────────────────────────────────────────

  function openModal(type) {
    closeWheel();
    const d   = selectedDate || TODAY;
    const iso = CalendarModel.toKey(d);
    const el  = document.getElementById(type + '-date');
    if (el) el.value = iso;
    document.getElementById('modal-' + type).classList.add('open');
  }

  function closeModal(type) {
    document.getElementById('modal-' + type).classList.remove('open');
  }

  function saveEntry(type) {
    const dateEl  = document.getElementById(type + '-date');
    const titleEl = document.querySelector(`#modal-${type} .form-input[type="text"]`);
    const timeEl  = document.querySelector(`#modal-${type} input[type="time"]`);

    const title   = titleEl?.value.trim() || '';
    const dateVal = dateEl?.value || '';

    if (!title) { titleEl?.focus(); return; }

    const isoKey = dateVal || CalendarModel.toKey(TODAY);
    const entry  = { type, title };
    if (timeEl?.value) entry.time = timeEl.value;

    if (type === 'event') {
      const sel = document.querySelector('#event-colors .color-swatch.selected');
      if (sel) entry.color = sel.style.background;
    }

    CalendarModel.addEntry(isoKey, entry);

    // Refresh desktop grid if the saved date is in the current month view
    const saved = new Date(isoKey + 'T00:00:00');
    if (saved.getFullYear() === calYear && saved.getMonth() === calMonth) {
      _selectDay(saved);
    }

    // Refresh mobile agenda
    if (_isMobile()) {
      CalendarView.renderAgenda(agendaStart, TODAY, CalendarModel.getEntries, null);
    }

    // Clear fields and close
    document.querySelectorAll(`#modal-${type} .form-input, #modal-${type} .form-textarea`)
      .forEach(el => { el.value = ''; });
    closeModal(type);
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  function init() {
    // Month nav buttons
    document.querySelector('[data-cal-nav="-1"]')?.addEventListener('click', () => calNav(-1));
    document.querySelector('[data-cal-nav="0"]')?.addEventListener('click',  () => calNav(0));
    document.querySelector('[data-cal-nav="1"]')?.addEventListener('click',  () => calNav(1));

    // Agenda nav buttons
    document.querySelector('[data-agenda-nav="-3"]')?.addEventListener('click', () => agendaNav(-3));
    document.querySelector('[data-agenda-nav="3"]')?.addEventListener('click',  () => agendaNav(3));

    // Wheel FAB
    document.getElementById('calFab')?.addEventListener('click', toggleWheel);
    document.getElementById('wheelBackdrop')?.addEventListener('click', closeWheel);

    // Wheel options
    document.querySelector('.wo-event')?.addEventListener('click',    () => openModal('event'));
    document.querySelector('.wo-task')?.addEventListener('click',     () => openModal('task'));
    document.querySelector('.wo-reminder')?.addEventListener('click', () => openModal('reminder'));

    // Modal close buttons and backdrop
    ['event', 'task', 'reminder'].forEach(type => {
      document.querySelector(`#modal-${type} .modal-close`)
        ?.addEventListener('click', () => closeModal(type));
      document.querySelector(`#modal-${type} .btn-cancel`)
        ?.addEventListener('click', () => closeModal(type));
      document.querySelector(`#modal-${type} .btn-save`)
        ?.addEventListener('click', () => saveEntry(type));
      document.getElementById(`modal-${type}`)
        ?.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(type); });
    });

    // Build event colour swatches
    CalendarView.buildColorSwatches(EVENT_COLORS);

    // Seed demo data
    CalendarModel.seedDemo();

    // Initial renders
    _selectDay(TODAY);
    CalendarView.renderAgenda(agendaStart, TODAY, CalendarModel.getEntries, null);
    _initSwipe();
  }

  // Expose only what HTML data-attributes or other controllers need
  return { init, calNav, agendaNav, openModal, closeModal, saveEntry, toggleWheel };

})();
