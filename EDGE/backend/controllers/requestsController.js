'use strict';
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { getDb } = require('../config/database');
const { UPLOADS_DIR } = require('../config/app');
const { sendOk, createHttpError } = require('../utils/http');
// EDGE already has a full, working leave system (desktop-facing: create/list/
// approve) — leave_requests + leave_balances, controllers/leaveController.js.
// Rather than duplicate that in employee_requests, the 'leave' request type
// delegates to it directly. Nothing in EDGE's own leave code changes.
const { createLeaveRequest, listLeaves } = require('../models/leave');

const VALID_TYPES = [
  'leave', 'attendance_correction', 'advance_salary', 'expense',
  'travel', 'shift_change', 'wfh', 'comp_off', 'document_request',
];

function requireEmpId(req) {
  const empId = req.user?.empId;
  if (!empId) throw createHttpError(401, 'Not authenticated as APK employee');
  return empId;
}

function mapRow(row) {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    title: row.title,
    details: JSON.parse(row.details_json || '{}'),
    decisionNote: row.decision_note || null,
    decidedBy: row.decided_by || null,
    decidedAt: row.decided_at || null,
    createdAt: row.created_at,
  };
}

// Normalises a leave_requests row into the same shape as mapRow(), so the
// unified "My Requests" list can merge both sources transparently.
function mapLeaveRow(row) {
  const range = row.from_date === row.to_date ? row.from_date : `${row.from_date} to ${row.to_date}`;
  return {
    id: row.leave_id,
    type: 'leave',
    status: row.status,
    title: `${row.leave_type} Leave — ${range}`,
    details: { leaveType: row.leave_type, fromDate: row.from_date, toDate: row.to_date, days: row.days, reason: row.reason },
    decisionNote: null,
    decidedBy: row.approved_by || null,
    decidedAt: row.status !== 'pending' ? row.updated_at : null,
    createdAt: row.request_date || row.created_at,
  };
}

// POST /requests — body: { type, title, details, billBase64? }
// billBase64 (expense receipts) is written to disk, not embedded in details_json —
// a photo doesn't belong bloating a text column. Path lands in details.billPath.
function createRequestHandler(req, res, next) {
  try {
    const empId = requireEmpId(req);
    const { type, title, details, billBase64 } = req.body || {};
    if (!type || !VALID_TYPES.includes(type)) {
      throw createHttpError(400, `type must be one of: ${VALID_TYPES.join(', ')}`);
    }

    if (type === 'leave') {
      const { fromDate, toDate, leaveType, reason } = details || {};
      if (!fromDate || !toDate) throw createHttpError(400, 'details.fromDate and details.toDate are required for leave');
      const leave = createLeaveRequest({ employeeId: empId, leaveType: leaveType || 'casual', fromDate, toDate, reason });
      return sendOk(res, mapLeaveRow(leave));
    }

    if (!title || !String(title).trim()) throw createHttpError(400, 'title is required');

    const id = randomUUID();
    const finalDetails = { ...(details || {}) };

    if (billBase64) {
      const dir = path.join(UPLOADS_DIR, 'requests', empId);
      fs.mkdirSync(dir, { recursive: true });
      const match = /^data:(.+);base64,/.exec(billBase64);
      const ext = match?.[1]?.split('/')[1]?.split('+')[0] || 'jpg';
      const fileName = `${id}-bill.${ext}`;
      const buffer = Buffer.from(billBase64.replace(/^data:.+;base64,/, ''), 'base64');
      fs.writeFileSync(path.join(dir, fileName), buffer);
      finalDetails.billPath = path.join('requests', empId, fileName);
    }

    const db = getDb();
    db.prepare(
      `INSERT INTO employee_requests (id, employee_id, type, title, details_json)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(id, empId, type, String(title).trim(), JSON.stringify(finalDetails));

    const row = db.prepare('SELECT * FROM employee_requests WHERE id = ?').get(id);
    return sendOk(res, mapRow(row));
  } catch (err) {
    return next(err);
  }
}

// GET /requests?status=pending — own requests only, merged across employee_requests
// and the pre-existing leave_requests table (see the 'leave' delegation above).
function listRequestsHandler(req, res, next) {
  try {
    const empId = requireEmpId(req);
    const { status } = req.query || {};
    if (status && !['pending', 'approved', 'rejected'].includes(status)) {
      throw createHttpError(400, 'status must be pending, approved, or rejected');
    }
    const db = getDb();

    let sql = 'SELECT * FROM employee_requests WHERE employee_id = ?';
    const params = [empId];
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    const genericRows = db.prepare(sql).all(...params).map(mapRow);

    const leaveRows = listLeaves()
      .filter((r) => r.employee_id === empId && (!status || r.status === status))
      .map(mapLeaveRow);

    const combined = [...genericRows, ...leaveRows].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return sendOk(res, combined);
  } catch (err) {
    return next(err);
  }
}

// GET /requests/:id — own request only
function getRequestHandler(req, res, next) {
  try {
    const empId = requireEmpId(req);
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM employee_requests WHERE id = ? AND employee_id = ?')
      .get(req.params.id, empId);
    if (!row) throw createHttpError(404, 'Request not found');
    return sendOk(res, mapRow(row));
  } catch (err) {
    return next(err);
  }
}

module.exports = { createRequestHandler, listRequestsHandler, getRequestHandler, VALID_TYPES };
