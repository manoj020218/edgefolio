const {
  listExpenses,
  createExpense,
  findExpenseById,
  approveExpense,
  deleteExpense,
  getExpenseSummary,
} = require('../models/cashbook');
const { ensureRequired } = require('../utils/validators');
const { sendOk, createHttpError } = require('../utils/http');
const { serializeExpense } = require('../utils/serializers');

function listExpensesHandler(req, res) {
  const rows = listExpenses(req.query.category).map(serializeExpense);
  sendOk(res, rows, { count: rows.length });
}

function expenseSummaryHandler(_req, res) {
  sendOk(res, getExpenseSummary());
}

function createExpenseHandler(req, res, next) {
  try {
    ensureRequired(['category', 'amount', 'description'], req.body || {});
    const expense = serializeExpense(createExpense(req.body || {}));
    res.status(201);
    return sendOk(res, expense);
  } catch (error) {
    return next(error);
  }
}

function approveExpenseHandler(req, res, next) {
  const existing = findExpenseById(req.params.expenseId);
  if (!existing) return next(createHttpError(404, 'Expense not found'));
  const row = serializeExpense(approveExpense(req.params.expenseId));
  return sendOk(res, row);
}

function deleteExpenseHandler(req, res, next) {
  const deleted = deleteExpense(req.params.expenseId);
  if (!deleted) return next(createHttpError(404, 'Expense not found'));
  return sendOk(res, { expenseId: req.params.expenseId, deleted: true });
}

module.exports = {
  listExpensesHandler,
  expenseSummaryHandler,
  createExpenseHandler,
  approveExpenseHandler,
  deleteExpenseHandler,
};
