const {
  getPayrollOverview,
  runMonthlyPayroll,
  getPayrollRunDetails,
  approveRun,
  getPayslips,
  getPayslip,
  previewPayrollFromSalary,
} = require('../services/payrollEngine');
const {
  listDisputes,
  countOpenDisputes,
  raiseDispute,
  resolveDispute,
  getDisputeForPayslip,
} = require('../models/payroll');
const { sendOk, createHttpError } = require('../utils/http');
const { serializePayrollRun, serializePayslip } = require('../utils/serializers');

function listPayrollRunsHandler(_req, res) {
  const rows = getPayrollOverview().map(serializePayrollRun);
  sendOk(res, rows, { count: rows.length });
}

function runPayrollHandler(req, res, next) {
  try {
    const monthKey = req.body?.monthKey;
    const processedBy = req.user?.email || 'admin@edgefolio.com';
    const run = serializePayrollRun(runMonthlyPayroll(monthKey, processedBy));
    res.status(201);
    return sendOk(res, run);
  } catch (error) {
    return next(error);
  }
}

function payrollRunDetailsHandler(req, res, next) {
  const details = getPayrollRunDetails(req.params.runId);
  if (!details) return next(createHttpError(404, 'Payroll run not found'));
  return sendOk(res, {
    run: serializePayrollRun(details.run),
    payslips: details.payslips.map(serializePayslip),
  });
}

function approveRunHandler(req, res, next) {
  const run = serializePayrollRun(approveRun(req.params.runId, req.user?.email));
  if (!run) return next(createHttpError(404, 'Payroll run not found'));
  return sendOk(res, run);
}

function listPayslipsHandler(req, res) {
  const slips = getPayslips(req.query.month);
  // Attach open dispute info to each payslip
  const rows = slips.map((slip) => {
    const dispute = getDisputeForPayslip(slip.payslip_id);
    return serializePayslip({ ...slip, dispute: dispute || null });
  });
  sendOk(res, rows, { count: rows.length });
}

function getPayslipHandler(req, res, next) {
  const slip = getPayslip(req.params.payslipId);
  if (!slip) return next(createHttpError(404, 'Payslip not found'));
  const dispute = getDisputeForPayslip(slip.payslip_id);
  return sendOk(res, serializePayslip({ ...slip, dispute: dispute || null }));
}

function previewPayrollHandler(req, res) {
  sendOk(res, previewPayrollFromSalary(req.body || {}));
}

// ─── Dispute handlers ─────────────────────────────────────────────────────────

function listDisputesHandler(req, res, next) {
  try {
    const { status } = req.query;
    return sendOk(res, listDisputes(status || null));
  } catch (e) { return next(e); }
}

function disputeCountHandler(_req, res, next) {
  try {
    return sendOk(res, { open: countOpenDisputes() });
  } catch (e) { return next(e); }
}

function raiseDisputeHandler(req, res, next) {
  try {
    const { payslipId } = req.params;
    const { reason, employeeId } = req.body || {};
    if (!reason?.trim()) return next(createHttpError(400, 'reason is required'));
    if (!employeeId)     return next(createHttpError(400, 'employeeId is required'));
    const dispute = raiseDispute(payslipId, employeeId, reason.trim());
    res.status(201);
    return sendOk(res, dispute);
  } catch (e) { return next(e); }
}

function resolveDisputeHandler(req, res, next) {
  try {
    const { disputeId } = req.params;
    const { status, notes } = req.body || {};
    if (!['resolved', 'dismissed'].includes(status)) {
      return next(createHttpError(400, "status must be 'resolved' or 'dismissed'"));
    }
    const dispute = resolveDispute(disputeId, { status, notes, resolvedBy: req.user?.email });
    if (!dispute) return next(createHttpError(404, 'Dispute not found'));
    return sendOk(res, dispute);
  } catch (e) { return next(e); }
}

module.exports = {
  listPayrollRunsHandler,
  runPayrollHandler,
  payrollRunDetailsHandler,
  approveRunHandler,
  listPayslipsHandler,
  getPayslipHandler,
  previewPayrollHandler,
  listDisputesHandler,
  disputeCountHandler,
  raiseDisputeHandler,
  resolveDisputeHandler,
};
