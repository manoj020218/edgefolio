const { randomUUID } = require('crypto');
const { getDb } = require('../config/database');
const { toISODate } = require('../utils/dateUtils');

function listLoans() {
  const db = getDb();
  return db.prepare('SELECT * FROM loans ORDER BY created_at DESC').all();
}

function findLoanById(loanId) {
  const db = getDb();
  return db.prepare('SELECT * FROM loans WHERE loan_id = ?').get(loanId);
}

function createLoan(payload) {
  const db = getDb();
  const loanId = payload.loanId || `LOAN-${randomUUID().slice(0, 8).toUpperCase()}`;
  const employee = db.prepare('SELECT name FROM employees WHERE id = ?').get(payload.employeeId);

  const principal = Number(payload.principalAmount || 0);
  db.prepare(
    `
    INSERT INTO loans (
      loan_id, employee_id, employee_name, principal_amount, outstanding_amount, emi_amount,
      start_date, end_date, status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `,
  ).run(
    loanId,
    payload.employeeId,
    employee?.name || payload.employeeName || 'Unknown',
    principal,
    principal,
    Number(payload.emiAmount || 0),
    payload.startDate || toISODate(),
    payload.endDate || null,
    payload.notes || '',
  );

  return findLoanById(loanId);
}

function recordLoanRepayment(loanId, amount) {
  const db = getDb();
  const loan = findLoanById(loanId);
  if (!loan) return null;

  const paidAmount = Number(amount || 0);
  const outstandingAmount = Number(Math.max(Number(loan.outstanding_amount) - paidAmount, 0).toFixed(2));
  const status = outstandingAmount <= 0 ? 'closed' : loan.status;

  db.prepare(
    `
    UPDATE loans
    SET outstanding_amount = ?, status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE loan_id = ?
    `,
  ).run(outstandingAmount, status, loanId);

  return findLoanById(loanId);
}

function closeLoan(loanId) {
  const db = getDb();
  db.prepare(
    `
    UPDATE loans
    SET status = 'closed', outstanding_amount = 0, updated_at = CURRENT_TIMESTAMP
    WHERE loan_id = ?
    `,
  ).run(loanId);
  return findLoanById(loanId);
}

module.exports = {
  listLoans,
  findLoanById,
  createLoan,
  recordLoanRepayment,
  closeLoan,
};
