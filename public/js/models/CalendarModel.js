/**
 * CalendarModel.js  (API-backed)
 * Calendar entries are persisted in SQLite via the Express API.
 * A lightweight in-memory cache avoids redundant network calls for
 * dates already fetched within the same session.
 */
const CalendarModel = (() => {

  // In-memory cache: { "YYYY-MM-DD": [ entry, ... ] }
  const _cache = {};

  // ── Date key helper ────────────────────────────────────────────────────────
  function toKey(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
  }

  // ── Cache access ───────────────────────────────────────────────────────────

  /** Return cached entries for a date key (or empty array if not yet fetched) */
  function getEntries(isoKey) {
    return _cache[isoKey] ? [..._cache[isoKey]] : [];
  }

  /** Populate cache with entries from the server */
  function _storeEntries(isoKey, entries) {
    _cache[isoKey] = entries;
  }

  // ── API calls ──────────────────────────────────────────────────────────────

  /**
   * Fetch all entries for a date range and populate the cache.
   * Call this when rendering a month so all days are ready.
   * @param {string} from  YYYY-MM-DD
   * @param {string} to    YYYY-MM-DD
   */
  async function fetchRange(from, to) {
    const res  = await Auth.apiFetch(`/api/calendar?from=${from}&to=${to}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch calendar entries');

    // Group by date into the cache
    json.data.forEach(entry => {
      if (!_cache[entry.entry_date]) _cache[entry.entry_date] = [];
      // Avoid duplicates if fetchRange is called multiple times
      if (!_cache[entry.entry_date].find(e => e.id === entry.id)) {
        _cache[entry.entry_date].push(_normalise(entry));
      }
    });
  }

  /**
   * Fetch entries for a single date (used when selecting a day).
   * @param {string} isoKey  YYYY-MM-DD
   */
  async function fetchDate(isoKey) {
    const res  = await Auth.apiFetch(`/api/calendar/date/${isoKey}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch entries');
    _storeEntries(isoKey, json.data.map(_normalise));
  }

  /**
   * Save a new entry to the API and update the cache.
   * @param {string} isoKey   YYYY-MM-DD
   * @param {Object} entryObj { type, title, time?, color?, ... }
   * @returns {Promise<Object>}  the created entry (with id)
   */
  async function addEntry(isoKey, entryObj) {
    const res  = await Auth.apiFetch('/api/calendar', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...entryObj, entry_date: isoKey }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error((json.errors || [json.error]).join(', '));

    const entry = _normalise(json.data);
    if (!_cache[isoKey]) _cache[isoKey] = [];
    _cache[isoKey].push(entry);
    return entry;
  }

  /**
   * Delete an entry by id and remove from cache.
   * @param {number} id
   * @param {string} isoKey  YYYY-MM-DD (to locate in cache)
   */
  async function deleteEntry(id, isoKey) {
    const res  = await Auth.apiFetch(`/api/calendar/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Delete failed');

    if (_cache[isoKey]) {
      _cache[isoKey] = _cache[isoKey].filter(e => e.id !== id);
    }
    return json.message;
  }

  /** Invalidate the cache for a date (force re-fetch next time) */
  function invalidate(isoKey) {
    delete _cache[isoKey];
  }

  // ── Normalise API response → view-friendly shape ───────────────────────────
  function _normalise(entry) {
    return {
      id:    entry.id,
      type:  entry.type,
      title: entry.title,
      time:  entry.time  || null,
      color: entry.color || null,
    };
  }

  return { toKey, getEntries, fetchRange, fetchDate, addEntry, deleteEntry, invalidate };

})();