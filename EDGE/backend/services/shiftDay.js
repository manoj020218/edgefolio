'use strict';
/**
 * Night-shift aware attendance dates. Mirrors VPS/cloud/src/routes/apk.js (openShift / workDate).
 *
 * A punch belongs to a "work date" (the date the shift STARTED), so a 20:00 -> 04:00 shift is
 * one attendance_records row on the evening's date, with check_out on the next calendar day.
 *
 * Employee -> shift link: employees.shift_id -> shifts.shift_id.
 */

function toMins(t) {
  if (!t) return null;
  const [h, m] = String(t).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function stampMs(date, time) {
  const mins = toMins(time) ?? 0;
  const secs = Number(String(time || '').split(':')[2] || 0) || 0;
  return Date.parse(`${date}T00:00:00Z`) + mins * 60000 + secs * 1000;
}

/** The employee's assigned shift row (or null). */
function getEmployeeShift(db, empId) {
  try {
    return db.prepare(
      `SELECT s.* FROM employees e JOIN shifts s ON s.shift_id = e.shift_id WHERE e.id = ?`,
    ).get(empId) || null;
  } catch { return null; }
}

function isOvernightShift(shift) {
  if (!shift) return false;
  if (Number(shift.is_overnight) === 1) return true;
  const s = toMins(shift.start_time), e = toMins(shift.end_time);
  return s != null && e != null && e < s;
}

const defaultLookup = (db) => (empId, date) =>
  db.prepare('SELECT date, check_in, check_out FROM attendance_records WHERE member_id = ? AND date = ?').get(empId, date) || null;

/**
 * @param lookup optional (empId, date) => { check_in, check_out } | null, so callers that hold
 *               uncommitted punches (machine import) can expose them to the fallback rule.
 */
function workDateFor(db, empId, localDate, localTime, lookup) {
  const shift = getEmployeeShift(db, empId);
  const t = toMins(localTime);
  if (t == null) return localDate;

  if (isOvernightShift(shift)) {
    const end = toMins(shift.end_time);
    return t <= end + 240 ? addDays(localDate, -1) : localDate;
  }

  // No overnight shift configured: infer a night worker from an open evening check-in.
  if (t < 10 * 60) {
    const prevDate = addDays(localDate, -1);
    const prev = (lookup || defaultLookup(db))(empId, prevDate);
    if (prev && prev.check_in && !prev.check_out) {
      const inMins = toMins(prev.check_in);
      if (inMins >= 16 * 60 && stampMs(localDate, localTime) - stampMs(prevDate, prev.check_in) <= 20 * 3600000) {
        return prevDate;
      }
    }
  }
  return localDate;
}

/** Hours between "HH:MM[:SS]" strings; a checkOut earlier than checkIn means next day. */
function workedHours(checkIn, checkOut) {
  const a = toMins(checkIn), b = toMins(checkOut);
  if (a == null || b == null) return 0;
  const secA = Number(String(checkIn).split(':')[2] || 0) || 0;
  const secB = Number(String(checkOut).split(':')[2] || 0) || 0;
  let diff = (b * 60 + secB) - (a * 60 + secA);
  if (diff < 0) diff += 24 * 3600;
  return Math.max(0, Math.round((diff / 3600 + Number.EPSILON) * 100 + 1e-9) / 100);
}

module.exports = { workDateFor, workedHours, getEmployeeShift, isOvernightShift, addDays, stampMs, toMins };
