'use strict';
// Local wall-clock date/time for an organisation. The phone sends UTC instants
// (Date#toISOString); attendance is recorded in the org's local time, exactly like EDGE's
// toIstParts (EDGE/backend/utils/dateUtils.js): date "YYYY-MM-DD", time "HH:MM:SS".
// Offset is per organisation (default 330 = IST), so non-IST customers work too.

function toLocalParts(input, offsetMin = 330) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  const shifted = new Date(d.getTime() + offsetMin * 60000);
  const iso = shifted.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 19) };
}

function todayLocal(offsetMin = 330) {
  return toLocalParts(new Date(), offsetMin).date;
}

function minutesOf(hhmmss) {
  const [h, m] = String(hhmmss || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Hours between first-in and last-out, 2 decimals (EDGE mobileCheckoutHandler convention).
function hoursBetween(checkIn, checkOut) {
  return Number(Math.max(0, (minutesOf(checkOut) - minutesOf(checkIn)) / 60).toFixed(2));
}

// "+05:30" for an offset in minutes.
function offsetLabel(offsetMin = 330) {
  const sign = offsetMin < 0 ? '-' : '+';
  const a = Math.abs(offsetMin);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

// ISO 8601 local time with offset, e.g. "2026-11-03T20:02:11+05:30" (null-safe).
function isoLocal(input, offsetMin = 330) {
  const p = input ? toLocalParts(input, offsetMin) : null;
  return p ? `${p.date}T${p.time}${offsetLabel(offsetMin)}` : '';
}

// UTC instant for an org-local date + "HH:MM:SS" (for rows stored before instants were kept).
function instantOf(date, time, offsetMin = 330) {
  if (!date || !time) return null;
  const t = Date.parse(`${date}T${time.length === 5 ? `${time}:00` : time}Z`);
  return Number.isNaN(t) ? null : new Date(t - offsetMin * 60000);
}

// Worked time between two instants: whole minutes (rounded) and hours = minutes / 60 rounded
// half-up to 2 decimals. Works across midnight (night shifts).
function workedBetween(inAt, outAt) {
  if (!inAt || !outAt) return { minutes: 0, hours: 0 };
  const minutes = Math.max(0, Math.round((new Date(outAt) - new Date(inAt)) / 60000));
  return { minutes, hours: Math.round((minutes / 60) * 100) / 100 };
}

module.exports = { toLocalParts, todayLocal, minutesOf, hoursBetween, offsetLabel, isoLocal, instantOf, workedBetween };
