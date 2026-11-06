'use strict';
/**
 * Employee requests + leave approval (LEAVE_AND_LATE_PLAN.md sections 2-4), under /api/v1/apk.
 * Same request shape the app already renders for EDGE. PC-linked companies approve in EdgeFolio for
 * Windows, so create / approve / reject / leave-types PUT answer 409 MANAGED_IN_EDGE for them.
 */
const express = require('express');
const mongoose = require('mongoose');
const { forOrg } = require('../tenancy');
const { Organisation } = require('../models');
const { requireAuth, requireRole } = require('../auth');
const { sendOk, httpError, codedError } = require('../lib/http');
const { notifyEmployees } = require('../lib/notify');
const { loadShifts } = require('../lib/shifts');
const { resolveShift } = require('../lib/dayStatus');
const L = require('../lib/leave');

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const TYPES = ['leave', 'attendance_correction', 'advance_salary', 'expense', 'travel', 'shift_change', 'wfh', 'comp_off', 'document_request'];
const STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];
const MAX_BILL_BYTES = 1.5 * 1024 * 1024;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const niceDate = (d) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
const fmtDays = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;
const str = (v, max) => (v == null ? '' : String(v).trim().slice(0, max));

const onPc = (req) => Boolean(req.org.edgeMachineId);
const notOnPc = (req) => { if (onPc(req)) throw codedError(409, 'MANAGED_IN_EDGE', 'Requests and leave for this company are managed in EdgeFolio on the office PC.'); };
const idOr404 = (id) => { if (!mongoose.isValidObjectId(id)) throw httpError(404, 'Request not found'); return id; };

function serialize(r, names = new Map()) {
  return {
    id: String(r._id), type: r.type, status: r.status, title: r.title, details: r.details || {},
    days: r.days ?? null, decisionNote: r.decisionNote || null, decidedBy: r.decidedBy || null,
    decidedByName: r.decidedBy ? names.get(r.decidedBy) || null : null,
    decidedAt: r.decidedAt || null, createdAt: r.createdAt, hasBill: Boolean(r.hasBill),
  };
}
const namesFor = async (db, rows) => {
  const ids = [...new Set(rows.map((r) => r.decidedBy).filter(Boolean))];
  if (!ids.length) return new Map();
  return new Map((await db.Employee.find({ empId: { $in: ids } }, { empId: 1, name: 1 }).lean()).map((e) => [e.empId, e.name]));
};

// Decodes an optional receipt photo (raw base64 or a data: URI). Max 1.5 MB decoded.
function parseBill(b) {
  if (b == null || b === '') return null;
  if (typeof b !== 'string') throw httpError(400, 'billBase64 must be a base64 string');
  const m = b.match(/^data:([\w/+.-]+);base64,([\s\S]*)$/);
  const data = (m ? m[2] : b).replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw httpError(400, 'billBase64 is not valid base64');
  if (Math.floor(data.length * 3 / 4) > MAX_BILL_BYTES) throw httpError(400, 'The photo is too large (max 1.5 MB)');
  const mime = m ? m[1] : data.startsWith('iVBOR') ? 'image/png' : 'image/jpeg';
  return { data, mime };
}

const approverIds = async (db, exceptEmpId) => (await db.Employee.find({ status: 'active', appRole: { $in: ['owner', 'hr-admin'] } }, { empId: 1 }).lean())
  .map((e) => e.empId).filter((id) => id !== exceptEmpId);

