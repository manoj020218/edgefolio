const express = require('express');
const {
  listPayrollRunsHandler,
  runPayrollHandler,
  payrollRunDetailsHandler,
  approveRunHandler,
  listPayslipsHandler,
  getPayslipHandler,
  previewPayrollHandler,
  previewPayrollRunHandler,
  listAdjustmentsHandler,
  createAdjustmentHandler,
  deleteAdjustmentHandler,
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
router.get('/preview-run',       previewPayrollRunHandler);   // ?month=YYYY-MM — real per-employee preview
router.get('/adjustments',       listAdjustmentsHandler);      // ?month=YYYY-MM
router.post('/adjustments',      validateBody(['employeeId', 'monthKey', 'kind', 'label', 'amount']), createAdjustmentHandler);
router.delete('/adjustments/:id', deleteAdjustmentHandler);

// Disputes
router.get('/disputes',                          listDisputesHandler);       // ?status=open
router.get('/disputes/count',                    disputeCountHandler);
router.post('/slip/:payslipId/dispute',          validateBody(['reason', 'employeeId']), raiseDisputeHandler);
router.patch('/disputes/:disputeId/resolve',     validateBody(['status']), resolveDisputeHandler);

module.exports = router;
