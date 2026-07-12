const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const { getDb } = require('../config/database');
const { FACES_DIR } = require('../config/app');
const { sendOk, createHttpError } = require('../utils/http');
const { getJwtSecret } = require('../config/secrets');
const fcm = require('../services/fcmService');

function verifyPassword(input, stored) {
  const [salt, hash] = stored.split(':');
  const derived = crypto.scryptSync(input, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), derived);
}

// ─── Config ─────────────────────────────────────────────────────────────────

function getConfigHandler(_req, res) {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM apk_config').all();
  const cfg = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return sendOk(res, {
    min_apk_version: cfg.min_apk_version || '1.0.0',
    geofence_radius_m: Number(cfg.geofence_radius_m || 200),
    offline_buffer_days: Number(cfg.offline_buffer_days || 7),
  });
}

// ─── Login ───────────────────────────────────────────────────────────────────

// Pre-login check — APK calls this before showing the password field
// GET /apk/login-check?empCode=EMP003
function loginCheckHandler(req, res, next) {
  try {
    const empCode = String(req.query.empCode || '').trim();
    if (!empCode) throw createHttpError(400, 'empCode is required');

    const db = getDb();
    const emp = db
      .prepare('SELECT id, mobile_login_enabled, app_role FROM employees WHERE emp_code = ? COLLATE NOCASE')
      .get(empCode);

    if (!emp) return sendOk(res, { allowed: false, reason: 'EMPLOYEE_NOT_FOUND' });
    if (!emp.mobile_login_enabled) return sendOk(res, { allowed: false, reason: 'LOGIN_BLOCKED' });

    return sendOk(res, { allowed: true, role: emp.app_role || 'employee' });
  } catch (err) {
    return next(err);
  }
}

// APK-specific login: empCode + password → JWT with role from employees.app_role
// POST /apk/auth/login
function apkLoginHandler(req, res, next) {
  try {
    const { empCode, password } = req.body || {};
    if (!empCode || !password) throw createHttpError(400, 'empCode and password are required');

    const db = getDb();
    // Join employees → users on email to get password hash
    const row = db
      .prepare(
        `SELECT e.id AS empId, e.emp_code, e.name, e.department, e.designation,
                e.app_role, e.mobile_login_enabled,
                u.email, u.password_hash, u.temp_password_hash, u.password_must_change
         FROM employees e
         JOIN users u ON LOWER(u.email) = LOWER(e.email)
         WHERE e.emp_code = ? COLLATE NOCASE`,
      )
      .get(String(empCode).trim());

    if (!row) throw createHttpError(401, 'Invalid Employee ID or password');

    if (!row.mobile_login_enabled) {
      return res.status(403).json({
        ok: false,
        error: 'LOGIN_BLOCKED',
        message: 'Mobile access is disabled. Contact your HR.',
      });
    }

    const hashToCheck = row.temp_password_hash || row.password_hash;
    if (!verifyPassword(String(password), hashToCheck)) {
      throw createHttpError(401, 'Invalid Employee ID or password');
    }

    const validRoles = ['owner', 'hr-admin', 'employee'];
    const role = validRoles.includes(row.app_role) ? row.app_role : 'employee';

    const token = jwt.sign(
      { empId: row.empId, empCode: row.emp_code, email: row.email, role },
      getJwtSecret(),
      { expiresIn: '7d' },
    );

    return sendOk(res, {
      token,
      user: {
        empId: row.empId,
        empCode: row.emp_code,
        name: row.name,
        department: row.department,
        designation: row.designation,
        role,
        passwordMustChange: Boolean(row.password_must_change),
      },
    });
  } catch (err) {
    return next(err);
  }
}

// ─── FCM Token ───────────────────────────────────────────────────────────────

function registerFcmTokenHandler(req, res, next) {
  try {
    const { fcmToken } = req.body || {};
    if (!fcmToken) throw createHttpError(400, 'fcmToken is required');
    const empId = req.user?.empId;
    if (!empId) throw createHttpError(401, 'Not authenticated as APK employee');

    getDb().prepare('UPDATE employees SET fcm_token = ? WHERE id = ?').run(fcmToken, empId);
    return sendOk(res, { registered: true });
  } catch (err) {
    return next(err);
  }
}

// ─── Work Assignments ────────────────────────────────────────────────────────

