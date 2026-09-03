const { listDesignations, createDesignation, updateDesignation, deleteDesignation } = require('../models/designation');
const { sendOk, createHttpError } = require('../utils/http');

function listHandler(req, res) {
  sendOk(res, listDesignations());
}

function createHandler(req, res, next) {
  try {
    if (!req.body?.name) throw createHttpError(400, 'name is required');
    const designation = createDesignation(req.body);
    res.status(201);
    sendOk(res, designation);
  } catch (e) { next(e); }
}

function updateHandler(req, res, next) {
  try {
    const designation = updateDesignation(req.params.id, req.body);
    if (!designation) throw createHttpError(404, 'Designation not found');
    sendOk(res, designation);
  } catch (e) { next(e); }
}

function deleteHandler(req, res, next) {
  try {
    const ok = deleteDesignation(req.params.id);
    if (!ok) throw createHttpError(404, 'Designation not found');
    sendOk(res, { deleted: true });
  } catch (e) { next(e); }
}

module.exports = { listHandler, createHandler, updateHandler, deleteHandler };
