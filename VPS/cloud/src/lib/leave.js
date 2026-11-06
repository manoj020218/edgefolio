'use strict';
/**
 * Leave rules (LEAVE_AND_LATE_PLAN.md sections 2 and 3): company leave types with a yearly quota,
 * working-day counting against the employee's shift, balances, and the date -> leave type map the
 * calendar / CSV feed into dayStatus.
 */
const DAY_MS = 86400000;
const FIXED_KEYS = ['casual', 'sick', 'annual', 'unpaid'];
const DEFAULT_LEAVE_TYPES = Object.freeze([
  { key: 'casual', name: 'Casual', perYear: 12 },
  { key: 'sick', name: 'Sick', perYear: 6 },
  { key: 'annual', name: 'Earned', perYear: 15 },
  { key: 'unpaid', name: 'Unpaid', perYear: null },
]);

// The company's leave types (defaults when the owner never changed them), always the four fixed keys.
function leaveTypesOf(org) {
  const saved = (org && org.settings && org.settings.leaveTypes) || [];
  return DEFAULT_LEAVE_TYPES.map((d) => {
    const s = saved.find((x) => x.key === d.key);
    if (!s) return { ...d };
    return { key: d.key, name: s.name || d.name, perYear: d.key === 'unpaid' ? null : (s.perYear === undefined ? d.perYear : s.perYear) };
  });
}

const DATE_OK = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const dayIndex = (date) => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
const dateOfIndex = (i) => new Date(i * DAY_MS).toISOString().slice(0, 10);
const spanDays = (from, to) => dayIndex(to) - dayIndex(from) + 1;

function eachDate(from, to) {
  const out = [];
  for (let i = dayIndex(from); i <= dayIndex(to); i++) out.push(dateOfIndex(i));
  return out;
}

/** Working days of `shift` in the range (holidays / weekly offs skipped), split by calendar year. */
function countLeaveDays({ from, to, shift, holidayDates, halfDay = false }) {
  const hol = holidayDates instanceof Set ? holidayDates : new Set(holidayDates || []);
  const off = new Set(shift.weeklyOff || []);
  const yearDays = {};
  let days = 0;
  for (const d of eachDate(from, to)) {
    if (hol.has(d) || off.has(new Date(`${d}T00:00:00Z`).getUTCDay())) continue;
    const add = halfDay ? 0.5 : 1;
    yearDays[d.slice(0, 4)] = (yearDays[d.slice(0, 4)] || 0) + add;
    days += add;
  }
  return { days, yearDays };
}

/** Used / pending days per leave type for an employee in a calendar year. */
async function usageFor(db, empId, year) {
  const rows = await db.EmployeeRequest.find({
    empId, type: 'leave', status: { $in: ['approved', 'pending'] },
    fromDate: { $lte: `${year}-12-31` }, toDate: { $gte: `${year}-01-01` },
  }, { leaveType: 1, status: 1, yearDays: 1 }).lean();
  const out = {};
  for (const r of rows) {
    const n = Number((r.yearDays || {})[String(year)] || 0);
    if (!n) continue;
    const u = out[r.leaveType] || (out[r.leaveType] = { used: 0, pending: 0 });
    if (r.status === 'approved') u.used += n; else u.pending += n;
  }
  return out;
}

function balanceRows(types, usage) {
  return types.map((t) => {
    const u = usage[t.key] || { used: 0, pending: 0 };
    return { key: t.key, name: t.name, perYear: t.perYear, used: u.used, pending: u.pending, remaining: t.perYear == null ? null : Math.max(0, t.perYear - u.used) };
  });
}

/** date -> leaveType for the employee's approved leave overlapping [from, to] (inclusive dates). */
async function leaveDatesFor(db, empId, from, to) {
  const rows = await db.EmployeeRequest.find({ empId, type: 'leave', status: 'approved', fromDate: { $lte: to }, toDate: { $gte: from } },
    { leaveType: 1, fromDate: 1, toDate: 1 }).lean();
  const map = new Map();
  for (const r of rows) for (const d of eachDate(r.fromDate, r.toDate)) if (d >= from && d <= to) map.set(d, r.leaveType);
  return map;
}

module.exports = { FIXED_KEYS, DEFAULT_LEAVE_TYPES, leaveTypesOf, DATE_OK, spanDays, eachDate, countLeaveDays, usageFor, balanceRows, leaveDatesFor };
