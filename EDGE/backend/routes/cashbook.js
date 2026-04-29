const express = require('express');
const {
  listExpensesHandler,
  expenseSummaryHandler,
  createExpenseHandler,
  approveExpenseHandler,
  deleteExpenseHandler,
} = require('../controllers/cashbookController');
const { validateBody } = require('../middleware/validators');

const router = express.Router();

router.get('/', listExpensesHandler);
router.get('/summary', expenseSummaryHandler);
router.post('/', validateBody(['category', 'amount', 'description']), createExpenseHandler);
router.patch('/:expenseId/approve', approveExpenseHandler);
router.delete('/:expenseId', deleteExpenseHandler);

module.exports = router;
