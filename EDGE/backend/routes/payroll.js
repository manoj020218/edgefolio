const express = require('express');
const {
  listPayrollRunsHandler,
  runPayrollHandler,
  payrollRunDetailsHandler,
  approveRunHandler,
  listPayslipsHandler,
  getPayslipHandler,
  previewPayrollHandler,
} = require('../controllers/payrollController');
const { validateBody } = require('../middleware/validators');

const router = express.Router();

router.get('/runs', listPayrollRunsHandler);
router.post('/run', validateBody(['monthKey']), runPayrollHandler);
router.get('/run/:runId', payrollRunDetailsHandler);
router.post('/approve/:runId', approveRunHandler);
router.get('/payslips', listPayslipsHandler);
router.get('/slip/:payslipId', getPayslipHandler);
router.post('/preview', previewPayrollHandler);

module.exports = router;
