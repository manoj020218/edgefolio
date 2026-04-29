const express = require('express');
const {
  listLeavesHandler,
  listLeaveBalancesHandler,
  createLeaveHandler,
  updateLeaveStatusHandler,
} = require('../controllers/leaveController');
const { validateBody } = require('../middleware/validators');

const router = express.Router();

router.get('/', listLeavesHandler);
router.get('/balances', listLeaveBalancesHandler);
router.post(
  '/',
  validateBody(['employeeId', 'leaveType', 'fromDate', 'toDate']),
  createLeaveHandler,
);
router.patch('/:leaveId/status', validateBody(['status']), updateLeaveStatusHandler);

module.exports = router;
