'use strict';
const { listEarnings, createEarning, updateEarning, deleteEarning } = require('../models/earningsConfigModel');
const { sendOk, createHttpError } = require('../utils/http');

function listEarningsHandler(_req, res) {
  sendOk(res, listEarnings());
}

function createEarningHandler(req, res, next) {
  try {
    const { name, percentage, type } = req.body || {};
    if (!name?.trim()) return next(createHttpError(400, 'name is required'));
    const row = createEarning({ name, percentage, type });
    res.status(201);
    return sendOk(res, row);
  } catch (e) { return next(e); }
}

function updateEarningHandler(req, res, next) {
  try {
    const { name, percentage, type } = req.body || {};
    if (!name?.trim()) return next(createHttpError(400, 'name is required'));
    const row = updateEarning(req.params.id, { name, percentage, type });
    if (!row) return next(createHttpError(404, 'Earning not found'));
    return sendOk(res, row);
  } catch (e) { return next(e); }
}

function deleteEarningHandler(req, res, next) {
  try {
    const ok = deleteEarning(req.params.id);
    if (!ok) return next(createHttpError(404, 'Earning not found'));
    return sendOk(res, { deleted: true });
  } catch (e) { return next(e); }
}

module.exports = { listEarningsHandler, createEarningHandler, updateEarningHandler, deleteEarningHandler };
