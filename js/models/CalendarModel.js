/**
 * CalendarModel
 * Manages all calendar entry data in memory.
 * Replace the in-memory store with API calls when the backend is ready.
 */
const CalendarModel = (() => {

  // Internal store: { "YYYY-MM-DD": [ {type, title, time?, color?}, ... ] }
  const _entries = {};

  /** Format a Date as "YYYY-MM-DD" key */
  function toKey(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
  }

  /** Add an entry object to a given ISO key */
  function addEntry(isoKey, entryObj) {
    if (!_entries[isoKey]) _entries[isoKey] = [];
    _entries[isoKey].push(entryObj);
  }

  /** Return all entries for a given ISO key (or empty array) */
  function getEntries(isoKey) {
    return _entries[isoKey] ? [..._entries[isoKey]] : [];
  }

  /** Seed demo entries relative to today */
  function seedDemo() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const offset = (days) => {
      const d = new Date(today);
      d.setDate(d.getDate() + days);
      return toKey(d);
    };

    addEntry(offset(0),  { type: 'event',    title: 'Team standup',        time: '09:00', color: '#1A4F7A' });
    addEntry(offset(0),  { type: 'reminder', title: 'Pay electricity bill', time: '08:00' });
    addEntry(offset(1),  { type: 'task',     title: 'Submit budget report' });
    addEntry(offset(1),  { type: 'event',    title: 'Dentist appointment',  time: '14:30', color: '#2E6B4F' });
    addEntry(offset(-2), { type: 'reminder', title: 'Call landlord' });
  }

  return { toKey, addEntry, getEntries, seedDemo };

})();