function requestsRouter(config) {
  const r = express.Router();
  const auth = requireAuth(config);
  const staff = requireRole('hr-admin', 'owner');

  // Remaining days of one leave type in a year (null = no limit).
  async function remainingFor(db, org, empId, key, year) {
    const row = L.balanceRows(L.leaveTypesOf(org), await L.usageFor(db, empId, year)).find((x) => x.key === key);
    return row ? row.remaining : null;
  }
  const quotaCheck = async (db, org, empId, key, yearDays) => {
    for (const [y, n] of Object.entries(yearDays)) {
      const left = await remainingFor(db, org, empId, key, Number(y));
      if (left != null && n > left) {
        throw codedError(409, 'LEAVE_QUOTA', `Only ${fmtDays(left)} of this leave left for ${y}; this request needs ${fmtDays(n)}.`);
      }
    }
  };

  // ── Employee ──────────────────────────────────────────────────────────────
  r.post('/requests', auth, ah(async (req, res) => {
    notOnPc(req);
    const db = forOrg(req.user.orgId);
    const b = req.body || {};
    if (!TYPES.includes(b.type)) throw httpError(400, `type must be one of: ${TYPES.join(', ')}`);
    const details = b.details == null ? {} : b.details;
    if (typeof details !== 'object' || Array.isArray(details) || JSON.stringify(details).length > 8000) throw httpError(400, 'details must be an object');
    const bill = parseBill(b.billBase64);
    const doc = { empId: req.user.empId, type: b.type, details, bill, hasBill: Boolean(bill) };

    if (b.type === 'leave') {
      const types = L.leaveTypesOf(req.org);
      const lt = types.find((t) => t.key === details.leaveType);
      if (!lt) throw httpError(400, `leaveType must be one of: ${types.map((t) => t.key).join(', ')}`);
      const { fromDate, toDate } = details;
      if (!L.DATE_OK(fromDate) || !L.DATE_OK(toDate)) throw httpError(400, 'fromDate and toDate must be YYYY-MM-DD');
      if (fromDate > toDate) throw httpError(400, 'fromDate must be on or before toDate');
      if (L.spanDays(fromDate, toDate) > 60) throw httpError(400, 'A leave request can cover at most 60 days');
      if (details.halfDay != null && typeof details.halfDay !== 'boolean') throw httpError(400, 'halfDay must be true or false');
      const halfDay = details.halfDay === true;
      if (halfDay && fromDate !== toDate) throw httpError(400, 'A half day needs the same from and to date');
      const [emp, shifts, holidays] = await Promise.all([
        db.Employee.findOne({ empId: req.user.empId }).lean(),
        loadShifts(db, req.org),
        db.Holiday.find({ date: { $gte: fromDate, $lte: toDate } }, { date: 1 }).lean(),
      ]);
      const { days, yearDays } = L.countLeaveDays({ from: fromDate, to: toDate, shift: resolveShift(shifts, emp), holidayDates: holidays.map((h) => h.date), halfDay });
      if (!(days > 0)) throw httpError(400, 'Those days are holidays or weekly offs');
      if (await db.EmployeeRequest.exists({ empId: req.user.empId, type: 'leave', status: { $in: ['pending', 'approved'] }, fromDate: { $lte: toDate }, toDate: { $gte: fromDate } })) {
        throw codedError(409, 'LEAVE_OVERLAP', 'You already have a leave request on some of these days.');
      }
      if (lt.perYear != null) await quotaCheck(db, req.org, req.user.empId, lt.key, yearDays);
      const range = fromDate === toDate ? niceDate(fromDate) : `${niceDate(fromDate)} to ${niceDate(toDate)}`;
      Object.assign(doc, {
        title: `${lt.name} leave — ${range} (${halfDay ? 'half day' : fmtDays(days)})`,
        details: { leaveType: lt.key, fromDate, toDate, halfDay, days, reason: str(details.reason, 500) || null },
        days, year: Number(fromDate.slice(0, 4)), yearDays, leaveType: lt.key, fromDate, toDate, halfDay,
      });
    } else {
      const title = str(b.title, 120);
      if (!title) throw httpError(400, 'title is required');
      doc.title = title;
    }

    const made = await db.EmployeeRequest.create(doc);
    const me = await db.Employee.findOne({ empId: req.user.empId }, { name: 1 }).lean();
    approverIds(db, req.user.empId).then((ids) => notifyEmployees(db, ids, {
      type: 'REQUEST_NEW', title: `New request — ${me ? me.name : 'Employee'}`, body: doc.title, data: { requestId: String(made._id), requestType: b.type },
    })).catch(() => {});
    sendOk(res, serialize(made));
  }));

  r.get('/requests', auth, ah(async (req, res) => {
    if (onPc(req)) return sendOk(res, []);
    const db = forOrg(req.user.orgId);
    const q = { empId: req.user.empId };
    if (req.query.status) {
      if (!STATUSES.includes(req.query.status)) throw httpError(400, `status must be one of: ${STATUSES.join(', ')}`);
      q.status = req.query.status;
    }
    const rows = await db.EmployeeRequest.find(q).sort({ createdAt: -1, _id: -1 }).limit(200).lean();
    const names = await namesFor(db, rows);
    sendOk(res, rows.map((x) => serialize(x, names)));
  }));

  r.get('/requests/:id', auth, ah(async (req, res) => {
    const db = forOrg(req.user.orgId);
    const row = await db.EmployeeRequest.findOne({ _id: idOr404(req.params.id), empId: req.user.empId }).lean();
    if (!row) throw httpError(404, 'Request not found');
    sendOk(res, serialize(row, await namesFor(db, [row])));
  }));

  r.post('/requests/:id/cancel', auth, ah(async (req, res) => {
    const db = forOrg(req.user.orgId);
    const row = await db.EmployeeRequest.findOne({ _id: idOr404(req.params.id), empId: req.user.empId }).lean();
    if (!row) throw httpError(404, 'Request not found');
    const notPending = () => codedError(409, 'REQUEST_NOT_PENDING', 'Only a pending request can be cancelled.');
    if (row.status !== 'pending') throw notPending();
    const upd = await db.EmployeeRequest.findOneAndUpdate({ _id: row._id, status: 'pending' }, { $set: { status: 'cancelled', decidedAt: new Date() } }, { new: true }).lean();
    if (!upd) throw notPending();
    sendOk(res, serialize(upd));
  }));

  r.get('/leave-balance', auth, ah(async (req, res) => {
    if (onPc(req)) return sendOk(res, { casual: 0, sick: 0, annual: 0 }, { year: new Date().getFullYear(), types: [] });
    const db = forOrg(req.user.orgId);
    const year = /^\d{4}$/.test(String(req.query.year || '')) ? Number(req.query.year) : Number(new Date(Date.now() + (req.org.tzOffsetMin ?? 330) * 60000).toISOString().slice(0, 4));
    const types = L.balanceRows(L.leaveTypesOf(req.org), await L.usageFor(db, req.user.empId, year));
    const left = (k) => { const t = types.find((x) => x.key === k); return t.remaining == null ? 999 : t.remaining; };   // 999 = no limit (a number, for the Home card)
    sendOk(res, { casual: left('casual'), sick: left('sick'), annual: left('annual') }, { year, types });
  }));

  // ── Leave types ───────────────────────────────────────────────────────────
  r.get('/leave-types', auth, (req, res) => sendOk(res, L.leaveTypesOf(req.org)));

  r.put('/leave-types', auth, staff, ah(async (req, res) => {
    notOnPc(req);
    const list = Array.isArray(req.body) ? req.body : req.body && req.body.leaveTypes;
    if (!Array.isArray(list) || !list.length) throw httpError(400, 'Send a list of leave types');
    const current = L.leaveTypesOf(req.org);
    const seen = new Set();
    for (const t of list) {
      if (!t || !L.FIXED_KEYS.includes(t.key)) throw httpError(400, `key must be one of: ${L.FIXED_KEYS.join(', ')}`);
      if (seen.has(t.key)) throw httpError(400, `Duplicate key ${t.key}`);
      seen.add(t.key);
      const cur = current.find((c) => c.key === t.key);
      if (t.name !== undefined) {
        const name = str(t.name, 40);
        if (!name) throw httpError(400, 'Leave type name cannot be empty');
        cur.name = name;
      }
      if (t.perYear !== undefined) {
        if (t.key === 'unpaid') {
          if (t.perYear !== null) throw httpError(400, 'Unpaid leave has no yearly limit');
        } else {
          const ok = t.perYear === null || (typeof t.perYear === 'number' && t.perYear >= 0 && t.perYear <= 60 && t.perYear * 2 === Math.floor(t.perYear * 2));
          if (!ok) throw httpError(400, 'perYear must be 0 to 60 (halves allowed) or null for no limit');
          cur.perYear = t.perYear;
        }
      }
    }
    await Organisation.updateOne({ _id: req.org._id }, { $set: { 'settings.leaveTypes': current } });
    sendOk(res, current);
  }));

  // ── Owner / HR approvals ──────────────────────────────────────────────────
  r.get('/approvals', auth, staff, ah(async (req, res) => {
    const db = forOrg(req.user.orgId);
    const status = req.query.status || 'pending';
    if (status !== 'all' && !STATUSES.includes(status)) throw httpError(400, 'status must be pending, approved, rejected or all');
    const q = status === 'all' ? {} : { status };
    if (req.query.type) {
      if (!TYPES.includes(req.query.type)) throw httpError(400, `type must be one of: ${TYPES.join(', ')}`);
      q.type = req.query.type;
    }
    if (onPc(req)) return sendOk(res, [], { pendingCount: 0 });
    const [rows, pendingCount, emps] = await Promise.all([
      db.EmployeeRequest.find(q).sort({ createdAt: -1, _id: -1 }).limit(300).lean(),
      db.EmployeeRequest.countDocuments({ status: 'pending' }),
      db.Employee.find({}, { empId: 1, empCode: 1, name: 1, department: 1 }).lean(),
    ]);
    const byId = new Map(emps.map((e) => [e.empId, e]));
    const names = new Map(emps.map((e) => [e.empId, e.name]));
    const usageCache = new Map();
    const out = [];
    for (const x of rows) {
      const e = byId.get(x.empId);
      const o = { ...serialize(x, names), employee: { empId: x.empId, empCode: e ? e.empCode : null, name: e ? e.name : null, department: e ? e.department || null : null } };
      if (x.type === 'leave') {
        const ck = `${x.empId}:${x.year}`;
        if (!usageCache.has(ck)) usageCache.set(ck, await L.usageFor(db, x.empId, x.year));
        const row = L.balanceRows(L.leaveTypesOf(req.org), usageCache.get(ck)).find((t) => t.key === x.leaveType);
        o.balance = row ? row.remaining : null;
      }
      out.push(o);
    }
    sendOk(res, out, { pendingCount });
  }));

  async function decide(req, res, decision) {
    notOnPc(req);
    const db = forOrg(req.user.orgId);
    const row = await db.EmployeeRequest.findOne({ _id: idOr404(req.params.id) }).lean();
    if (!row) throw httpError(404, 'Request not found');
    if (row.empId === req.user.empId && req.user.role !== 'owner') throw httpError(403, 'You cannot decide your own request');
    const notPending = () => codedError(409, 'REQUEST_NOT_PENDING', 'This request is no longer pending.');
    if (row.status !== 'pending') throw notPending();
    const note = str((req.body || {}).note, 300) || null;
    if (decision === 'approved' && row.type === 'leave') await quotaCheck(db, req.org, row.empId, row.leaveType, row.yearDays || {});
    const upd = await db.EmployeeRequest.findOneAndUpdate({ _id: row._id, status: 'pending' },
      { $set: { status: decision, decisionNote: note, decidedBy: req.user.empId, decidedAt: new Date() } }, { new: true }).lean();
    if (!upd) throw notPending();
    const label = upd.type === 'leave' ? 'Leave' : 'Request';
    notifyEmployees(db, [upd.empId], {
      type: 'REQUEST_DECISION',
      title: decision === 'approved' ? `${label} approved` : `Request rejected${note ? ` — ${note}` : ''}`,
      body: upd.title, data: { requestId: String(upd._id), requestType: upd.type, status: decision },
    }).catch(() => {});
    sendOk(res, serialize(upd, await namesFor(db, [upd])));
  }
  r.post('/approvals/:id/approve', auth, staff, ah((req, res) => decide(req, res, 'approved')));
  r.post('/approvals/:id/reject', auth, staff, ah((req, res) => decide(req, res, 'rejected')));

  r.get('/approvals/:id/bill', auth, staff, ah(async (req, res) => {
    const row = await forOrg(req.user.orgId).EmployeeRequest.findOne({ _id: idOr404(req.params.id) }, null).select('+bill').lean();
    if (!row || !row.bill || !row.bill.data) throw httpError(404, 'No bill attached');
    sendOk(res, { mime: row.bill.mime, data: row.bill.data });
  }));

  return r;
}

module.exports = { requestsRouter };
