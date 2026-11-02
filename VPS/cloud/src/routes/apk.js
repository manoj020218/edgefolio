'use strict';
/**
 * /api/v1/apk/* — the same contract the Android app already uses with EDGE
 * (EDGE/backend/routes/apk.js + controllers/apkController.js). Request and response shapes are
 * copied from EDGE handler by handler; differences are deliberate and marked "CLOUD:".
 *
 * Phase 2 covers the core attendance flow. Later phases add work assignments admin, alert
 * subscriptions, broadcast, analytics, payroll views, payslips, leave, requests/visits/docs.
 */
const express = require('express');
const { forOrg } = require('../tenancy');
const { PROFILE_FIELDS } = require('../models');
const { resolveOrg, signToken, requireAuth, requireRole } = require('../auth');
const { sendOk, sendCode, httpError, codedError } = require('../lib/http');
const { verifySecret } = require('../lib/password');
const { toLocalParts, todayLocal, minutesOf, hoursBetween } = require('../lib/time');

const WORK_TYPES = ['office', 'tour', 'wfh'];
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);   // async handler

// Distance in metres between two lat/lon points (haversine).
function metresBetween(a, b) {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// CLOUD: geofence result is recorded on every punch (geofenceOk); enforced only when the org
// turns on settings.enforceGeofence (office punches outside every office radius are refused).
async function geofenceOk(db, org, location) {
  const offices = await db.Office.find({ lat: { $ne: null }, lng: { $ne: null } }).lean();
  if (!offices.length) return null;
  return offices.some((o) => metresBetween({ lat: o.lat, lon: o.lng }, location) <= (o.radiusM || org.settings.geofenceRadiusM));
}

async function activeAssignment(db, empId, date) {
  return db.WorkAssignment.findOne({ empId, fromDate: { $lte: date }, toDate: { $gte: date } })
    .sort({ createdAt: -1 }).lean();
}

function serializeDay(d) {
  return d ? { checkIn: d.checkIn, checkOut: d.checkOut, hoursWorked: d.hoursWorked, status: d.status } : null;
}

/**
 * Records one check-in for an employee (shared by POST /attendance and batch-sync).
 * Returns { alreadyMarked, checkedInAt?, eventId? }. Same punch-clock rules as EDGE: any number of
 * in/out cycles a day; the day row keeps the FIRST check-in and the LAST check-out.
 */
async function recordCheckIn(db, org, emp, { workType, timestamp, similarity, liveness, location, deviceId, source, clientRef }) {
  const parts = toLocalParts(timestamp, org.tzOffsetMin);
  if (!parts) throw httpError(400, 'timestamp is not a valid date');
  const { date, time } = parts;

  const last = await db.Punch.findOne({ empId: emp.empId, date }).sort({ at: -1, _id: -1 }).lean();
  if (last?.eventType === 'in') return { alreadyMarked: true, checkedInAt: last.time };

  const geo = location ? await geofenceOk(db, org, location) : null;
  // Phase 3: when the org enforces it, an office punch must be inside an office's radius.
  if (org.settings?.enforceGeofence && workType === 'office' && geo === false) {
    throw codedError(422, 'OUTSIDE_GEOFENCE', 'You are not at an office location. Move closer to the office and retry.');
  }
  const seq = await db.nextSeq('punch');
  const [punch] = await db.Punch.create([{
    seq,
    empId: emp.empId, eventType: 'in', at: new Date(timestamp), date, time, workType,
    source, faceMatch: Number(similarity || 0), liveness: liveness || null,
    location: location ? { lat: location.lat, lon: location.lon, accuracy: location.accuracy ?? null } : undefined,
    geofenceOk: geo, deviceId: deviceId || null, clientRef: clientRef || null,
  }]);

  await db.AttendanceDay.updateOne(
    { empId: emp.empId, date },
    {
      $setOnInsert: { checkIn: time, status: 'present' },
      $set: { mode: `mobile-${workType}`, faceMatch: Number(similarity || 0), ...(location ? { location: { lat: location.lat, lon: location.lon, accuracy: location.accuracy ?? null } } : {}) },
    },
    { upsert: true },
  );
  // An offline punch replayed later can be EARLIER than the stored first check-in.
  await db.AttendanceDay.updateOne({ empId: emp.empId, date, checkIn: { $gt: time } }, { $set: { checkIn: time } });
  return { alreadyMarked: false, eventId: String(punch._id) };
}

function apkRouter(config) {
  const r = express.Router();
  const auth = requireAuth(config);

  // ── No auth (org from X-Org-Code) ─────────────────────────────────────────
  r.get('/config', resolveOrg(), (req, res) => {
    const s = req.org.settings || {};
    sendOk(res, {
      min_apk_version: s.minApkVersion || '1.0.0',
      geofence_radius_m: Number(s.geofenceRadiusM || 200),
      offline_buffer_days: Number(s.offlineBufferDays || 7),
      company_name: req.org.name,                       // CLOUD: shown on the login screen
    });
  });

  r.get('/login-check', resolveOrg(), ah(async (req, res) => {
    const code = String(req.query.empCode || '').trim();
    if (!code) throw httpError(400, 'empCode is required');
    const db = forOrg(req.org._id);
    const emp = await db.Employee.findOne({ $or: [{ empCode: code }, { email: code.toLowerCase() }] })
      .collation({ locale: 'en', strength: 2 }).lean();
    if (!emp || emp.status !== 'active') return sendOk(res, { allowed: false, reason: 'EMPLOYEE_NOT_FOUND' });
    if (!emp.mobileLoginEnabled) return sendOk(res, { allowed: false, reason: 'LOGIN_BLOCKED' });
    return sendOk(res, { allowed: true, role: emp.appRole || 'employee' });
  }));

  r.get('/offices', resolveOrg(), ah(async (req, res) => {
    const db = forOrg(req.org._id);
    const offices = await db.Office.find({}).lean();
    if (!offices.length) return sendOk(res, [{ id: req.org.orgCode, label: req.org.name }]);
    return sendOk(res, offices.map((o) => ({ id: o.officeId, label: o.label, lat: o.lat, lng: o.lng, radiusM: o.radiusM })));
  }));

  r.post('/auth/login', resolveOrg(), ah(async (req, res) => {
    const { empCode, password } = req.body || {};
    if (!empCode || !password) throw httpError(400, 'empCode and password are required');
    const id = String(empCode).trim();
    const db = forOrg(req.org._id);
    const emp = await db.Employee.findOne({ $or: [{ empCode: id }, { email: id.toLowerCase() }] })
      .collation({ locale: 'en', strength: 2 }).lean();
    if (!emp || emp.status !== 'active') throw httpError(401, 'Invalid Employee ID or password');
    if (!emp.mobileLoginEnabled) return sendCode(res, 403, 'LOGIN_BLOCKED', 'Mobile access is disabled. Contact your HR.');
    if (!verifySecret(String(password), emp.tempPasswordHash || emp.passwordHash)) {
      throw httpError(401, 'Invalid Employee ID or password');
    }
    await db.AuditLog.create({ actor: emp.empId, action: 'login' });
    return sendOk(res, {
      token: signToken(config, req.org, emp),
      user: {
        empId: emp.empId, empCode: emp.empCode, name: emp.name, department: emp.department,
        designation: emp.designation, role: emp.appRole, isFieldEmployee: Boolean(emp.isFieldEmployee),
        passwordMustChange: Boolean(emp.passwordMustChange || emp.tempPasswordHash),
      },
    });
  }));

  // ── Everything below: logged-in employee of req.user.orgId ────────────────
  r.use(auth);

  r.patch('/fcm-token', ah(async (req, res) => {
    const { fcmToken } = req.body || {};
    if (!fcmToken) throw httpError(400, 'fcmToken is required');
    await forOrg(req.user.orgId).Employee.updateOne({ empId: req.user.empId }, { $set: { fcmToken } });
    sendOk(res, { registered: true });
  }));

  r.get('/today-status', ah(async (req, res) => {
    const db = forOrg(req.user.orgId);
    const today = todayLocal(req.org.tzOffsetMin);
    const [day, last, assignment] = await Promise.all([
      db.AttendanceDay.findOne({ empId: req.user.empId, date: today }).lean(),
      db.Punch.findOne({ empId: req.user.empId, date: today }).sort({ at: -1, _id: -1 }).lean(),
      activeAssignment(db, req.user.empId, today),
    ]);
    const todayAttendance = day ? { ...serializeDay(day), currentlyWorking: last?.eventType === 'in' } : null;
    if (!assignment) return sendOk(res, { workType: 'office', assignment: null, todayAttendance });
    return sendOk(res, {
      workType: assignment.workType,
      assignment: { id: String(assignment._id), fromDate: assignment.fromDate, toDate: assignment.toDate, notes: assignment.notes || null },
      todayAttendance,
    });
  }));

  r.post('/attendance', ah(async (req, res) => {
    const { empId, workType, timestamp, similarity, liveness, location, deviceId, clientRef } = req.body || {};
    if (!empId || !workType || !timestamp || !liveness || !location) {
      throw httpError(400, 'empId, workType, timestamp, liveness, location are required');
    }
    // CLOUD: the employee comes from the token; a body empId for someone else is refused.
    if (String(empId) !== String(req.user.empId)) throw httpError(403, 'You can only mark your own attendance');
    if (!WORK_TYPES.includes(workType) || (workType === 'office' && !req.org.settings.allowOfficeMobile)) {
      return sendCode(res, 403, 'MOBILE_BLOCKED', 'Mobile attendance not enabled for today. Please use the office attendance system.');
    }
    if (location.lat == null || location.lon == null) throw httpError(400, 'location.lat and lon are required');
    if ((location.accuracy || 0) > 100) {
      return sendCode(res, 422, 'LOCATION_ACCURACY', 'GPS accuracy too low. Move to open area and retry.');
    }
    if (liveness !== 'PASSED') throw httpError(422, 'Liveness check did not pass');

    const db = forOrg(req.user.orgId);
    const emp = await db.Employee.findOne({ empId: req.user.empId, status: 'active' }).lean();
    if (!emp) throw httpError(404, 'Employee not found');
    if (req.org.settings.requireWorkAssignment && workType !== 'office') {
      const parts = toLocalParts(timestamp, req.org.tzOffsetMin);
      const a = parts && await activeAssignment(db, emp.empId, parts.date);
      if (!a || a.workType !== workType) {
        return sendCode(res, 403, 'MOBILE_BLOCKED', 'Mobile attendance not enabled for today. Please use the office attendance system.');
      }
    }
    const out = await recordCheckIn(db, req.org, emp, { workType, timestamp, similarity, liveness, location, deviceId, source: 'app', clientRef });
    sendOk(res, out);
  }));

  r.post('/attendance/checkout', ah(async (req, res) => {
    const { timestamp } = req.body || {};
    if (!timestamp) throw httpError(400, 'timestamp is required');
    const parts = toLocalParts(timestamp, req.org.tzOffsetMin);
    if (!parts) throw httpError(400, 'timestamp is not a valid date');
    const { date, time } = parts;
    const db = forOrg(req.user.orgId);

    const last = await db.Punch.findOne({ empId: req.user.empId, date }).sort({ at: -1, _id: -1 }).lean();
    if (last?.eventType !== 'in') throw httpError(404, 'No active check-in found for today');
    const day = await db.AttendanceDay.findOne({ empId: req.user.empId, date }).lean();
    if (!day || !day.checkIn) throw httpError(404, 'No check-in found for today');

    await db.Punch.create({
      seq: await db.nextSeq('punch'),
      empId: req.user.empId, eventType: 'out', at: new Date(timestamp), date, time,
      workType: last.workType, source: 'app', clientRef: req.body.clientRef || null,
    });
    // Last-out wins; an older replayed checkout never shortens the day.
    const checkOut = day.checkOut && minutesOf(day.checkOut) > minutesOf(time) ? day.checkOut : time;
    const hoursWorked = hoursBetween(day.checkIn, checkOut);
    await db.AttendanceDay.updateOne({ empId: req.user.empId, date }, { $set: { checkOut, hoursWorked } });
    sendOk(res, { alreadyCheckedOut: false, checkedOutAt: time, hoursWorked });
  }));

  // Offline buffer upload. CLOUD: records are always the caller's own; duplicates (same clientRef or
  // same instant) are skipped, so a phone can safely re-send its whole queue.
  r.post('/attendance/batch-sync', ah(async (req, res) => {
    const records = req.body?.records;
    if (!Array.isArray(records) || !records.length) throw httpError(400, 'records array is required');
    if (records.length > 500) throw httpError(400, 'At most 500 records per batch');
    const db = forOrg(req.user.orgId);
    const emp = await db.Employee.findOne({ empId: req.user.empId, status: 'active' }).lean();
    if (!emp) throw httpError(404, 'Employee not found');
    let synced = 0, skipped = 0, failed = 0;
    for (const rec of records) {
      try {
        if ((rec.empId && String(rec.empId) !== String(req.user.empId)) || !rec.timestamp || !WORK_TYPES.includes(rec.workType)) { failed++; continue; }
        const clientRef = rec.clientRef || `${req.user.empId}|in|${new Date(rec.timestamp).toISOString()}`;
        if (await db.Punch.exists({ clientRef })) { skipped++; continue; }
        const out = await recordCheckIn(db, req.org, emp, { ...rec, source: 'app-offline', clientRef });
        if (out.alreadyMarked) skipped++; else synced++;
      } catch (e) {
        if (e && e.code === 11000) skipped++; else failed++;
      }
    }
    sendOk(res, { synced, skipped, failed });
  }));

  r.get('/live-feed', requireRole('hr-admin', 'owner'), ah(async (req, res) => {
    const db = forOrg(req.user.orgId);
    const today = todayLocal(req.org.tzOffsetMin);
    const [total, days, emps] = await Promise.all([
      db.Employee.countDocuments({ status: 'active' }),
      db.AttendanceDay.find({ date: today }).sort({ checkIn: -1 }).lean(),
      db.Employee.find({}, { empId: 1, empCode: 1, name: 1, department: 1, designation: 1 }).lean(),
    ]);
    const byId = new Map(emps.map((e) => [e.empId, e]));
    const nowMin = minutesOf(toLocalParts(new Date(), req.org.tzOffsetMin).time);
    const feed = days.filter((d) => byId.has(d.empId)).map((d) => {
      const e = byId.get(d.empId);
      const end = d.checkOut ? minutesOf(d.checkOut) : nowMin;
      const hours = d.checkIn ? Math.max(0, (end - minutesOf(d.checkIn)) / 60) : 0;
      return {
        empId: d.empId, empCode: e.empCode, name: e.name, dept: e.department, designation: e.designation,
        workType: d.mode || 'office', checkinTime: d.checkIn || null, checkoutTime: d.checkOut || null,
        hoursWorked: Math.round(hours * 10) / 10, status: d.status,
      };
    });
    const present = feed.length;
    sendOk(res, {
      summary: {
        totalEmployees: total, present,
        onTour: feed.filter((x) => x.workType === 'mobile-tour').length,
        wfh: feed.filter((x) => x.workType === 'mobile-wfh').length,
        absent: Math.max(0, total - present),
      },
      feed,
    }, { date: today });
  }));

  // ── Faces (192-number embeddings only, never photos) ──────────────────────
  r.get('/faces/self-enroll', ah(async (req, res) => {
    const row = await forOrg(req.user.orgId).FaceProfile.findOne({ empId: req.user.empId }).lean();
    sendOk(res, { enrolled: Boolean(row), enrolledAt: row ? row.enrolledAt : null });
  }));

  r.post('/faces/self-enroll', ah(async (req, res) => {
    const { embedding } = req.body || {};
    if (!Array.isArray(embedding) || embedding.length !== 192 || !embedding.every((x) => Number.isFinite(x))) {
      throw httpError(400, 'embedding must be a 192-element float array');
    }
    const db = forOrg(req.user.orgId);
    const enrolledAt = new Date();
    await db.FaceProfile.updateOne({ empId: req.user.empId }, { $set: { embedding, enrolledAt } }, { upsert: true });
    await db.AuditLog.create({ actor: req.user.empId, action: 'face-enrolled' });
    sendOk(res, { empId: req.user.empId, saved: true, embeddingEnrolledAt: enrolledAt });
  }));

  r.get('/faces/:empId/embedding', ah(async (req, res) => {
    const { empId } = req.params;
    if (empId !== req.user.empId && !['hr-admin', 'owner'].includes(req.user.role)) {
      throw httpError(403, 'Not allowed to read another employee\'s face embedding');
    }
    const db = forOrg(req.user.orgId);
    if (!(await db.Employee.exists({ empId }))) throw httpError(404, 'Employee not found');
    const row = await db.FaceProfile.findOne({ empId }).lean();
    if (!row) return res.status(404).json({ ok: false, error: 'NOT_ENROLLED' });
    sendOk(res, { empId, embedding: row.embedding, updatedAt: row.enrolledAt });
  }));

  // ── Employees (HR) ────────────────────────────────────────────────────────
  r.get('/employees', requireRole('hr-admin', 'owner'), ah(async (req, res) => {
    const db = forOrg(req.user.orgId);
    const [emps, faces] = await Promise.all([
      db.Employee.find({ status: 'active' }).sort({ name: 1 }).lean(),
      db.FaceProfile.find({}, { empId: 1 }).lean(),
    ]);
    const enrolled = new Set(faces.map((f) => f.empId));
    sendOk(res, emps.map((e) => ({
      id: e.empId, empCode: e.empCode, name: e.name, department: e.department, designation: e.designation,
      appRole: e.appRole, mobileLoginEnabled: e.mobileLoginEnabled ? 1 : 0,
      enrollmentStatus: enrolled.has(e.empId) ? 'complete' : 'pending',
    })));
  }));

  // ── Own profile ───────────────────────────────────────────────────────────
  r.get('/profile', ah(async (req, res) => {
    const emp = await forOrg(req.user.orgId).Employee.findOne({ empId: req.user.empId }).lean();
    if (!emp) throw httpError(404, 'Employee not found');
    sendOk(res, Object.fromEntries(PROFILE_FIELDS.map((f) => [f, emp.profile?.[f] ?? null])));
  }));

  r.patch('/profile', ah(async (req, res) => {
    const body = req.body || {};
    const $set = {};
    for (const f of PROFILE_FIELDS) {
      if (f in body) $set[`profile.${f}`] = body[f] == null || body[f] === '' ? null : String(body[f]).slice(0, 300);
    }
    if (!Object.keys($set).length) throw httpError(400, 'No profile fields to update');
    const db = forOrg(req.user.orgId);
    await db.Employee.updateOne({ empId: req.user.empId }, { $set });
    const emp = await db.Employee.findOne({ empId: req.user.empId }).lean();
    sendOk(res, Object.fromEntries(PROFILE_FIELDS.map((f) => [f, emp.profile?.[f] ?? null])));
  }));

  // ── Own attendance history / calendar ─────────────────────────────────────
  r.get('/attendance-history', ah(async (req, res) => {
    const rows = await forOrg(req.user.orgId).AttendanceDay.aggregate([
      { $match: { empId: req.user.empId, status: 'present' } },
      { $group: { _id: { $substrBytes: ['$date', 0, 7] }, present: { $sum: 1 } } },
      { $sort: { _id: -1 } }, { $limit: 6 },
    ]);
    sendOk(res, rows.map((x) => ({ month: x._id, present: x.present })));
  }));

  r.get('/attendance-calendar', ah(async (req, res) => {
    const today = todayLocal(req.org.tzOffsetMin);
    const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : today.slice(0, 7);
    const db = forOrg(req.user.orgId);
    const [days, holidays] = await Promise.all([
      db.AttendanceDay.find({ empId: req.user.empId, date: { $regex: `^${month}-` } }).lean(),
      db.Holiday.find({ date: { $regex: `^${month}-` } }).lean(),
    ]);
    const byDate = new Map(days.map((d) => [d.date, d]));
    const holidaySet = new Set(holidays.map((h) => h.date));
    const offSet = new Set(req.org.settings.weeklyOffDays || [0, 6]);
    const [y, m] = month.split('-').map(Number);
    const out = [];
    for (let d = 1; d <= new Date(Date.UTC(y, m, 0)).getUTCDate(); d++) {
      const date = `${month}-${String(d).padStart(2, '0')}`;
      if (date > today) break;
      const rec = byDate.get(date);
      if (rec) { out.push({ date, status: rec.status, checkIn: rec.checkIn, checkOut: rec.checkOut, hoursWorked: rec.hoursWorked, leaveType: rec.leaveType }); continue; }
      const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
      const status = offSet.has(dow) ? 'weekly_off' : holidaySet.has(date) ? 'holiday' : 'absent';
      out.push({ date, status, checkIn: null, checkOut: null, hoursWorked: 0, leaveType: null });
    }
    sendOk(res, out, { month });
  }));

  return r;
}

module.exports = { apkRouter, recordCheckIn };
