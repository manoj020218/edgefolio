'use strict';
/**
 * Phase 4 — app-only companies and owner tools (mounted at /api/v1/apk BEFORE routes/apk.js, which
 * puts everything after its public routes behind auth).
 *
 *   POST /signup                       Google sign-in → register on the billing platform (or use an
 *                                      existing licence key) → company + owner, logged in
 *   POST /auth/google                  owner/HR sign-in with Google (picks a company if several)
 *   GET  /company                      company code, licence key, links to share (owner/HR)
 *   POST /employees                    add an employee (app-only companies) → temporary password
 *   POST /employees/:id/reset-password new temporary password
 *   PATCH /employees/:id               edit / enable / deactivate
 *   GET  /reports/attendance/link      short-lived link to the monthly attendance CSV
 * and, mounted separately at /api/v1/reports:
 *   GET  /attendance.csv?t=…           the CSV itself (opened in the phone's browser)
 *
 * Companies linked to an EDGE desktop get their employees from EDGE, so employee edits here are
 * refused with MANAGED_IN_EDGE (EDGE owns the employee master).
 */
const crypto = require('crypto');
const mongoose = require('mongoose');
const express = require('express');
const { toLocalParts, isoLocal, instantOf, workedBetween, offsetLabel } = require('../lib/time');
const jwt = require('jsonwebtoken');
const { Organisation, Employee } = require('../models');
const { forOrg } = require('../tenancy');
const { createOrgRecord, randomTempPassword } = require('../orgAdmin');
const { signToken, requireAuth, requireRole, orgCodeFrom } = require('../auth');
const { sendOk, httpError, codedError } = require('../lib/http');
const { hashSecret } = require('../lib/password');
const { loadShifts } = require('../lib/shifts');
const { resolveShift, computeDay } = require('../lib/dayStatus');

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const str = (v, max = 120) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, max));
const ROLES = ['owner', 'hr-admin', 'employee'];

function loginPayload(config, org, emp) {
  return {
    token: signToken(config, org, emp),
    orgCode: org.orgCode,
    companyName: org.name,
    user: {
      empId: emp.empId, empCode: emp.empCode, name: emp.name, department: emp.department,
      designation: emp.designation, role: emp.appRole, isFieldEmployee: Boolean(emp.isFieldEmployee),
      passwordMustChange: false,
    },
  };
}

function edgeLinked(org) { return Boolean(org.edgeMachineId); }

