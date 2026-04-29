const {
  getPayrollOverview,
  runMonthlyPayroll,
  getPayrollRunDetails,
  approveRun,
  getPayslips,
  getPayslip,
  previewPayrollFromSalary,
} = require('../services/payrollEngine');
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
  const rows = getPayslips(req.query.month).map(serializePayslip);
  sendOk(res, rows, { count: rows.length });
}

function getPayslipHandler(req, res, next) {
  const payslip = serializePayslip(getPayslip(req.params.payslipId));
  if (!payslip) return next(createHttpError(404, 'Payslip not found'));
  return sendOk(res, payslip);
}

function previewPayrollHandler(req, res) {
  sendOk(res, previewPayrollFromSalary(req.body || {}));
}

module.exports = {
  listPayrollRunsHandler,
  runPayrollHandler,
  payrollRunDetailsHandler,
  approveRunHandler,
  listPayslipsHandler,
  getPayslipHandler,
  previewPayrollHandler,
};
