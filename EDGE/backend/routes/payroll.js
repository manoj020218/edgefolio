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
  listPoliciesHandler,
  getPolicyHistoryHandler,
  createPolicyHandler,
  updatePolicyHandler,
  deletePolicyHandler,
  listPolicyAssignmentsHandler,
  setPolicyAssignmentHandler,
  deletePolicyAssignmentHandler,
  policyScopeOptionsHandler,
  listStructuresHandler,
  getStructureHistoryHandler,
  createStructureHandler,
  updateStructureHandler,
  deleteStructureHandler,
  listStructureAssignmentsHandler,
  setStructureAssignmentHandler,
  deleteStructureAssignmentHandler,
  structureScopeOptionsHandler,
  estimateStructureHandler,
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

// Salary policies — versioned, per-designation/department/employee pay rules
router.get('/salary-policies',                          listPoliciesHandler);          // latest version of each group
router.get('/salary-policies/scope-options',            policyScopeOptionsHandler);    // distinct departments/designations
router.get('/salary-policies/:groupId/history',          getPolicyHistoryHandler);
router.post('/salary-policies',                          validateBody(['name']), createPolicyHandler);
router.patch('/salary-policies/:groupId',                updatePolicyHandler);          // versions forward, never in place
router.delete('/salary-policies/:groupId',                deletePolicyHandler);
router.get('/salary-policy-assignments',                  listPolicyAssignmentsHandler);
router.post('/salary-policy-assignments',                 validateBody(['scope', 'scopeValue', 'policyGroupId']), setPolicyAssignmentHandler);
router.delete('/salary-policy-assignments/:scope/:scopeValue', deletePolicyAssignmentHandler);

// Salary structures — versioned, designation-based pay composition (DA/HRA/PF/ESI/etc.)
router.get('/salary-structures',                          listStructuresHandler);          // latest version of each group, components embedded
router.get('/salary-structures/scope-options',            structureScopeOptionsHandler);   // distinct departments/designations
router.get('/salary-structures/:groupId/history',          getStructureHistoryHandler);
router.post('/salary-structures',                          validateBody(['name']), createStructureHandler);
router.patch('/salary-structures/:groupId',                updateStructureHandler);         // versions forward, never in place
router.delete('/salary-structures/:groupId',                deleteStructureHandler);
router.get('/salary-structure-assignments',                  listStructureAssignmentsHandler);
router.post('/salary-structure-assignments',                 validateBody(['scope', 'scopeValue', 'structureGroupId']), setStructureAssignmentHandler);
router.delete('/salary-structure-assignments/:scope/:scopeValue', deleteStructureAssignmentHandler);
router.post('/estimate-structure',                          estimateStructureHandler);   // { salary, department, designation, salaryStructureGroupId } -> gross/net preview

module.exports = router;