// GET /apk/today-status — employee checks their own work type for today
function getTodayStatusHandler(req, res, next) {
  try {
    const empId = req.user?.empId;
    if (!empId) throw createHttpError(401, 'Not authenticated as APK employee');

    const today = new Date().toISOString().slice(0, 10);
    const db = getDb();
    const assignment = db
      .prepare(
        `SELECT * FROM work_assignments
         WHERE employee_id = ? AND from_date <= ? AND to_date >= ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(empId, today, today);

    if (!assignment) return sendOk(res, { workType: 'office', assignment: null });

    return sendOk(res, {
      workType: assignment.work_type,
      assignment: {
        id: assignment.id,
        fromDate: assignment.from_date,
        toDate: assignment.to_date,
        notes: assignment.notes || null,
      },
    });
  } catch (err) {
    return next(err);
  }
}

// GET /apk/work-assignments?date=YYYY-MM-DD&empId=
function getWorkAssignmentsHandler(req, res, next) {
  try {
    const db = getDb();
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const params = [date, date];
    let sql = `
      SELECT wa.*, e.name AS emp_name, e.emp_code, e.department
      FROM work_assignments wa
      JOIN employees e ON e.id = wa.employee_id
      WHERE wa.from_date <= ? AND wa.to_date >= ?
    `;
    if (req.query.empId) { sql += ' AND wa.employee_id = ?'; params.push(req.query.empId); }
    sql += ' ORDER BY e.name ASC';

    const rows = db.prepare(sql).all(...params);
    return sendOk(
      res,
      rows.map((r) => ({
        id: r.id,
        employee: { id: r.employee_id, name: r.emp_name, empCode: r.emp_code, dept: r.department },
        workType: r.work_type,
        fromDate: r.from_date,
        toDate: r.to_date,
        notes: r.notes || null,
        createdBy: r.created_by || null,
      })),
      { date },
    );
  } catch (err) {
    return next(err);
  }
}

// POST /apk/work-assignments
function createWorkAssignmentHandler(req, res, next) {
  try {
    const { employeeId, workType, fromDate, toDate, notes } = req.body || {};
    if (!employeeId || !workType || !fromDate || !toDate) {
      throw createHttpError(400, 'employeeId, workType, fromDate, toDate are required');
    }
    if (!['tour', 'wfh'].includes(workType)) {
      throw createHttpError(400, 'workType must be "tour" or "wfh"');
    }
    if (fromDate > toDate) throw createHttpError(400, 'fromDate must be on or before toDate');

    const db = getDb();
    if (!db.prepare('SELECT id FROM employees WHERE id = ?').get(employeeId)) {
      throw createHttpError(404, 'Employee not found');
    }

    const id = randomUUID();
    const createdBy = req.user?.empCode || req.user?.email || 'admin';
    db.prepare(
      `INSERT INTO work_assignments (id, employee_id, work_type, from_date, to_date, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, employeeId, workType, fromDate, toDate, notes || null, createdBy);

    return sendOk(res, { id, employeeId, workType, fromDate, toDate });
  } catch (err) {
    return next(err);
  }
}

// DELETE /apk/work-assignments/:id
function deleteWorkAssignmentHandler(req, res, next) {
  try {
    const db = getDb();
    if (!db.prepare('SELECT id FROM work_assignments WHERE id = ?').get(req.params.id)) {
      throw createHttpError(404, 'Work assignment not found');
    }
    db.prepare('DELETE FROM work_assignments WHERE id = ?').run(req.params.id);
    return sendOk(res, { deleted: true });
  } catch (err) {
    return next(err);
  }
}

// ─── Mobile Attendance ───────────────────────────────────────────────────────

// POST /apk/attendance
async function mobileAttendanceHandler(req, res, next) {
  try {
    const { empId, workType, timestamp, similarity, liveness, location, deviceId } = req.body || {};

    if (!empId || !workType || !timestamp || !liveness || !location) {
      throw createHttpError(400, 'empId, workType, timestamp, liveness, location are required');
    }
    if (!['tour', 'wfh'].includes(workType)) {
      return res.status(403).json({
        ok: false,
        error: 'MOBILE_BLOCKED',
        message: 'Mobile attendance not enabled for today. Please use the office attendance system.',
      });
    }
    if (!location.lat || !location.lon) throw createHttpError(400, 'location.lat and lon are required');
    if ((location.accuracy || 0) > 100) {
      return res.status(422).json({
        ok: false,
        error: 'LOCATION_ACCURACY',
        message: 'GPS accuracy too low. Move to open area and retry.',
      });
    }
    if (liveness !== 'PASSED') throw createHttpError(422, 'Liveness check did not pass');

    const today = timestamp.slice(0, 10);
    const db = getDb();

    const emp = db.prepare('SELECT id, name FROM employees WHERE id = ?').get(empId);
    if (!emp) throw createHttpError(404, 'Employee not found');

    // Confirm an active HR assignment for this work type today
    const assignment = db
      .prepare(
        `SELECT id FROM work_assignments
         WHERE employee_id = ? AND work_type = ? AND from_date <= ? AND to_date >= ?`,
      )
      .get(empId, workType, today, today);
    if (!assignment) {
      return res.status(403).json({
        ok: false,
        error: 'MOBILE_BLOCKED',
        message: 'Mobile attendance not enabled for today. Please use the office attendance system.',
      });
    }

    // Block double-marking
    const existing = db
      .prepare('SELECT event_id, check_in FROM attendance_records WHERE member_id = ? AND date = ?')
      .get(empId, today);
    if (existing) {
      return sendOk(res, { alreadyMarked: true, checkedInAt: existing.check_in });
    }

    const eventId = randomUUID();
    const checkIn = timestamp.slice(11, 19);
    const mode = workType === 'tour' ? 'mobile-tour' : 'mobile-wfh';

    db.prepare(
      `INSERT INTO attendance_records
         (event_id, member_id, date, check_in, status, hours_worked, face_match, location_json, attendance_mode, device_id, apk_source)
       VALUES (?, ?, ?, ?, 'present', 0, ?, ?, ?, ?, 1)`,
    ).run(
      eventId, empId, today, checkIn,
      Number(similarity || 0),
      JSON.stringify(location),
      mode,
      deviceId || null,
    );

    // Non-blocking FCM to watchers
    notifyWatchers(db, empId, emp.name, 'checkin', checkIn, workType).catch(() => {});

    return sendOk(res, { eventId, alreadyMarked: false });
  } catch (err) {
    return next(err);
  }
}

// POST /apk/attendance/batch-sync — offline buffer upload
async function batchSyncHandler(req, res, next) {
  try {
    const records = req.body?.records;
    if (!Array.isArray(records) || !records.length) {
      throw createHttpError(400, 'records array is required');
    }

    const db = getDb();
    let synced = 0, skipped = 0, failed = 0;

    const insert = db.prepare(
      `INSERT OR IGNORE INTO attendance_records
         (event_id, member_id, date, check_in, status, hours_worked, face_match, location_json, attendance_mode, device_id, apk_source)
       VALUES (?, ?, ?, ?, 'present', 0, ?, ?, ?, ?, 1)`,
    );

    const tx = db.transaction(() => {
      for (const r of records) {
        try {
          if (!r.empId || !r.timestamp || !['tour', 'wfh'].includes(r.workType)) { failed++; continue; }
          const today = r.timestamp.slice(0, 10);
          const checkIn = r.timestamp.slice(11, 19);
          const mode = r.workType === 'tour' ? 'mobile-tour' : 'mobile-wfh';
          const result = insert.run(
            randomUUID(), r.empId, today, checkIn,
            Number(r.similarity || 0),
            r.location ? JSON.stringify(r.location) : null,
            mode,
            r.deviceId || null,
          );
          if (result.changes > 0) synced++; else skipped++;
        } catch { failed++; }
      }
    });
    tx();

    return sendOk(res, { synced, skipped, failed });
  } catch (err) {
    return next(err);
  }
}

// ─── Live Feed ───────────────────────────────────────────────────────────────

function liveFeedHandler(req, res, next) {
  try {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);

    const total = db.prepare("SELECT COUNT(*) AS n FROM employees WHERE status = 'active'").get().n;

    const feed = db
      .prepare(
        `SELECT ar.event_id, ar.member_id, ar.check_in, ar.check_out, ar.attendance_mode, ar.status,
                e.name, e.department, e.designation, e.emp_code
         FROM attendance_records ar
         JOIN employees e ON e.id = ar.member_id
         WHERE ar.date = ?
         ORDER BY ar.check_in DESC`,
      )
      .all(today);

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const mapped = feed.map((r) => {
      let hoursWorked = 0;
      if (r.check_in) {
        const [ih, im] = r.check_in.split(':').map(Number);
        const inMinutes = ih * 60 + im;
        const endMinutes = r.check_out
          ? r.check_out.split(':').map(Number).reduce((h, m, i) => i === 0 ? h + m * 60 : h + m, 0)
          : nowMinutes;
        hoursWorked = Math.max(0, (endMinutes - inMinutes) / 60);
      }
      return {
        empId: r.member_id,
        empCode: r.emp_code,
        name: r.name,
        dept: r.department,
        designation: r.designation,
        workType: r.attendance_mode || 'office',
        checkinTime: r.check_in || null,
        checkoutTime: r.check_out || null,
        hoursWorked: Math.round(hoursWorked * 10) / 10,
        status: r.status,
      };
    });

    const present = mapped.length;
    const onTour = mapped.filter((r) => r.workType === 'mobile-tour').length;
    const wfh = mapped.filter((r) => r.workType === 'mobile-wfh').length;

    return sendOk(
      res,
      { summary: { totalEmployees: total, present, onTour, wfh, absent: total - present }, feed: mapped },
      { date: today },
    );
  } catch (err) {
    return next(err);
  }
}

