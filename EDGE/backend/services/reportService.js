const { getDb } = require('../config/database');
const { toISODate } = require('../utils/dateUtils');
const { listAttendanceByRange } = require('../models/attendance');
const { getExpenseSummary } = require('../models/cashbook');
const { listPayrollRuns, listPayslipsByMonth } = require('../models/payroll');

function getDashboardSummary() {
  const db = getDb();
  const today = toISODate();

  const employees = db
    .prepare(
      `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active
      FROM employees
      `,
    )
    .get();

  const attendanceToday = db
    .prepare(
      `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS present,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absent
      FROM attendance_records
      WHERE date = ?
      `,
    )
    .get(today);

  const pendingLeaves = db
    .prepare("SELECT COUNT(*) AS total FROM leave_requests WHERE status = 'pending'")
    .get();

  const payroll = listPayrollRuns()[0] || null;
  const expenses = getExpenseSummary();

  return {
    date: today,
    employees: {
      total: Number(employees.total || 0),
      active: Number(employees.active || 0),
    },
    attendance: {
      total: Number(attendanceToday.total || 0),
      present: Number(attendanceToday.present || 0),
      absent: Number(attendanceToday.absent || 0),
    },
    leaves: {
      pending: Number(pendingLeaves.total || 0),
    },
    payroll: payroll
      ? {
          runId: payroll.run_id,
          monthKey: payroll.month_key,
          status: payroll.status,
          totalAmount: Number(payroll.total_amount || 0),
        }
      : null,
    expenses,
  };
}

function getAttendanceReport({ from, to, department }) {
  return listAttendanceByRange(from, to, department);
}

function getSalaryReport({ month, department }) {
  if (!month) {
    const err = new Error('month query is required');
    err.statusCode = 400;
    throw err;
  }

  const db = getDb();
  const slips = listPayslipsByMonth(month);
  const filtered = !department
    ? slips
    : slips.filter((slip) => {
        const employee = db
          .prepare('SELECT department FROM employees WHERE id = ?')
          .get(slip.employee_id);
        return employee?.department === department;
      });

  const totals = filtered.reduce(
    (acc, row) => {
      acc.gross += Number(row.gross || 0);
      acc.net += Number(row.net_salary || 0);
      return acc;
    },
    { gross: 0, net: 0 },
  );

  return {
    month,
    department: department || 'all',
    totalEmployees: filtered.length,
    totalGross: Number(totals.gross.toFixed(2)),
    totalNet: Number(totals.net.toFixed(2)),
    rows: filtered,
  };
}

module.exports = {
  getDashboardSummary,
  getAttendanceReport,
  getSalaryReport,
};
