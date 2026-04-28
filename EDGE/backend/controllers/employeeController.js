const {
  listEmployees,
  findEmployeeById,
  createEmployee,
  updateEmployee,
  patchEmployee,
  deleteEmployee,
  employeesSummary,
} = require('../models/employee');
const { ensureRequired } = require('../utils/validators');
const { sendOk, createHttpError } = require('../utils/http');
const { serializeEmployee } = require('../utils/serializers');

function listEmployeesHandler(_req, res) {
  const rows = listEmployees().map(serializeEmployee);
  sendOk(res, rows, { count: rows.length });
}

function getEmployeeHandler(req, res, next) {
  const employee = serializeEmployee(findEmployeeById(req.params.id));
  if (!employee) return next(createHttpError(404, 'Employee not found'));
  return sendOk(res, employee);
}

function createEmployeeHandler(req, res, next) {
  try {
    ensureRequired(['id', 'name', 'department', 'salary'], req.body || {});
    const created = serializeEmployee(createEmployee(req.body));
    res.status(201);
    return sendOk(res, created);
  } catch (error) {
    return next(error);
  }
}

function updateEmployeeHandler(req, res, next) {
  try {
    const updated = serializeEmployee(updateEmployee(req.params.id, req.body || {}));
    if (!updated) return next(createHttpError(404, 'Employee not found'));
    return sendOk(res, updated);
  } catch (error) {
    return next(error);
  }
}

function deleteEmployeeHandler(req, res, next) {
  const deleted = deleteEmployee(req.params.id);
  if (!deleted) return next(createHttpError(404, 'Employee not found'));
  return sendOk(res, { id: req.params.id, deleted: true });
}

function employeeSummaryHandler(_req, res) {
  sendOk(res, employeesSummary());
}

function patchEmployeeHandler(req, res, next) {
  try {
    const updated = serializeEmployee(patchEmployee(req.params.id, req.body || {}));
    if (!updated) return next(createHttpError(404, 'Employee not found'));
    return sendOk(res, updated);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listEmployeesHandler,
  getEmployeeHandler,
  createEmployeeHandler,
  updateEmployeeHandler,
  patchEmployeeHandler,
  deleteEmployeeHandler,
  employeeSummaryHandler,
};
