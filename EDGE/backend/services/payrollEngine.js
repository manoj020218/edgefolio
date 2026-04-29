const {
  listPayrollRuns,
  getPayrollRun,
  listPayslipsByMonth,
  listAllPayslips,
  getPayslipById,
  createPayrollRun,
  approvePayrollRun,
} = require('../models/payroll');
const { monthLabel } = require('../utils/dateUtils');
const { calculateNetSalary } = require('../utils/payrollCalculators');

function getPayrollOverview() {
  return listPayrollRuns();
}

function runMonthlyPayroll(monthKey, processedBy) {
  if (!/^\d{4}-\d{2}$/.test(String(monthKey || ''))) {
    const err = new Error('monthKey must be in YYYY-MM format');
    err.statusCode = 400;
    throw err;
  }
  return createPayrollRun(monthKey, processedBy);
}

function getPayrollRunDetails(runId) {
  const run = getPayrollRun(runId);
  if (!run) return null;
  const payslips = listPayslipsByMonth(run.month_key);
  return { run, payslips };
}

function approveRun(runId, approvedBy) {
  return approvePayrollRun(runId, approvedBy);
}

function getPayslips(month) {
  if (!month) return listAllPayslips();
  return listPayslipsByMonth(month);
}

function getPayslip(payslipId) {
  return getPayslipById(payslipId);
}

function previewPayrollFromSalary({ basicSalary = 0 }) {
  const basic = Number(basicSalary || 0);
  const earnings = {
    basic,
    da: Number((basic * 0.1).toFixed(2)),
    hra: Number((basic * 0.08).toFixed(2)),
    other: 0,
  };
  const deductions = {
    pf: Number((basic * 0.12).toFixed(2)),
    esi: basic <= 21000 ? Number((basic * 0.0075).toFixed(2)) : 0,
    tax: Number((basic * 0.05).toFixed(2)),
    other: 0,
  };
  const totals = calculateNetSalary({ basicSalary: basic, earnings, deductions });
  return {
    monthLabel: monthLabel(new Date().toISOString().slice(0, 7)),
    earnings,
    deductions,
    ...totals,
  };
}

module.exports = {
  getPayrollOverview,
  runMonthlyPayroll,
  getPayrollRunDetails,
  approveRun,
  getPayslips,
  getPayslip,
  previewPayrollFromSalary,
};
