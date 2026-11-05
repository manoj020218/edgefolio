'use strict';
/**
 * /api/v1/sync/* — the EDGE desktop's link to the cloud (CLOUD_ATTENDANCE_PLAN.md §6).
 * EDGE only ever calls OUT, so offices need no fixed IP.
 *
 *   POST /connect          link this PC (licence key + machine id) → { orgCode, syncKey }
 *   PUT  /employees        full employee snapshot from EDGE (EDGE owns the employee master)
 *   PUT  /reference        company name, weekly offs, holidays, offices (geofences), shifts
 *   GET  /punches?after=N  punches with seq > N, in order → EDGE stages them into attendance
 *   POST /ack              EDGE confirms the last seq it committed
 *   GET  /status           link status for EDGE's settings screen
 *
 * Everything except /connect authenticates with header `X-Sync-Key` (stored hashed).
 * Licence verification against the billing platform is Phase 4; until then the licence key and
 * machine id are recorded and a licence can only be linked from one PC at a time.
 */
const crypto = require('crypto');
const express = require('express');
const { Organisation } = require('../models');
const { forOrg } = require('../tenancy');
const { createOrgRecord } = require('../orgAdmin');
const { loadShifts } = require('../lib/shifts');
const { sendOk, httpError, codedError } = require('../lib/http');

const ROLE_MAP = { owner: 'owner', 'hr-admin': 'hr-admin', admin: 'hr-admin' };   // anything else → employee
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const newSyncKey = () => `efs_${crypto.randomBytes(32).toString('base64url')}`;
const str = (v, max = 200) => (v == null || v === '' ? null : String(v).trim().slice(0, max));
const hhmm = (v) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(v || '')); return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? `${m[1].padStart(2, '0')}:${m[2]}` : null; };
const minutesOr = (v, dflt) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.min(Math.max(Math.round(Number(v)), 0), 600) : dflt);

// Point each PC employee's shiftId at the cloud shift synced from their EDGE shift; anyone whose
// EDGE shift is unknown (or none) falls back to the default shift (shiftId null).
async function remapEdgeShifts(db) {
  const synced = await db.Shift.find({ edgeShiftId: { $ne: null } }, { edgeShiftId: 1 }).lean();
  for (const s of synced) {
    await db.Employee.updateMany({ source: 'edge', edgeShiftId: s.edgeShiftId, shiftId: { $ne: String(s._id) } }, { $set: { shiftId: String(s._id) } });
  }
  await db.Employee.updateMany({ source: 'edge', edgeShiftId: { $nin: synced.map((s) => s.edgeShiftId) }, shiftId: { $ne: null } }, { $set: { shiftId: null } });
}

// EDGE is the master for shifts of a PC-linked company (plan step 7). The default shift takes
// EDGE's office working hours; every EDGE shift becomes a cloud shift keyed by its shift_id.
// EDGE has one weekly-off setting for the whole company, so every shift gets it.
async function syncShifts(db, org, b, weeklyOff) {
  await loadShifts(db, org);   // make sure the default exists
  const wh = b.workingHours || {};
  const defStart = hhmm(wh.start), defEnd = hhmm(wh.end);
  if (defStart && defEnd && defStart !== defEnd) {
    await db.Shift.updateOne({ isDefault: true }, { $set: {
      start: defStart, end: defEnd, breakStart: null, breakEnd: null, breakPaid: false,
      breakMinutes: minutesOr(wh.breakMinutes, 60), weeklyOff, graceMinutes: minutesOr(wh.graceMinutes, 10),
    } });
  }
  const keep = [];
  for (const s of b.shifts.slice(0, 100)) {
    const edgeShiftId = str(s?.id, 100), start = hhmm(s?.start), end = hhmm(s?.end);
    if (!edgeShiftId || !start || !end || start === end || keep.includes(edgeShiftId)) continue;
    keep.push(edgeShiftId);
    await db.Shift.updateOne({ edgeShiftId }, { $set: {
      name: str(s.name, 60) || edgeShiftId, start, end, breakStart: null, breakEnd: null, breakPaid: false,
      breakMinutes: minutesOr(s.breakMinutes, 0), weeklyOff, graceMinutes: minutesOr(s.graceMinutes, 10), isDefault: false,
    } }, { upsert: true });
  }
  await db.Shift.deleteMany({ edgeShiftId: { $ne: null, $nin: keep }, isDefault: false });
  await remapEdgeShifts(db);
  return keep.length;
}

function requireSync() {
  return ah(async (req, res, next) => {
    const key = String(req.get('x-sync-key') || '').trim();
    if (!key) throw httpError(401, 'Sync key required');
    const org = await Organisation.findOne({ syncKeyHash: sha256(key) }).lean();
    if (!org) throw httpError(401, 'Sync key not recognised — reconnect EDGE to the cloud');
    if (org.status !== 'active') throw httpError(403, 'This company account is suspended');
    req.org = org;
    await Organisation.updateOne({ _id: org._id }, { $set: { lastSyncAt: new Date() } });
    next();
  });
}

