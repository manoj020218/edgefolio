const express = require('express');
const {
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
} = require('../controllers/payrollController');
const { validateBody } = require('../middleware/validators');

const router = express.Router();

router.get('/runs',              listPayrollRunsHandler);
router.post('/run',              validateBody(['monthKey']), runPayrollHandler);
router.get('/run/:runId',        payrollRunDetailsHandler);
router.post('/approve/:runId',   approveRunHandler);
router.get('/payslips',          listPayslipsHandler);
router.get('/slip/:payslipId',   getPayslipHandler);
router.post('/preview',          previewPayrollHandler);

// Disputes
router.get('/disputes',                          listDisputesHandler);       // ?status=open
router.get('/disputes/count',                    disputeCountHandler);
router.post('/slip/:payslipId/dispute',          validateBody(['reason', 'employeeId']), raiseDisputeHandler);
router.patch('/disputes/:disputeId/resolve',     validateBody(['status']), resolveDisputeHandler);

module.exports = router;
