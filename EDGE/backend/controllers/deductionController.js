const { listDeductions, createDeduction, updateDeduction, deleteDeduction } = require('../models/deductionModel');
const { sendOk, createHttpError } = require('../utils/http');

function listHandler(req, res) {
  sendOk(res, listDeductions());
}

function createHandler(req, res, next) {
  try {
    if (!req.body?.name) throw createHttpError(400, 'name is required');
    const ded = createDeduction(req.body);
    res.status(201);
    sendOk(res, ded);
  } catch (e) { next(e); }
}

function updateHandler(req, res, next) {
  try {
    const ded = updateDeduction(req.params.id, req.body);
    if (!ded) throw createHttpError(404, 'Deduction not found');
    sendOk(res, ded);
  } catch (e) { next(e); }
}

function deleteHandler(req, res, next) {
  try {
    const ok = deleteDeduction(req.params.id);
    if (!ok) throw createHttpError(404, 'Deduction not found');
    sendOk(res, { deleted: true });
  } catch (e) { next(e); }
}

module.exports = { listHandler, createHandler, updateHandler, deleteHandler };
