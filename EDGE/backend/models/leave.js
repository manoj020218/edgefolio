const { randomUUID } = require('crypto');
const { getDb } = require('../config/database');
const { daysBetweenInclusive, toISODate } = require('../utils/dateUtils');

function listLeaves() {
  const db = getDb();
  return db.prepare('SELECT * FROM leave_requests ORDER BY request_date DESC').all();
}

function findLeaveById(leaveId) {
  const db = getDb();
  return db.prepare('SELECT * FROM leave_requests WHERE leave_id = ?').get(leaveId);
}

function listLeaveBalances() {
  const db = getDb();
  return db.prepare('SELECT * FROM leave_balances ORDER BY employee_id').all();
}

function createLeaveRequest(payload) {
  const db = getDb();
  const leaveId = payload.leaveId || `LEAVE-${randomUUID().slice(0, 8).toUpperCase()}`;
  const employee = db.prepare('SELECT name FROM employees WHERE id = ?').get(payload.employeeId);
  const days = payload.days || daysBetweenInclusive(payload.fromDate, payload.toDate);

  db.prepare(
    `
    INSERT INTO leave_requests (
      leave_id, employee_id, employee_name, leave_type, from_date, to_date, days, reason, status, request_date, approved_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL)
    `,
  ).run(
    leaveId,
    payload.employeeId,
    employee?.name || 'Unknown',
    payload.leaveType,
    payload.fromDate,
    payload.toDate,
    days,
    payload.reason || '',
    toISODate(),
  );

  return db.prepare('SELECT * FROM leave_requests WHERE leave_id = ?').get(leaveId);
}

function updateLeaveStatus(leaveId, status, approvedBy = 'Admin') {
  const db = getDb();
  db.prepare(
    `
    UPDATE leave_requests
    SET status = ?, approved_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE leave_id = ?
    `,
  ).run(status, approvedBy, leaveId);
  return db.prepare('SELECT * FROM leave_requests WHERE leave_id = ?').get(leaveId);
}

module.exports = {
  listLeaves,
  findLeaveById,
  listLeaveBalances,
  createLeaveRequest,
  updateLeaveStatus,
};
