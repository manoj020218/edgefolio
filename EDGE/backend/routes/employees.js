const express = require('express');
const {
  listEmployeesHandler,
  employeeSummaryHandler,
  getEmployeeHandler,
  createEmployeeHandler,
  updateEmployeeHandler,
  patchEmployeeHandler,
  deleteEmployeeHandler,
} = require('../controllers/employeeController');

const router = express.Router();

router.get('/', listEmployeesHandler);
router.get('/summary', employeeSummaryHandler);
router.get('/:id', getEmployeeHandler);
router.post('/', createEmployeeHandler);
router.put('/:id', updateEmployeeHandler);
router.patch('/:id', patchEmployeeHandler);
router.delete('/:id', deleteEmployeeHandler);

module.exports = router;
