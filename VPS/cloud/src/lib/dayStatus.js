'use strict';
/**
 * Day status + hours rules (ATTENDANCE_RULES_PLAN.md sections 2 and 3). Pure functions, shared by
 * the monthly calendar, the summary and the CSV export.
 */
const { instantOf, workedBetween } = require('./time');

const DAY_MS = 86400000;
const toMin = (hhmm) => { const [h, m] = String(hhmm || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };

// Built-in rules used only if an organisation somehow has no shift row at all.
const FALLBACK_SHIFT = Object.freeze({
  id: null, name: 'General', start: '08:00', end: '18:00', breakStart: '13:00', breakEnd: '13:30',
  breakPaid: false, weeklyOff: [0], graceMinutes: 10, isDefault: true,
});

// The employee's shift: their shiftId if it still exists, else the default shift.
function resolveShift(shifts, emp) {
  const list = shifts || [];
  const own = emp && emp.shiftId ? list.find((s) => String(s.id) === String(emp.shiftId)) : null;
  return own || list.find((s) => s.isDefault) || list[0] || FALLBACK_SHIFT;
}

const isOvernight = (shift) => toMin(shift.end) < toMin(shift.start);

// Net hours: minutes / 60 rounded half-up to 2 decimals (integer arithmetic, no float ties).
const hours2dp = (minutes) => Math.floor((200 * minutes + 60) / 120) / 100;

// Real instants of the break window for a work date. A break that starts earlier on the clock than
// an overnight shift does belongs to the next calendar day; a break running past midnight ends then.
function breakWindow(date, shift, tz) {
  if (!shift.breakStart || !shift.breakEnd) return null;
  let bs = instantOf(date, `${shift.breakStart}:00`, tz);
  if (!bs) return null;
  if (isOvernight(shift) && toMin(shift.breakStart) < toMin(shift.start)) bs = new Date(bs.getTime() + DAY_MS);
  const len = (toMin(shift.breakEnd) - toMin(shift.breakStart) + 1440) % 1440;
  if (len === 0) return null;
  return { start: bs, end: new Date(bs.getTime() + len * 60000) };
}

// First-in / last-out instants of an attendance row (old rows only have the HH:MM:SS strings).
function punchInstants(rec, date, tz) {
  const inAt = rec.checkInAt || instantOf(date, rec.checkIn, tz);
  let outAt = rec.checkOutAt || instantOf(date, rec.checkOut, tz);
  if (outAt && inAt && outAt < inAt) outAt = new Date(outAt.getTime() + DAY_MS);   // old overnight rows
  return { inAt, outAt };
}

function hoursFor(date, inAt, outAt, shift, tz) {
  const gross = workedBetween(inAt, outAt).minutes;
  let brk = 0;
  const w = shift.breakPaid ? null : breakWindow(date, shift, tz);
  if (w) {
    const ms = Math.min(new Date(outAt).getTime(), w.end.getTime()) - Math.max(new Date(inAt).getTime(), w.start.getTime());
    brk = Math.min(gross, Math.max(0, Math.round(ms / 60000)));
  }
  const net = Math.max(0, gross - brk);
  return { grossMinutes: gross, breakMinutes: brk, netMinutes: net, netHours: hours2dp(net) };
}

/**
 * One employee-day. `rec` = AttendanceDay row or null. Returns null for dates after `today`
 * (pass today = null to skip that check).
 */
function computeDay({ date, rec, shift, holidayName = null, tz = 330, today = null }) {
  if (today && date > today) return null;
  const hasIn = Boolean(rec && (rec.checkIn || rec.checkInAt));
  const hasOut = Boolean(rec && (rec.checkOut || rec.checkOutAt));
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  const weeklyOff = (shift.weeklyOff || []).includes(dow);
  const offDay = Boolean(holidayName) || weeklyOff;
  const day = {
    date, status: 'absent', checkIn: rec ? rec.checkIn || null : null, checkOut: rec ? rec.checkOut || null : null,
    overnight: false, grossMinutes: 0, breakMinutes: 0, netMinutes: 0, netHours: 0,
    worked_on_off_day: false, holidayName: holidayName || null, leaveType: rec ? rec.leaveType || null : null,
  };
  if (hasIn && hasOut) {
    const { inAt, outAt } = punchInstants(rec, date, tz);
    Object.assign(day, { status: 'present', worked_on_off_day: offDay }, hoursFor(date, inAt, outAt, shift, tz));
    day.overnight = Boolean(rec.overnight) || new Date(outAt.getTime() + tz * 60000).toISOString().slice(0, 10) !== date;
  } else if (hasIn || hasOut) {
    day.status = 'incomplete';
  } else if (day.leaveType || (rec && /^(leave|on_leave)$/.test(rec.status || ''))) {
    day.status = 'leave';
  } else if (holidayName) {
    day.status = 'holiday';
  } else if (weeklyOff) {
    day.status = 'weekly_off';
  }
  return day;
}

function summarize(days) {
  const s = { present: 0, incomplete: 0, absent: 0, leave: 0, holidays: 0, weeklyOffs: 0, netMinutes: 0, netHours: 0 };
  for (const d of days) {
    if (d.status === 'present') s.present++;
    else if (d.status === 'incomplete') s.incomplete++;
    else if (d.status === 'absent') s.absent++;
    else if (d.status === 'leave') s.leave++;
    else if (d.status === 'holiday') s.holidays++;
    else if (d.status === 'weekly_off') s.weeklyOffs++;
    s.netMinutes += d.netMinutes || 0;
  }
  s.netHours = hours2dp(s.netMinutes);
  return s;
}

// Every day of `month` (YYYY-MM) up to `today`, for one employee.
function monthDays({ month, recs, shift, holidays, tz, today }) {
  const byDate = new Map(recs.map((r) => [r.date, r]));
  const hol = new Map(holidays.map((h) => [h.date, h.name || '']));
  const [y, m] = month.split('-').map(Number);
  const out = [];
  for (let d = 1; d <= new Date(Date.UTC(y, m, 0)).getUTCDate(); d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    const day = computeDay({ date, rec: byDate.get(date) || null, shift, holidayName: hol.has(date) ? hol.get(date) : null, tz, today });
    if (day) out.push(day);
  }
  return out;
}

module.exports = { resolveShift, computeDay, summarize, monthDays, breakWindow, hours2dp, isOvernight, FALLBACK_SHIFT, toMin };
