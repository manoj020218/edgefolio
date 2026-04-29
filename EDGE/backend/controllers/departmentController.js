const { listDepartments, createDepartment, updateDepartment, deleteDepartment } = require('../models/department');
const { sendOk, createHttpError } = require('../utils/http');

function listHandler(req, res) {
  sendOk(res, listDepartments());
}

function createHandler(req, res, next) {
  try {
    if (!req.body?.name) throw createHttpError(400, 'name is required');
    const dept = createDepartment(req.body);
    res.status(201);
    sendOk(res, dept);
  } catch (e) { next(e); }
}

function updateHandler(req, res, next) {
  try {
    const dept = updateDepartment(req.params.id, req.body);
    if (!dept) throw createHttpError(404, 'Department not found');
    sendOk(res, dept);
  } catch (e) { next(e); }
}

function deleteHandler(req, res, next) {
  try {
    const ok = deleteDepartment(req.params.id);
    if (!ok) throw createHttpError(404, 'Department not found');
    sendOk(res, { deleted: true });
  } catch (e) { next(e); }
}

module.exports = { listHandler, createHandler, updateHandler, deleteHandler };
