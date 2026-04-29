const {
  listLeaves,
  findLeaveById,
  listLeaveBalances,
  createLeaveRequest,
  updateLeaveStatus,
} = require('../models/leave');
const { findEmployeeById } = require('../models/employee');
const { notifyLeaveStatus } = require('../services/notificationService');
const { sendOk, createHttpError } = require('../utils/http');
const { ensureRequired } = require('../utils/validators');
const { serializeLeave, serializeLeaveBalance } = require('../utils/serializers');

function listLeavesHandler(_req, res) {
  const rows = listLeaves().map(serializeLeave);
  sendOk(res, rows, { count: rows.length });
}

function listLeaveBalancesHandler(_req, res) {
  const rows = listLeaveBalances().map(serializeLeaveBalance);
  sendOk(res, rows, { count: rows.length });
}

function createLeaveHandler(req, res, next) {
  try {
    ensureRequired(['employeeId', 'leaveType', 'fromDate', 'toDate'], req.body || {});
    const leave = serializeLeave(createLeaveRequest(req.body || {}));
    res.status(201);
    return sendOk(res, leave);
  } catch (error) {
    return next(error);
  }
}

function updateLeaveStatusHandler(req, res, next) {
  const existing = findLeaveById(req.params.leaveId);
  if (!existing) return next(createHttpError(404, 'Leave request not found'));

  const status = req.body?.status;
  if (!status) return next(createHttpError(400, 'status is required'));

  const updated = serializeLeave(
    updateLeaveStatus(req.params.leaveId, status, req.user?.email || 'Admin'),
  );

  const employee = findEmployeeById(existing.employee_id);
  if (employee?.phone) {
    notifyLeaveStatus({
      employeePhone: employee.phone,
      employeeName: existing.employee_name,
      status,
    });
  }

  return sendOk(res, updated);
}

module.exports = {
  listLeavesHandler,
  listLeaveBalancesHandler,
  createLeaveHandler,
  updateLeaveStatusHandler,
};
