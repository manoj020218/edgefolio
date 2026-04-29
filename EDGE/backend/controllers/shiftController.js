const { listShifts, createShift, updateShift, deleteShift } = require('../models/shift');
const { sendOk, createHttpError } = require('../utils/http');

function listHandler(req, res) {
  sendOk(res, listShifts());
}

function createHandler(req, res, next) {
  try {
    if (!req.body?.shiftName) throw createHttpError(400, 'shiftName is required');
    if (!req.body?.startTime) throw createHttpError(400, 'startTime is required');
    if (!req.body?.endTime)   throw createHttpError(400, 'endTime is required');
    const shift = createShift(req.body);
    res.status(201);
    sendOk(res, shift);
  } catch (e) { next(e); }
}

function updateHandler(req, res, next) {
  try {
    const shift = updateShift(req.params.id, req.body);
    if (!shift) throw createHttpError(404, 'Shift not found');
    sendOk(res, shift);
  } catch (e) { next(e); }
}

function deleteHandler(req, res, next) {
  try {
    const ok = deleteShift(req.params.id);
    if (!ok) throw createHttpError(404, 'Shift not found');
    sendOk(res, { deleted: true });
  } catch (e) { next(e); }
}

module.exports = { listHandler, createHandler, updateHandler, deleteHandler };
