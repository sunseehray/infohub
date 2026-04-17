/**
 * CalendarController.js  (async)
 * Coordinates CalendarModel ↔ CalendarView.
 * Model calls are now async (API-backed), so rendering is deferred until
 * data is ready. All public methods that trigger data fetches are async.
 */
const CalendarController = (() => {

  const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0);

  let calYear      = TODAY.getFullYear();
  let calMonth     = TODAY.getMonth();
  let selectedDate = null;
  let agendaStart  = new Date(TODAY);

  const EVENT_COLORS = ['#1A4F7A','#2E6B4F','#C4570F','#5B3A8E','#92400E','#1A6B6B','#7A2E2E','#6B6B1A'];

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function _isMobile() { return window.innerWidth <= 768; }

  function _monthRange(year, month) {
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const to   = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`;
    return { from, to };
  }

  // ── Month calendar ────────────────────────────────────────────────────────────

  async function _renderAll() {
    // Fetch the entire month's entries into cache, then render
    const { from, to } = _monthRange(calYear, calMonth);
    try {
      await CalendarModel.fetchRange(from, to);
    } catch (err) {
      console.error('Calendar fetch error:', err);
    }

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

  async function _selectDay(date) {
    selectedDate = date;
    const isoKey = CalendarModel.toKey(date);

    // Fetch this day specifically (ensures cache is fresh for day detail)
    try {
      await CalendarModel.fetchDate(isoKey);
    } catch (err) {
      console.error('Day fetch error:', err);
    }

    // Re-render the grid to update the selected highlight
    CalendarView.renderMonthGrid(
      calYear, calMonth, TODAY, selectedDate,
      CalendarModel.getEntries,
      _selectDay,
    );
    CalendarView.renderDayDetail(date, CalendarModel.getEntries(isoKey));
  }

  async function calNav(dir) {
    if (dir === 0) {
      calYear  = TODAY.getFullYear();
      calMonth = TODAY.getMonth();
    } else {
      calMonth += dir;
      if (calMonth < 0)  { calMonth = 11; calYear--; }
      if (calMonth > 11) { calMonth = 0;  calYear++; }
    }
    await _renderAll();
  }

  // ── Mobile agenda ─────────────────────────────────────────────────────────────

  async function agendaNav(delta) {
    const d = new Date(agendaStart);
    d.setDate(d.getDate() + delta);
    agendaStart = d;

    // Fetch the 3 days about to be shown
    const keys = [0, 1, 2].map(i => {
      const day = new Date(agendaStart);
      day.setDate(day.getDate() + i);
      return CalendarModel.toKey(day);
    });

    try {
      await Promise.all(keys.map(k => CalendarModel.fetchDate(k)));
    } catch (err) {
      console.error('Agenda fetch error:', err);
    }

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

  // ── Wheel FAB ─────────────────────────────────────────────────────────────────

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

  // ── Modals ────────────────────────────────────────────────────────────────────

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

  async function saveEntry(type) {
    const dateEl  = document.getElementById(type + '-date');
    const titleEl = document.querySelector(`#modal-${type} .form-input[type="text"]`);
    const timeEl  = document.querySelector(`#modal-${type} input[type="time"]`);

    const title   = titleEl?.value.trim() || '';
    const dateVal = dateEl?.value || '';

    if (!title) { titleEl?.focus(); return; }

    const isoKey  = dateVal || CalendarModel.toKey(TODAY);
    const entryObj = { type, title };
    if (timeEl?.value) entryObj.time = timeEl.value;

    if (type === 'event') {
      const sel = document.querySelector('#event-colors .color-swatch.selected');
      if (sel) entryObj.color = sel.style.background;
    }

    try {
      await CalendarModel.addEntry(isoKey, entryObj);

      // Refresh the view
      const saved = new Date(isoKey + 'T00:00:00');
      if (saved.getFullYear() === calYear && saved.getMonth() === calMonth) {
        await _selectDay(saved);
      }

      if (_isMobile()) {
        CalendarView.renderAgenda(agendaStart, TODAY, CalendarModel.getEntries, null);
      }
    } catch (err) {
      console.error('saveEntry error:', err);
      alert(`Could not save entry: ${err.message}`);
      return;
    }

    // Clear fields and close
    document.querySelectorAll(`#modal-${type} .form-input, #modal-${type} .form-textarea`)
      .forEach(el => { el.value = ''; });
    closeModal(type);
  }

  // ── Init ──────────────────────────────────────────────────────────────────────

  async function init() {
    // Month nav
    document.querySelector('[data-cal-nav="-1"]')?.addEventListener('click', () => calNav(-1));
    document.querySelector('[data-cal-nav="0"]')?.addEventListener('click',  () => calNav(0));
    document.querySelector('[data-cal-nav="1"]')?.addEventListener('click',  () => calNav(1));

    // Agenda nav
    document.querySelector('[data-agenda-nav="-3"]')?.addEventListener('click', () => agendaNav(-3));
    document.querySelector('[data-agenda-nav="3"]')?.addEventListener('click',  () => agendaNav(3));

    // Wheel FAB
    document.getElementById('calFab')?.addEventListener('click', toggleWheel);
    document.getElementById('wheelBackdrop')?.addEventListener('click', closeWheel);

    // Wheel options
    document.querySelector('.wo-event')?.addEventListener('click',    () => openModal('event'));
    document.querySelector('.wo-task')?.addEventListener('click',     () => openModal('task'));
    document.querySelector('.wo-reminder')?.addEventListener('click', () => openModal('reminder'));

    // Modal close / save
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

    CalendarView.buildColorSwatches(EVENT_COLORS);

    // Initial renders
    await _selectDay(TODAY);

    // Fetch agenda days
    const agendaKeys = [0, 1, 2].map(i => {
      const d = new Date(agendaStart);
      d.setDate(d.getDate() + i);
      return CalendarModel.toKey(d);
    });
    try {
      await Promise.all(agendaKeys.map(k => CalendarModel.fetchDate(k)));
    } catch (err) {
      console.error('Initial agenda fetch error:', err);
    }
    CalendarView.renderAgenda(agendaStart, TODAY, CalendarModel.getEntries, null);

    _initSwipe();
  }

  return { init, calNav, agendaNav, openModal, closeModal, saveEntry, toggleWheel };

})();