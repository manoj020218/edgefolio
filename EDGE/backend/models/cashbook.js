const { randomUUID } = require('crypto');
const { getDb } = require('../config/database');
const { toISODate } = require('../utils/dateUtils');

function listExpenses(category = 'all') {
  const db = getDb();
  if (!category || category === 'all') {
    return db.prepare('SELECT * FROM expenses ORDER BY date DESC, expense_id DESC').all();
  }
  return db
    .prepare('SELECT * FROM expenses WHERE category = ? ORDER BY date DESC, expense_id DESC')
    .all(category);
}

function createExpense(payload) {
  const db = getDb();
  const expenseId = payload.expenseId || `EXP-${randomUUID().slice(0, 8).toUpperCase()}`;
  db.prepare(
    `
    INSERT INTO expenses (
      expense_id, date, category, amount, description, vendor, receipt, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `,
  ).run(
    expenseId,
    payload.date || toISODate(),
    payload.category,
    Number(payload.amount || 0),
    payload.description,
    payload.vendor || 'N/A',
    payload.receipt || '',
  );
  return db.prepare('SELECT * FROM expenses WHERE expense_id = ?').get(expenseId);
}

function findExpenseById(expenseId) {
  const db = getDb();
  return db.prepare('SELECT * FROM expenses WHERE expense_id = ?').get(expenseId);
}

function approveExpense(expenseId) {
  const db = getDb();
  db.prepare(
    `
    UPDATE expenses
    SET status = 'approved', updated_at = CURRENT_TIMESTAMP
    WHERE expense_id = ?
    `,
  ).run(expenseId);
  return db.prepare('SELECT * FROM expenses WHERE expense_id = ?').get(expenseId);
}

function deleteExpense(expenseId) {
  const db = getDb();
  const res = db.prepare('DELETE FROM expenses WHERE expense_id = ?').run(expenseId);
  return res.changes > 0;
}

function getExpenseSummary() {
  const db = getDb();
  const today = toISODate();
  const todayTotal = db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE date = ?')
    .get(today).total;
  const monthTotal = db
    .prepare(
      `
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM expenses
      WHERE substr(date, 1, 7) = substr(?, 1, 7)
      `,
    )
    .get(today).total;
  const byCategory = db
    .prepare(
      `
      SELECT category, COALESCE(SUM(amount), 0) AS amount
      FROM expenses
      GROUP BY category
      ORDER BY category
      `,
    )
    .all();
  return {
    today: Number(todayTotal || 0),
    thisMonth: Number(monthTotal || 0),
    byCategory,
  };
}

module.exports = {
  listExpenses,
  createExpense,
  findExpenseById,
  approveExpense,
  deleteExpense,
  getExpenseSummary,
};