function ownerRouter(config, { google, billing }) {
  const r = express.Router();
  const auth = requireAuth(config);

  // ── Create a company from the app ──────────────────────────────────────────
  r.post('/signup', ah(async (req, res) => {
    const b = req.body || {};
    const companyName = str(b.companyName, 120);
    const phone = str(b.phone, 20);
    const licenseKeyIn = str(b.licenseKey, 100);
    if (!companyName) throw httpError(400, 'Company name is required');
    const g = await google(b.idToken);
    const ownerName = str(b.ownerName, 80) || g.name;

    let licenseKey = licenseKeyIn;
    let billingClientId = null;
    if (licenseKey) {
      // Using an existing licence (e.g. from EdgeFolio desktop or the website): it must belong to
      // this Google account, or anyone holding a key could take over a company.
      const lic = await billing.verifyLicense(licenseKey).catch((e) => { throw e.status === 404 ? codedError(404, 'LICENCE_NOT_FOUND', 'That licence key was not found.') : e; });
      if (!lic.valid) throw codedError(403, 'LICENCE_INVALID', 'That licence key is not active.');
      if (String(lic.ownerEmail || '').toLowerCase() !== g.email) {
        throw codedError(403, 'LICENCE_EMAIL_MISMATCH', 'This licence is registered to a different email. Sign in with that Google account.');
      }
      billingClientId = lic.clientId || null;
    } else {
      if (!phone || !/^\+?\d{7,15}$/.test(phone.replace(/[\s\-()]/g, ''))) throw httpError(400, 'A valid mobile number is required');
      try {
        const s = await billing.signup({ companyName, contactName: ownerName, phone, email: g.email });
        licenseKey = s.licenseKey;
      } catch (e) {
        if (e.status !== 409) throw e;
        // Already registered (e.g. EdgeFolio for Windows or the website). Google has just proved this
        // email is theirs, so reuse that licence instead of failing. If only the PHONE matched a
        // different owner, there is nothing of theirs to reuse — explain instead.
        const lic = billing.findLicenseByEmail ? await billing.findLicenseByEmail(g.email).catch(() => null) : null;
        if (!lic || !lic.valid || String(lic.ownerEmail || '').toLowerCase() !== g.email) {
          throw codedError(409, 'LICENCE_EXISTS', 'This mobile number is already registered with a different email. Use another mobile number, or sign in with the Google account it was registered with.');
        }
        licenseKey = lic.licenseKey;
        billingClientId = lic.clientId || null;
      }
    }

    // Same licence already has a company (e.g. EDGE connected first): sign the owner in instead.
    const existing = await Organisation.findOne({ licenseKey }).lean();
    if (existing) {
      const db = forOrg(existing._id);
      let owner = await db.Employee.findOne({ email: g.email, status: 'active' }).lean();
      if (!owner) {
        await db.Employee.create({ empId: `cloud-${crypto.randomUUID()}`, empCode: 'OWNER', name: ownerName, email: g.email, appRole: 'owner', googleSub: g.sub });
        owner = await db.Employee.findOne({ email: g.email }).lean();
      }
      return sendOk(res, { ...loginPayload(config, existing, owner), licenseKey, created: false });
    }

    const org = await createOrgRecord({ name: companyName, licenseKey, billingClientId });
    const db = forOrg(org._id);
    const owner = await db.Employee.create({
      empId: `cloud-${crypto.randomUUID()}`, empCode: 'OWNER', name: ownerName, email: g.email, appRole: 'owner', googleSub: g.sub,
    });
    await db.AuditLog.create({ actor: owner.empId, action: 'org-signup', detail: { via: licenseKeyIn ? 'licence' : 'billing-signup' } });
    billing.link({ licenseKey, orgCode: org.orgCode, maxActiveEmployees: org.maxActiveEmployees }).catch(() => {});   // best effort
    sendOk(res, { ...loginPayload(config, org, owner), licenseKey, created: true });
  }));

  // ── Sign in with Google (owners / HR) ──────────────────────────────────────
  r.post('/auth/google', ah(async (req, res) => {
    const g = await google(req.body?.idToken);
    const code = orgCodeFrom(req);
    const filter = { email: g.email, status: 'active', mobileLoginEnabled: true };
    let candidates = await Employee.find(filter).lean();
    if (code) {
      const org = await Organisation.findOne({ orgCode: code }).lean();
      candidates = org ? candidates.filter((e) => String(e.orgId) === String(org._id)) : [];
    }
    if (!candidates.length) throw codedError(404, 'NO_ACCOUNT', 'No company uses this Google account yet. Create a company, or sign in with your Employee ID.');
    const orgs = await Organisation.find({ _id: { $in: candidates.map((e) => e.orgId) }, status: 'active' }).lean();
    if (orgs.length > 1) return sendOk(res, { chooseCompany: orgs.map((o) => ({ orgCode: o.orgCode, companyName: o.name })) });
    if (!orgs.length) throw httpError(403, 'This company account is suspended');
    const emp = candidates.find((e) => String(e.orgId) === String(orgs[0]._id));
    if (!emp.googleSub) await forOrg(orgs[0]._id).Employee.updateOne({ empId: emp.empId }, { $set: { googleSub: g.sub } });
    sendOk(res, loginPayload(config, orgs[0], emp));
  }));

  // ── Company screen ─────────────────────────────────────────────────────────
  r.get('/company', auth, requireRole('owner', 'hr-admin'), ah(async (req, res) => {
    const db = forOrg(req.user.orgId);
    const [activeEmployees, owner] = await Promise.all([
      db.Employee.countDocuments({ status: 'active' }),
      db.Employee.findOne({ appRole: 'owner', status: 'active' }).sort({ createdAt: 1 }).lean(),
    ]);
    const org = req.org;
    sendOk(res, {
      orgCode: org.orgCode,
      companyName: org.name,
      licenseKey: req.user.role === 'owner' ? (org.licenseKey || null) : null,   // licence key: owner only
      ownerEmail: owner?.email || null,
      activeEmployees,
      linkedToPc: edgeLinked(org),
      employeesManagedIn: edgeLinked(org) ? 'pc' : 'app',
      pcDownloadUrl: config.pcDownloadUrl,
      appDownloadUrl: config.appDownloadUrl,
    });
  }));

  // Owner edits the company name (app-only companies; a PC-linked company takes its name from the PC).
  r.patch('/company', auth, requireRole('owner'), ah(async (req, res) => {
    if (edgeLinked(req.org)) throw codedError(409, 'MANAGED_IN_EDGE', 'The company name comes from EdgeFolio on the office PC. Change it there.');
    const name = str(req.body?.companyName, 120);
    if (!name || name.length < 2) throw httpError(400, 'Enter the company name');
    await Organisation.updateOne({ _id: req.org._id }, { $set: { name } });
    await forOrg(req.user.orgId).AuditLog.create({ actor: req.user.empId, action: 'company-renamed', detail: { from: req.org.name, to: name } });
    sendOk(res, { companyName: name });
  }));

  // ── Employees (app-only companies) ─────────────────────────────────────────
  const notOnPc = (req) => { if (edgeLinked(req.org)) throw codedError(409, 'MANAGED_IN_EDGE', 'Employees for this company are managed in EdgeFolio on the office PC.'); };

  // shiftId: undefined/null = company default; otherwise must be one of this company's shifts.
  const checkShiftId = async (db, v) => {
    if (v === undefined || v === null || v === '') return null;
    if (!mongoose.isValidObjectId(v) || !(await db.Shift.exists({ _id: String(v) }))) throw httpError(400, 'Unknown shift');
    return String(v);
  };

  r.post('/employees', auth, requireRole('owner', 'hr-admin'), ah(async (req, res) => {
    notOnPc(req);
    const b = req.body || {};
    const name = str(b.name, 120);
    if (!name) throw httpError(400, 'Name is required');
    const db = forOrg(req.user.orgId);
    let empCode = str(b.empCode, 30);
    if (!empCode) empCode = `E${String(await db.nextSeq('empCode')).padStart(4, '0')}`;
    const role = ROLES.includes(b.appRole) ? b.appRole : 'employee';
    if (role === 'owner' && req.user.role !== 'owner') throw httpError(403, 'Only the owner can add another owner');
    const shiftId = await checkShiftId(db, b.shiftId);
    const tempPassword = randomTempPassword();
    try {
      await db.Employee.create({
        shiftId,
        empId: `cloud-${crypto.randomUUID()}`, empCode, name, email: str(b.email, 200)?.toLowerCase() || null,
        department: str(b.department, 100), designation: str(b.designation, 100), appRole: role,
        isFieldEmployee: Boolean(b.isFieldEmployee), tempPasswordHash: hashSecret(tempPassword), passwordMustChange: true,
      });
    } catch (e) {
      if (e.code === 11000) throw httpError(409, `Employee ID ${empCode} is already used`);
      throw e;
    }
    const emp = await db.Employee.findOne({ empCode }).collation({ locale: 'en', strength: 2 }).lean();
    await db.AuditLog.create({ actor: req.user.empId, action: 'employee-added', detail: { empCode } });
    sendOk(res, { empId: emp.empId, empCode, name, appRole: role, shiftId, tempPassword, orgCode: req.org.orgCode, appDownloadUrl: config.appDownloadUrl });
  }));

  r.post('/employees/:id/reset-password', auth, requireRole('owner', 'hr-admin'), ah(async (req, res) => {
    notOnPc(req);
    const db = forOrg(req.user.orgId);
    const emp = await db.Employee.findOne({ empId: req.params.id }).lean();
    if (!emp) throw httpError(404, 'Employee not found');
    if (emp.appRole === 'owner' && req.user.role !== 'owner') throw httpError(403, 'Only the owner can reset an owner\'s password');
    const tempPassword = randomTempPassword();
    await db.Employee.updateOne({ empId: emp.empId }, { $set: { tempPasswordHash: hashSecret(tempPassword), passwordMustChange: true } });
    await db.AuditLog.create({ actor: req.user.empId, action: 'password-reset', detail: { empCode: emp.empCode } });
    sendOk(res, { empId: emp.empId, empCode: emp.empCode, tempPassword });
  }));

  r.patch('/employees/:id', auth, requireRole('owner', 'hr-admin'), ah(async (req, res) => {
    const b = req.body || {};
    const db = forOrg(req.user.orgId);
    const emp = await db.Employee.findOne({ empId: req.params.id }).lean();
    if (!emp) throw httpError(404, 'Employee not found');
    const $set = {};
    // Mobile login on/off is allowed for every company (EDGE's own app does the same); the rest only
    // for app-only companies.
    if (typeof b.mobileLoginEnabled === 'boolean' || b.mobileLoginEnabled === 0 || b.mobileLoginEnabled === 1) $set.mobileLoginEnabled = Boolean(b.mobileLoginEnabled);
    const editable = ['shiftId', 'name', 'department', 'designation', 'email', 'appRole', 'status', 'isFieldEmployee'];
    if (editable.some((k) => k in b)) {
      notOnPc(req);
      if ('shiftId' in b) $set.shiftId = await checkShiftId(db, b.shiftId);
      if ('name' in b && str(b.name)) $set.name = str(b.name);
      for (const k of ['department', 'designation']) if (k in b) $set[k] = str(b[k], 100);
      if ('email' in b) $set.email = str(b.email, 200)?.toLowerCase() || null;
      if ('isFieldEmployee' in b) $set.isFieldEmployee = Boolean(b.isFieldEmployee);
      if ('status' in b) $set.status = b.status === 'inactive' ? 'inactive' : 'active';
      if ('appRole' in b && ROLES.includes(b.appRole)) {
        if ((b.appRole === 'owner' || emp.appRole === 'owner') && req.user.role !== 'owner') throw httpError(403, 'Only the owner can change owner roles');
        $set.appRole = b.appRole;
      }
      if (emp.empId === req.user.empId && ($set.status === 'inactive' || ($set.appRole && $set.appRole !== emp.appRole))) {
        throw httpError(400, 'You cannot deactivate yourself or change your own role');
      }
    }
    if (!Object.keys($set).length) throw httpError(400, 'Nothing to change');
    await db.Employee.updateOne({ empId: emp.empId }, { $set });
    const after = await db.Employee.findOne({ empId: emp.empId }).lean();
    sendOk(res, { id: after.empId, empCode: after.empCode, name: after.name, appRole: after.appRole, status: after.status, shiftId: after.shiftId || null, mobileLoginEnabled: after.mobileLoginEnabled ? 1 : 0 });
  }));

  // ── Monthly attendance export ──────────────────────────────────────────────
  r.get('/reports/attendance/link', auth, requireRole('owner', 'hr-admin'), ah(async (req, res) => {
    const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : null;
    if (!month) throw httpError(400, 'month=YYYY-MM is required');
    const format = req.query.format === 'excel' ? 'excel' : 'csv';
    const t = jwt.sign({ purpose: 'report-attendance', orgId: req.user.orgId, month, format }, config.jwtSecret, { expiresIn: '10m', algorithm: 'HS256' });
    sendOk(res, { url: `${config.publicBaseUrl}/api/v1/reports/attendance.csv?t=${encodeURIComponent(t)}`, expiresInSec: 600 });
  }));

  return r;
}

