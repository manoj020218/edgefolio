'use strict';
const {
  listEmployees,
  findEmployeeById,
  createEmployee,
  updateEmployee,
  patchEmployee,
  deleteEmployee,
  employeesSummary,
} = require('../models/employee');
const {
  listFields,
  createField,
  updateField,
  deleteField,
  getEmployeeValues,
  setEmployeeValues,
} = require('../models/customField');
const { ensureRequired } = require('../utils/validators');
const { sendOk, createHttpError } = require('../utils/http');
const { serializeEmployee } = require('../utils/serializers');
const { getLicenseState, getActiveEmployeeCount } = require('../services/licenseService');

// ── Employee CRUD ─────────────────────────────────────────────────────────────

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
    // Employee limit gate
    const { claims } = getLicenseState();
    if (claims?.plan?.maxEmployees) {
      const activeCount = getActiveEmployeeCount();
      const maxEmployees = Number(claims.plan.maxEmployees);
      if (activeCount >= maxEmployees) {
        return res.status(403).json({
          ok: false,
          code: 'LICENSE_EMPLOYEE_LIMIT',
          error: `Employee limit (${maxEmployees}) reached. Upgrade your plan.`,
        });
      }
    }
    ensureRequired(['name', 'department', 'salary'], req.body || {});
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

// ── Custom Field Definitions ──────────────────────────────────────────────────

function listFieldsHandler(_req, res) {
  sendOk(res, listFields());
}

function createFieldHandler(req, res, next) {
  try {
    ensureRequired(['fieldName'], req.body || {});
    const field = createField(req.body);
    res.status(201);
    return sendOk(res, field);
  } catch (error) {
    return next(error);
  }
}

function updateFieldHandler(req, res, next) {
  try {
    const field = updateField(req.params.fieldId, req.body || {});
    if (!field) return next(createHttpError(404, 'Field not found'));
    return sendOk(res, field);
  } catch (error) {
    return next(error);
  }
}

function deleteFieldHandler(req, res, next) {
  const deleted = deleteField(req.params.fieldId);
  if (!deleted) return next(createHttpError(404, 'Field not found'));
  return sendOk(res, { fieldId: req.params.fieldId, deleted: true });
}

// ── Employee Custom Values ────────────────────────────────────────────────────

function getEmployeeValuesHandler(req, res, next) {
  try {
    sendOk(res, getEmployeeValues(req.params.id));
  } catch (error) {
    return next(error);
  }
}

function setEmployeeValuesHandler(req, res, next) {
  try {
    const { values } = req.body || {};
    if (!Array.isArray(values)) return next(createHttpError(400, 'values array required'));
    sendOk(res, setEmployeeValues(req.params.id, values));
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
  listFieldsHandler,
  createFieldHandler,
  updateFieldHandler,
  deleteFieldHandler,
  getEmployeeValuesHandler,
  setEmployeeValuesHandler,
};
