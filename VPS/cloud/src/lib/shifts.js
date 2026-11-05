'use strict';
// Shift storage helpers: lazy default shift, serialisation and input validation (plan section 6).
const { httpError } = require('./http');
const { isOvernight } = require('./dayStatus');

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DEFAULT_SHIFT = { name: 'General', start: '08:00', end: '18:00', breakStart: '13:00', breakEnd: '13:30', breakPaid: false, weeklyOff: [0], graceMinutes: 10, isDefault: true };

function serialize(s, employees = 0) {
  return {
    id: String(s._id || s.id), name: s.name, start: s.start, end: s.end,
    breakStart: s.breakStart || null, breakEnd: s.breakEnd || null, breakPaid: Boolean(s.breakPaid),
    breakMinutes: s.breakStart && s.breakEnd ? null : (s.breakMinutes > 0 ? s.breakMinutes : null),
    fromPc: Boolean(s.edgeShiftId),
    weeklyOff: [...(s.weeklyOff || [])], graceMinutes: s.graceMinutes ?? 10, isDefault: Boolean(s.isDefault),
    overnight: isOvernight(s), employees,
  };
}

// All shifts of an org (plain objects with `id`), creating the default "General" shift on first use.
// A PC-linked org uses the weekly-off days its PC synced for the default shift.
async function loadShifts(db, org) {
  let rows = await db.Shift.find({}).sort({ _id: 1 }).lean();
  if (!rows.length) {
    try { await db.Shift.create(DEFAULT_SHIFT); }
    catch (e) { if (e.code !== 11000) throw e; }          // a concurrent request created it first
    rows = await db.Shift.find({}).sort({ _id: 1 }).lean();
  }
  const synced = org && org.edgeMachineId && Array.isArray(org.settings?.weeklyOffDays) ? org.settings.weeklyOffDays : null;
  return rows.map((s) => {
    const o = { ...s, id: String(s._id) };
    if (synced && s.isDefault) o.weeklyOff = synced;
    return o;
  });
}

function validTime(v, label) {
  if (typeof v !== 'string' || !HHMM.test(v)) throw httpError(400, `${label} must be HH:MM`);
  return v;
}

// Validates a (partial when `partial`) shift body into a plain $set object.
function parseShiftBody(b, { partial }) {
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  if (has('name') || !partial) {
    const name = String(b.name ?? '').trim().slice(0, 60);
    if (!name) throw httpError(400, 'Shift name is required');
    out.name = name;
  }
  if (has('start') || !partial) out.start = validTime(b.start, 'start');
  if (has('end') || !partial) out.end = validTime(b.end, 'end');
  if (out.start && out.end && out.start === out.end) throw httpError(400, 'start and end cannot be the same');
  if (has('breakStart') || has('breakEnd')) {
    const bs = b.breakStart ?? null; const be = b.breakEnd ?? null;
    if ((bs === null) !== (be === null)) throw httpError(400, 'breakStart and breakEnd go together');
    out.breakStart = bs === null ? null : validTime(bs, 'breakStart');
    out.breakEnd = be === null ? null : validTime(be, 'breakEnd');
    if (bs !== null && bs === be) throw httpError(400, 'break start and end cannot be the same');
  } else if (!partial) { out.breakStart = null; out.breakEnd = null; }
  if (has('breakPaid') || !partial) {
    if (has('breakPaid') && typeof b.breakPaid !== 'boolean') throw httpError(400, 'breakPaid must be true or false');
    out.breakPaid = has('breakPaid') ? b.breakPaid : false;
  }
  if (has('weeklyOff') || !partial) {
    const w = has('weeklyOff') ? b.weeklyOff : [0];
    if (!Array.isArray(w) || !w.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) throw httpError(400, 'weeklyOff must be weekday numbers 0 (Sun) to 6 (Sat)');
    out.weeklyOff = [...new Set(w)].sort((a, c) => a - c);
  }
  if (has('graceMinutes') || !partial) {
    const g = has('graceMinutes') ? b.graceMinutes : 10;
    if (!Number.isInteger(g) || g < 0 || g > 240) throw httpError(400, 'graceMinutes must be a whole number from 0 to 240');
    out.graceMinutes = g;
  }
  if (has('isDefault')) {
    if (typeof b.isDefault !== 'boolean') throw httpError(400, 'isDefault must be true or false');
    out.isDefault = b.isDefault;
  }
  return out;
}

module.exports = { loadShifts, serialize, parseShiftBody, DEFAULT_SHIFT };
