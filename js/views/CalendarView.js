/**
 * CalendarView
 * Responsible for all calendar-related DOM rendering.
 * Never mutates model state — receives data, writes to DOM only.
 */
const CalendarView = (() => {

  const MONTHS     = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function _sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth()    === b.getMonth()    &&
           a.getDate()     === b.getDate();
  }

  // ── Month grid (desktop) ─────────────────────────────────────────────────────

  /**
   * Render the monthly grid.
   * @param {number} year
   * @param {number} month  0-based
   * @param {Date}   today
   * @param {Date|null} selectedDate
   * @param {function} getEntries  (isoKey) => entry[]
   * @param {function} onDayClick  (date) => void
   */
  function renderMonthGrid(year, month, today, selectedDate, getEntries, onDayClick) {
    document.getElementById('calMonthLabel').textContent = `${MONTHS[month]} ${year}`;

    const firstDay    = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev  = new Date(year, month, 0).getDate();
    const totalCells  = Math.ceil((firstDay + daysInMonth) / 7) * 7;

    const grid = document.getElementById('calGrid');
    grid.innerHTML = '';

    for (let i = 0; i < totalCells; i++) {
      let date, otherMonth = false;
      if (i < firstDay) {
        date = new Date(year, month - 1, daysInPrev - firstDay + i + 1);
        otherMonth = true;
      } else if (i >= firstDay + daysInMonth) {
        date = new Date(year, month + 1, i - firstDay - daysInMonth + 1);
        otherMonth = true;
      } else {
        date = new Date(year, month, i - firstDay + 1);
      }

      const cell = document.createElement('div');
      cell.className = [
        'cal-day',
        otherMonth                              ? 'other-month' : '',
        _sameDay(date, today)                   ? 'today'       : '',
        selectedDate && _sameDay(date, selectedDate) ? 'selected' : '',
      ].filter(Boolean).join(' ');

      const num = document.createElement('div');
      num.className   = 'day-num';
      num.textContent = date.getDate();
      cell.appendChild(num);

      const isoKey = CalendarModel.toKey(date);
      const entries = getEntries(isoKey);
      const maxChips = 2;

      entries.slice(0, maxChips).forEach(e => {
        const chip = document.createElement('div');
        chip.className   = `cal-event-chip chip-${e.type}`;
        chip.textContent = (e.time ? e.time + ' ' : '') + e.title;
        chip.title       = e.title;
        cell.appendChild(chip);
      });

      if (entries.length > maxChips) {
        const more = document.createElement('div');
        more.className   = 'cal-event-chip chip-more';
        more.textContent = `+${entries.length - maxChips} more`;
        cell.appendChild(more);
      }

      cell.addEventListener('click', () => onDayClick(date));
      grid.appendChild(cell);
    }
  }

  /**
   * Render the day detail panel below the grid.
   * @param {Date}     date
   * @param {Array}    entries
   */
  function renderDayDetail(date, entries) {
    const label = date.toLocaleDateString('en-AU', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    document.getElementById('dayDetailTitle').textContent = label;

    const cont = document.getElementById('dayDetailItems');
    if (entries.length === 0) {
      cont.innerHTML = '<div class="day-detail-empty">Nothing scheduled.</div>';
      return;
    }

    cont.innerHTML = entries.map(e => `
      <div class="detail-item">
        <div class="detail-dot dot-${e.type}"></div>
        <div class="detail-info">
          <div class="detail-name">${_esc(e.title)}</div>
          ${e.time ? `<div class="detail-meta">⏰ ${e.time}</div>` : ''}
        </div>
        <span class="detail-type-badge badge-${e.type}">${e.type}</span>
      </div>
    `).join('');
  }

  // ── Mobile 3-day agenda ──────────────────────────────────────────────────────

  /**
   * Render the 3-day agenda columns.
   * @param {Date}     agendaStart  First of the 3 days
   * @param {Date}     today
   * @param {function} getEntries   (isoKey) => entry[]
   * @param {string|null} direction 'left' | 'right' | null (no animation)
   */
  function renderAgenda(agendaStart, today, getEntries, direction) {
    const track = document.getElementById('agendaTrack');
    const label = document.getElementById('agendaRangeLabel');
    if (!track || !label) return;

    const days = [0, 1, 2].map(i => {
      const d = new Date(agendaStart);
      d.setDate(d.getDate() + i);
      return d;
    });

    const fmt = d => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
    label.textContent = `${fmt(days[0])} – ${fmt(days[2])}`;

    const newHTML = days.map(date => _colHTML(date, today, getEntries)).join('');

    if (!direction) {
      track.innerHTML = newHTML;
      return;
    }

    if (direction === 'right') {
      track.style.transition = 'none';
      track.style.transform  = 'translateX(0)';
      const incoming = _makeIncoming(newHTML);
      track.appendChild(incoming);
      requestAnimationFrame(() => {
        track.style.transition = 'transform 0.32s cubic-bezier(0.4,0,0.2,1)';
        track.style.transform  = 'translateX(-50%)';
        setTimeout(() => { track.innerHTML = newHTML; track.style.transition = 'none'; track.style.transform = 'translateX(0)'; }, 340);
      });
    } else {
      track.style.transition = 'none';
      track.style.transform  = 'translateX(-50%)';
      const incoming = _makeIncoming(newHTML);
      track.insertBefore(incoming, track.firstChild);
      requestAnimationFrame(() => {
        track.style.transition = 'transform 0.32s cubic-bezier(0.4,0,0.2,1)';
        track.style.transform  = 'translateX(0)';
        setTimeout(() => { track.innerHTML = newHTML; track.style.transition = 'none'; track.style.transform = 'translateX(0)'; }, 340);
      });
    }
  }

  function _makeIncoming(html) {
    const div = document.createElement('div');
    div.style.cssText = 'display:flex;width:100%;flex-shrink:0;';
    div.innerHTML = html;
    return div;
  }

  function _colHTML(date, today, getEntries) {
    const isoKey  = CalendarModel.toKey(date);
    const entries = getEntries(isoKey);
    const isToday = _sameDay(date, today);
    const hdrCls  = isToday ? 'agenda-col-header is-today' : 'agenda-col-header';

    let html = `<div class="agenda-col">
      <div class="${hdrCls}">
        <div class="agenda-dow">${DAYS_SHORT[date.getDay()]}</div>
        <div class="agenda-dom">${date.getDate()}</div>
      </div>`;

    if (entries.length === 0) {
      html += '<div class="agenda-empty">Free</div>';
    } else {
      entries.forEach(e => {
        html += `<div class="agenda-entry atype-${e.type}">
          <div class="agenda-entry-title">${_esc(e.title)}</div>
          ${e.time ? `<div class="agenda-entry-time">⏰ ${e.time}</div>` : ''}
        </div>`;
      });
    }

    html += '</div>';
    return html;
  }

  // ── Colour swatches (modal) ──────────────────────────────────────────────────

  /**
   * Build and insert colour swatches into the event modal.
   * @param {string[]} colors  Array of hex strings
   */
  function buildColorSwatches(colors) {
    const row = document.getElementById('event-colors');
    if (!row) return;
    colors.forEach((c, i) => {
      const sw = document.createElement('div');
      sw.className   = 'color-swatch' + (i === 0 ? ' selected' : '');
      sw.style.background = c;
      sw.addEventListener('click', () => {
        row.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        sw.classList.add('selected');
      });
      row.appendChild(sw);
    });
  }

  return {
    renderMonthGrid,
    renderDayDetail,
    renderAgenda,
    buildColorSwatches,
  };

})();
