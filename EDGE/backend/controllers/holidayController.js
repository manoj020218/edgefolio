const { listHolidays, createHoliday, updateHoliday, deleteHoliday } = require('../models/holiday');
const { sendOk, createHttpError } = require('../utils/http');

function listHandler(req, res) {
  sendOk(res, listHolidays(req.query.year));
}

function createHandler(req, res, next) {
  try {
    if (!req.body?.date) throw createHttpError(400, 'date is required');
    if (!req.body?.name) throw createHttpError(400, 'name is required');
    const holiday = createHoliday(req.body);
    res.status(201);
    sendOk(res, holiday);
  } catch (e) { next(e); }
}

function updateHandler(req, res, next) {
  try {
    const holiday = updateHoliday(req.params.id, req.body);
    if (!holiday) throw createHttpError(404, 'Holiday not found');
    sendOk(res, holiday);
  } catch (e) { next(e); }
}

function deleteHandler(req, res, next) {
  try {
    const ok = deleteHoliday(req.params.id);
    if (!ok) throw createHttpError(404, 'Holiday not found');
    sendOk(res, { deleted: true });
  } catch (e) { next(e); }
}

module.exports = { listHandler, createHandler, updateHandler, deleteHandler };
