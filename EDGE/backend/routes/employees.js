const express = require('express');
const {
  listEmployeesHandler,
  employeeSummaryHandler,
  getEmployeeHandler,
  createEmployeeHandler,
  updateEmployeeHandler,
  patchEmployeeHandler,
  deleteEmployeeHandler,
  listFieldsHandler,
  createFieldHandler,
  updateFieldHandler,
  deleteFieldHandler,
  getEmployeeValuesHandler,
  setEmployeeValuesHandler,
} = require('../controllers/employeeController');

const router = express.Router();

// Custom field definitions
router.get('/fields', listFieldsHandler);
router.post('/fields', createFieldHandler);
router.put('/fields/:fieldId', updateFieldHandler);
router.delete('/fields/:fieldId', deleteFieldHandler);

// Employee CRUD
router.get('/', listEmployeesHandler);
router.get('/summary', employeeSummaryHandler);
router.get('/:id', getEmployeeHandler);
router.post('/', createEmployeeHandler);
router.put('/:id', updateEmployeeHandler);
router.patch('/:id', patchEmployeeHandler);
router.delete('/:id', deleteEmployeeHandler);

// Per-employee custom values
router.get('/:id/custom-values', getEmployeeValuesHandler);
router.post('/:id/custom-values', setEmployeeValuesHandler);

module.exports = router;
