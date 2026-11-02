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

module.exports = { toLocalParts, todayLocal, minutesOf, hoursBetween };