function syncRouter({ billing } = {}) {
  const r = express.Router();

  r.post('/connect', ah(async (req, res) => {
    const licenseKey = str(req.body?.licenseKey, 100);
    const machineId = str(req.body?.machineId, 200);
    const companyName = str(req.body?.companyName, 120) || 'My Company';
    if (!licenseKey || licenseKey.length < 8) throw httpError(400, 'licenseKey is required');
    if (!machineId) throw httpError(400, 'machineId is required');
    // Phase 4: the licence must exist on the billing platform. If billing can't be reached we let
    // the PC connect anyway (never block attendance on our own outage) and log it.
    if (billing?.configured) {
      try {
        const lic = await billing.verifyLicense(licenseKey);
        if (!lic.valid) throw codedError(403, 'LICENCE_INVALID', 'This EdgeFolio licence is not active. Check Settings → License.');
      } catch (e) {
        if (e.errorCode) throw e;
        if (e.status === 404) throw codedError(403, 'LICENCE_INVALID', 'This EdgeFolio licence was not found. Check Settings → License.');
        console.warn('[sync/connect] licence check skipped:', e.message);
      }
    }
    const tz = Number.isFinite(Number(req.body?.tzOffsetMin)) ? Number(req.body.tzOffsetMin) : 330;
    const syncKey = newSyncKey();
    const linkFields = { syncKeyHash: sha256(syncKey), edgeMachineId: machineId, edgeLinkedAt: new Date(), edgeVersion: str(req.body?.edgeVersion, 40) };

    let org = await Organisation.findOne({ licenseKey });
    let created = false;
    if (!org) {
      org = await createOrgRecord({ name: companyName, licenseKey, tzOffsetMin: tz, ...linkFields });
      created = true;
    } else if (org.edgeMachineId && org.edgeMachineId !== machineId) {
      throw codedError(409, 'ALREADY_LINKED', 'This EdgeFolio licence is already connected to the cloud from another PC. Disconnect it there first, or contact support.');
    } else {
      await Organisation.updateOne({ _id: org._id }, { $set: linkFields });   // same PC reconnecting: new key
    }
    await forOrg(org._id).AuditLog.create({ actor: 'edge-sync', action: created ? 'edge-connected-new-org' : 'edge-reconnected', detail: { machineId } });
    if (billing?.configured) billing.link({ licenseKey, orgCode: org.orgCode, maxActiveEmployees: org.maxActiveEmployees }).catch(() => {});
    sendOk(res, { orgCode: org.orgCode, syncKey, created, companyName: org.name });
  }));

  r.use(requireSync());

  r.get('/status', ah(async (req, res) => {
    const db = forOrg(req.org._id);
    const [activeEmployees, last] = await Promise.all([
      db.Employee.countDocuments({ status: 'active' }),
      db.Punch.findOne({}).sort({ seq: -1 }).lean(),
    ]);
    sendOk(res, {
      orgCode: req.org.orgCode, companyName: req.org.name, activeEmployees,
      latestSeq: last ? last.seq : 0, ackedSeq: req.org.syncAckSeq || 0,
      maxActiveEmployees: req.org.maxActiveEmployees,
    });
  }));

  r.put('/employees', ah(async (req, res) => {
    const list = req.body?.employees;
    if (!Array.isArray(list)) throw httpError(400, 'employees array is required');
    if (list.length > 5000) throw httpError(400, 'Too many employees in one snapshot');
    const db = forOrg(req.org._id);
    const existing = new Map((await db.Employee.find({}, { empId: 1, edgePasswordHash: 1, passwordHash: 1 }).lean()).map((e) => [e.empId, e]));
    const seen = new Set();
    let upserted = 0, skipped = 0;
    for (const e of list) {
      const empId = str(e.empId, 100), empCode = str(e.empCode, 50), name = str(e.name, 120);
      if (!empId || !empCode || !name || seen.has(empId)) { skipped++; continue; }
      seen.add(empId);
      const $set = {
        empCode, name, email: str(e.email, 200)?.toLowerCase() || null,
        department: str(e.department, 100), designation: str(e.designation, 100),
        appRole: ROLE_MAP[e.appRole] || 'employee',
        mobileLoginEnabled: e.mobileLoginEnabled !== false && e.mobileLoginEnabled !== 0,
        isFieldEmployee: Boolean(e.isFieldEmployee),
        status: e.status === 'inactive' ? 'inactive' : 'active',
        source: 'edge',
      };
      if ('shiftId' in e) $set.edgeShiftId = str(e.shiftId, 100);   // older EDGE versions don't send it
      // Password: apply EDGE's hash on first sync, or when it changed in EDGE since the last push.
      const incoming = str(e.passwordHash, 300);
      const prev = existing.get(empId);
      if (incoming && (!prev || prev.edgePasswordHash !== incoming || !prev.passwordHash)) {
        Object.assign($set, { passwordHash: incoming, edgePasswordHash: incoming, tempPasswordHash: str(e.tempPasswordHash, 300), passwordMustChange: Boolean(e.passwordMustChange) });
      }
      try {
        await db.Employee.updateOne({ empId }, { $set }, { upsert: true });
        upserted++;
      } catch (err) {
        if (err.code === 11000) skipped++; else throw err;   // e.g. duplicate empCode in EDGE data
      }
    }
    // Anyone EDGE no longer lists is deactivated (not deleted: punches keep their history).
    const gone = await db.Employee.updateMany({ source: 'edge', empId: { $nin: [...seen] }, status: 'active' }, { $set: { status: 'inactive' } });
    if (list.some((e) => e && 'shiftId' in e)) await remapEdgeShifts(db);
    const activeCount = await db.Employee.countDocuments({ status: 'active' });
    // Never block: over the cap we keep working and record it for our team (plan §8).
    if (activeCount > (req.org.maxActiveEmployees || 50)) {
      await db.AuditLog.create({ actor: 'edge-sync', action: 'over-employee-cap', detail: { activeCount } });
    }
    sendOk(res, { upserted, skipped, deactivated: gone.modifiedCount || 0, activeCount });
  }));

  r.put('/reference', ah(async (req, res) => {
    const b = req.body || {};
    const db = forOrg(req.org._id);
    const $set = {};
    if (str(b.companyName, 120)) $set.name = str(b.companyName, 120);
    if (Array.isArray(b.weeklyOffDays)) $set['settings.weeklyOffDays'] = b.weeklyOffDays.map(Number).filter((d) => d >= 0 && d <= 6);
    if (Number.isFinite(Number(b.tzOffsetMin)) && b.tzOffsetMin !== null && b.tzOffsetMin !== '') $set.tzOffsetMin = Number(b.tzOffsetMin);
    if (typeof b.enforceGeofence === 'boolean') $set['settings.enforceGeofence'] = b.enforceGeofence;
    if (Object.keys($set).length) await Organisation.updateOne({ _id: req.org._id }, { $set });

    let holidays = 0, offices = 0, shifts = null;
    if (Array.isArray(b.holidays)) {
      const rows = b.holidays.filter((h) => /^\d{4}-\d{2}-\d{2}$/.test(h?.date)).slice(0, 1000).map((h) => ({ date: h.date, name: str(h.name, 120) }));
      await db.Holiday.deleteMany({});
      if (rows.length) await db.Holiday.create(rows);
      holidays = rows.length;
    }
    if (Array.isArray(b.offices)) {
      const rows = b.offices.filter((o) => str(o?.id) && str(o?.label)).slice(0, 200).map((o) => ({
        officeId: str(o.id, 100), label: str(o.label, 120),
        lat: Number.isFinite(Number(o.lat)) && o.lat !== null ? Number(o.lat) : null,
        lng: Number.isFinite(Number(o.lng)) && o.lng !== null ? Number(o.lng) : null,
        radiusM: Number.isFinite(Number(o.radiusM)) && o.radiusM !== null ? Number(o.radiusM) : null,
      }));
      await db.Office.deleteMany({});
      if (rows.length) await db.Office.create(rows);
      offices = rows.length;
    }
    if (Array.isArray(b.shifts)) {
      const org = await Organisation.findById(req.org._id).lean();
      const weeklyOff = Array.isArray(org.settings?.weeklyOffDays) ? org.settings.weeklyOffDays : [0];
      shifts = await syncShifts(db, org, b, [...new Set(weeklyOff)].sort((x, y) => x - y));
    }
    sendOk(res, { updated: Object.keys($set), holidays, offices, shifts });
  }));

  r.get('/punches', ah(async (req, res) => {
    const after = Math.max(0, parseInt(req.query.after, 10) || 0);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 500, 1), 1000);
    const rows = await forOrg(req.org._id).Punch.find({ seq: { $gt: after } }).sort({ seq: 1 }).limit(limit + 1).lean();
    const page = rows.slice(0, limit);
    sendOk(res, {
      punches: page.map((p) => ({
        seq: p.seq, empId: p.empId, eventType: p.eventType, at: p.at, date: p.date, time: p.time, workDate: p.workDate || p.date,
        workType: p.workType, source: p.source, faceMatch: p.faceMatch, geofenceOk: p.geofenceOk,
        location: p.location && p.location.lat != null ? { lat: p.location.lat, lon: p.location.lon, accuracy: p.location.accuracy } : null,
      })),
      nextCursor: page.length ? page[page.length - 1].seq : after,
      hasMore: rows.length > limit,
    });
  }));

  r.post('/ack', ah(async (req, res) => {
    const cursor = parseInt(req.body?.cursor, 10);
    if (!Number.isFinite(cursor) || cursor < 0) throw httpError(400, 'cursor is required');
    await Organisation.updateOne({ _id: req.org._id, syncAckSeq: { $lt: cursor } }, { $set: { syncAckSeq: cursor } });
    sendOk(res, { ackedSeq: Math.max(cursor, req.org.syncAckSeq || 0) });
  }));

  return r;
}

module.exports = { syncRouter, sha256 };