// Public CSV download (the phone's browser can't send the app's auth header; the link carries a
// 10-minute single-purpose token instead).
function reportsRouter(config) {
  const r = express.Router();
  r.get('/attendance.csv', ah(async (req, res) => {
    let p;
    try { p = jwt.verify(String(req.query.t || ''), config.jwtSecret, { algorithms: ['HS256'] }); }
    catch { throw httpError(401, 'This download link has expired. Create a new one in the app.'); }
    if (p.purpose !== 'report-attendance') throw httpError(401, 'Invalid download link');
    const org = await Organisation.findById(p.orgId).lean();
    if (!org) throw httpError(404, 'Company not found');
    const db = forOrg(org._id);
    const [days, emps, shifts, holidays] = await Promise.all([
      db.AttendanceDay.find({ date: { $regex: `^${p.month}-` } }).sort({ date: 1 }).lean(),
      db.Employee.find({}, { empId: 1, empCode: 1, name: 1, department: 1, shiftId: 1 }).lean(),
      loadShifts(db, org),
      db.Holiday.find({ date: { $regex: `^${p.month}-` } }).lean(),
    ]);
    const holName = new Map(holidays.map((h) => [h.date, h.name || '']));
    const byId = new Map(emps.map((e) => [e.empId, e]));
    // Column contract (stable — software may parse it):
    //  work_date        YYYY-MM-DD, the shift's START date (a night shift 20:00→04:00 is one row)
    //  employee_id      Employee ID exactly as stored (text; never a number)
    //  employee_name, department   text; department is "" when not set
    //  check_in/out     ISO 8601 local time WITH offset, e.g. 2026-11-03T20:02:11+05:30 ("" if missing)
    //  worked_minutes   whole minutes between first check-in and last check-out (rounded)
    //  worked_hours_2dp worked_minutes / 60, rounded half-up to 2 decimals
    //  shift_name       the employee's shift (the default shift when none is assigned)
    //  gross_minutes    same as worked_minutes; break_minutes = overlap with the shift break when it is unpaid
    //  net_minutes      gross - break; net_hours_2dp = net / 60 half-up (these four are "" without a check-out)
    //  day_status       present | incomplete | leave | holiday | weekly_off | absent
    //  status, work_type (office | tour | wfh), overnight (yes | no), utc_offset (+05:30)
    // format=csv: RFC 4180, UTF-8 WITHOUT BOM, CRLF. format=excel: same plus a UTF-8 BOM (so Excel
    // shows non-English names) and employee_id written as ="0012" so Excel keeps leading zeros.
    const excel = p.format === 'excel';
    const tz = org.tzOffsetMin ?? 330;
    const esc = (v) => { const s = v == null ? '' : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const idCell = (id) => (excel && id ? '"=' + '"'.repeat(2) + String(id).replace(/"/g, '"'.repeat(4)) + '"'.repeat(3) : esc(id ?? ''));
    const lines = [['work_date', 'employee_id', 'employee_name', 'department', 'check_in', 'check_out', 'worked_minutes', 'worked_hours_2dp', 'status', 'work_type', 'overnight', 'utc_offset', 'shift_name', 'gross_minutes', 'break_minutes', 'net_minutes', 'net_hours_2dp', 'day_status'].join(',')];
    for (const d of days) {
      const e = byId.get(d.empId) || {};
      const inAt = d.checkInAt || instantOf(d.date, d.checkIn, tz);
      let outAt = d.checkOutAt || instantOf(d.date, d.checkOut, tz);
      if (outAt && inAt && outAt < inAt) outAt = new Date(outAt.getTime() + 86400000);   // old overnight rows
      const w = workedBetween(inAt, outAt);
      const shift = resolveShift(shifts, e);
      const dd = computeDay({ date: d.date, rec: d, shift, holidayName: holName.has(d.date) ? holName.get(d.date) : null, tz });
      const full = dd.status === 'present';
      const overnight = Boolean(outAt && toLocalParts(outAt, tz).date !== d.date);
      lines.push([
        esc(d.date), idCell(e.empCode), esc(e.name ?? ''), esc(e.department ?? ''),
        esc(isoLocal(inAt, tz)), esc(isoLocal(outAt, tz)),
        outAt ? w.minutes : '', outAt ? w.hours.toFixed(2) : '',
        esc(d.status || ''), esc((d.mode || '').replace('mobile-', '')), overnight ? 'yes' : 'no', offsetLabel(tz),
        esc(shift.name), full ? dd.grossMinutes : '', full ? dd.breakMinutes : '', full ? dd.netMinutes : '', full ? dd.netHours.toFixed(2) : '', dd.status,
      ].join(','));
    }
    const fname = `attendance-${org.orgCode}-${p.month}${excel ? '-excel' : ''}.csv`;
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${fname}"`);
    res.send(`${excel ? '\ufeff' : ''}${lines.join('\r\n')}\r\n`);
  }));
  return r;
}

module.exports = { ownerRouter, reportsRouter };