// ─── Alert Subscriptions ─────────────────────────────────────────────────────

function getAlertSubscriptionsHandler(req, res, next) {
  try {
    const watcherId = req.user?.empId;
    if (!watcherId) throw createHttpError(401, 'Not authenticated as APK employee');

    const rows = getDb()
      .prepare(
        `SELECT s.id, s.watched_emp_id, s.alert_checkin, s.alert_checkout,
                e.name AS watched_name, e.emp_code, e.department
         FROM employee_alert_subscriptions s
         JOIN employees e ON e.id = s.watched_emp_id
         WHERE s.watcher_emp_id = ?
         ORDER BY e.name`,
      )
      .all(watcherId);

    return sendOk(
      res,
      rows.map((r) => ({
        id: r.id,
        watched: { id: r.watched_emp_id, name: r.watched_name, empCode: r.emp_code, dept: r.department },
        alertCheckin: Boolean(r.alert_checkin),
        alertCheckout: Boolean(r.alert_checkout),
      })),
    );
  } catch (err) {
    return next(err);
  }
}

function createAlertSubscriptionHandler(req, res, next) {
  try {
    const watcherId = req.user?.empId;
    if (!watcherId) throw createHttpError(401, 'Not authenticated as APK employee');

    const { watchedEmpId, alertCheckin = true, alertCheckout = true } = req.body || {};
    if (!watchedEmpId) throw createHttpError(400, 'watchedEmpId is required');

    const db = getDb();
    if (!db.prepare('SELECT id FROM employees WHERE id = ?').get(watchedEmpId)) {
      throw createHttpError(404, 'Employee not found');
    }

    const id = randomUUID();
    db.prepare(
      `INSERT OR REPLACE INTO employee_alert_subscriptions
         (id, watcher_emp_id, watched_emp_id, alert_checkin, alert_checkout)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(id, watcherId, watchedEmpId, alertCheckin ? 1 : 0, alertCheckout ? 1 : 0);

    return sendOk(res, { id, watchedEmpId, alertCheckin, alertCheckout });
  } catch (err) {
    return next(err);
  }
}

function deleteAlertSubscriptionHandler(req, res, next) {
  try {
    const watcherId = req.user?.empId;
    const db = getDb();
    const row = db
      .prepare('SELECT id FROM employee_alert_subscriptions WHERE id = ? AND watcher_emp_id = ?')
      .get(req.params.id, watcherId);
    if (!row) throw createHttpError(404, 'Subscription not found');
    db.prepare('DELETE FROM employee_alert_subscriptions WHERE id = ?').run(req.params.id);
    return sendOk(res, { deleted: true });
  } catch (err) {
    return next(err);
  }
}

// ─── Offices ─────────────────────────────────────────────────────────────────

function getOfficesHandler(_req, res) {
  const db = getDb();
  const rows = db.prepare("SELECT value FROM app_preferences WHERE key LIKE 'office_%'").all();
  const offices = rows.map((r) => { try { return JSON.parse(r.value); } catch { return null; } }).filter(Boolean);

  if (!offices.length) {
    const company = db.prepare('SELECT company_name FROM company_settings WHERE id = 1').get();
    const edgeId = process.env.EDGE_ID || 'edgefolio-local';
    offices.push({ id: edgeId, label: company?.company_name || 'Main Office' });
  }
  return sendOk(res, offices);
}

// ─── Face Embeddings ─────────────────────────────────────────────────────────

function getEmbeddingHandler(req, res, next) {
  try {
    const db = getDb();
    if (!db.prepare('SELECT id FROM employees WHERE id = ?').get(req.params.empId)) {
      throw createHttpError(404, 'Employee not found');
    }
    const row = db.prepare('SELECT * FROM face_enrollments WHERE emp_id = ?').get(req.params.empId);
    if (!row || row.status !== 'complete') {
      return res.status(404).json({ ok: false, error: 'NOT_ENROLLED', status: row?.status || 'pending' });
    }
    if (!row.embedding_json) {
      return res.status(404).json({ ok: false, error: 'EMBEDDING_NOT_READY', status: 'enrolled_no_embedding' });
    }
    return sendOk(res, {
      empId: req.params.empId,
      embedding: JSON.parse(row.embedding_json),
      updatedAt: row.updated_at,
      status: 'complete',
    });
  } catch (err) {
    return next(err);
  }
}

// Admin APK generates embedding locally (TFLite) and uploads here for storage
function saveEmbeddingHandler(req, res, next) {
  try {
    const { embedding } = req.body || {};
    if (!Array.isArray(embedding) || embedding.length !== 128) {
      throw createHttpError(400, 'embedding must be a 128-element float array');
    }

    const db = getDb();
    const row = db.prepare('SELECT status FROM face_enrollments WHERE emp_id = ?').get(req.params.empId);
    if (!row) throw createHttpError(404, 'No face enrollment found. Enroll photos first via /faces/:id/enroll');

    db.prepare(
      `UPDATE face_enrollments SET embedding_json = ?, updated_at = CURRENT_TIMESTAMP WHERE emp_id = ?`,
    ).run(JSON.stringify(embedding), req.params.empId);

    return sendOk(res, { empId: req.params.empId, saved: true });
  } catch (err) {
    return next(err);
  }
}

// ─── Broadcast ───────────────────────────────────────────────────────────────

async function broadcastHandler(req, res, next) {
  try {
    const { type, message, target = 'all' } = req.body || {};
    if (!type || !message) throw createHttpError(400, 'type and message are required');
    if (!['sos', 'holiday', 'event', 'general'].includes(type)) {
      throw createHttpError(400, 'type must be sos | holiday | event | general');
    }
    const db = getDb();
    const admin = db.prepare('SELECT id, name, designation FROM employees WHERE id = ?').get(req.user?.empId);
    if (!admin) throw createHttpError(404, 'Admin employee not found');

    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO announcements (id, type, message, announced_by, target, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, type, message, admin.id, target, now);

    const tokens = db
      .prepare("SELECT fcm_token FROM employees WHERE fcm_token IS NOT NULL AND status = 'active'")
      .all().map((r) => r.fcm_token);
    if (tokens.length) {
      const labels = { sos: 'URGENT', holiday: 'Holiday Notice', event: 'Announcement', general: 'Notice' };
      await fcm.sendToTokens(tokens, labels[type] || 'Announcement', message, { type: 'ANNOUNCEMENT', announcementType: type, id });
    }
    return sendOk(res, { id, sentTo: tokens.length });
  } catch (err) {
    return next(err);
  }
}

// ─── Employee management (admin) ─────────────────────────────────────────────

function getEmployeesHandler(_req, res, next) {
  try {
    const db = getDb();
    const rows = db.prepare(
      `SELECT e.id, e.emp_code AS empCode, e.name, e.department, e.designation,
              e.app_role AS appRole, e.mobile_login_enabled AS mobileLoginEnabled,
              COALESCE(fe.status, 'pending') AS enrollmentStatus
       FROM employees e
       LEFT JOIN face_enrollments fe ON fe.emp_id = e.id
       WHERE e.status = 'active'
       ORDER BY e.name ASC`,
    ).all();
    return sendOk(res, rows);
  } catch (err) {
    return next(err);
  }
}

function patchEmployeeHandler(req, res, next) {
  try {
    const { id } = req.params;
    const { mobileLoginEnabled } = req.body || {};
    if (mobileLoginEnabled === undefined) throw createHttpError(400, 'mobileLoginEnabled is required');
    if (![0, 1].includes(Number(mobileLoginEnabled))) throw createHttpError(400, 'mobileLoginEnabled must be 0 or 1');
    const db = getDb();
    if (!db.prepare('SELECT id FROM employees WHERE id = ?').get(id)) throw createHttpError(404, 'Employee not found');
    db.prepare('UPDATE employees SET mobile_login_enabled = ? WHERE id = ?').run(Number(mobileLoginEnabled), id);
    return sendOk(res, { updated: true });
  } catch (err) {
    return next(err);
  }
}

// ─── Analytics (owner / hr-admin) ───────────────────────────────────────────

// GET /apk/analytics — 7-day headcount trend + today's department breakdown
function getAnalyticsHandler(_req, res, next) {
  try {
    const db = getDb();

    // 7-day trend: how many employees were present each day
    const sevenDayTrend = [];
    const total = db.prepare("SELECT COUNT(*) AS n FROM employees WHERE status = 'active'").get().n;
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const present = db
        .prepare("SELECT COUNT(DISTINCT member_id) AS n FROM attendance_records WHERE date = ?")
        .get(dateStr).n;
      sevenDayTrend.push({ date: dateStr, present, total });
    }

    // Department breakdown for today
    const today = new Date().toISOString().slice(0, 10);
    const depts = db
      .prepare(
        `SELECT COALESCE(department, 'Unknown') AS dept, COUNT(*) AS total
         FROM employees WHERE status = 'active' GROUP BY dept ORDER BY dept`,
      )
      .all();
    const presentByDept = db
      .prepare(
        `SELECT COALESCE(e.department, 'Unknown') AS dept, COUNT(DISTINCT ar.member_id) AS present
         FROM attendance_records ar
         JOIN employees e ON e.id = ar.member_id
         WHERE ar.date = ?
         GROUP BY dept`,
      )
      .all(today);
    const presentMap = Object.fromEntries(presentByDept.map((r) => [r.dept, r.present]));
    const departmentBreakdown = depts.map((d) => ({
      dept: d.dept,
      total: d.total,
      present: presentMap[d.dept] || 0,
    }));

    return sendOk(res, { sevenDayTrend, departmentBreakdown });
  } catch (err) {
    next(err);
  }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

async function notifyWatchers(db, empId, empName, event, time, workType) {
  const col = event === 'checkin' ? 'alert_checkin' : 'alert_checkout';
  const watchers = db
    .prepare(
      `SELECT e.fcm_token FROM employee_alert_subscriptions s
       JOIN employees e ON e.id = s.watcher_emp_id
       WHERE s.watched_emp_id = ? AND s.${col} = 1 AND e.fcm_token IS NOT NULL`,
    )
    .all(empId);
  if (!watchers.length) return;

  const tokens = watchers.map((w) => w.fcm_token).filter(Boolean);
  const title = event === 'checkin' ? `${empName} checked in` : `${empName} checked out`;
  const body = `${time} • ${workType.toUpperCase()}`;

  await fcm.sendToTokens(tokens, title, body, { type: 'ATTENDANCE_ALERT', empId, event, workType, time });
}

module.exports = {
  getConfigHandler,
  getAnalyticsHandler,
  loginCheckHandler,
  apkLoginHandler,
  registerFcmTokenHandler,
  getTodayStatusHandler,
  getWorkAssignmentsHandler,
  createWorkAssignmentHandler,
  deleteWorkAssignmentHandler,
  mobileAttendanceHandler,
  batchSyncHandler,
  liveFeedHandler,
  getAlertSubscriptionsHandler,
  createAlertSubscriptionHandler,
  deleteAlertSubscriptionHandler,
  getOfficesHandler,
  getEmbeddingHandler,
  saveEmbeddingHandler,
  broadcastHandler,
  getEmployeesHandler,
  patchEmployeeHandler,
};
