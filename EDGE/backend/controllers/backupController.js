'use strict';
const {
  listBackups,
  getDataInfo,
  getCustomBackupPath,
  setCustomBackupPath,
  createLocalBackup,
  createCloudBackupRequest,
  restoreFromFile,
} = require('../services/backupService');
const { sendOk, createHttpError } = require('../utils/http');
const { serializeBackup } = require('../utils/serializers');

function listBackupsHandler(_req, res) {
  const rows = listBackups().map(serializeBackup);
  sendOk(res, rows, { count: rows.length });
}

function localBackupHandler(_req, res) {
  const backup = createLocalBackup();
  res.status(201);
  sendOk(res, backup);
}

function cloudBackupHandler(_req, res) {
  const backup = createCloudBackupRequest();
  res.status(202);
  sendOk(res, backup);
}

// GET /backup/data-info
function dataInfoHandler(_req, res) {
  sendOk(res, getDataInfo());
}

// GET /backup/custom-path
function getCustomPathHandler(_req, res) {
  sendOk(res, { path: getCustomBackupPath() });
}

// PUT /backup/custom-path  { path: "D:\\MyBackups" }
function setCustomPathHandler(req, res, next) {
  try {
    const { path: dirPath } = req.body || {};
    if (typeof dirPath !== 'string' || !dirPath.trim()) {
      throw createHttpError(400, 'path is required');
    }
    setCustomBackupPath(dirPath.trim());
    sendOk(res, { path: dirPath.trim(), message: 'Custom backup path saved.' });
  } catch (e) { next(e); }
}

// DELETE /backup/custom-path  (clear the custom path)
function clearCustomPathHandler(_req, res) {
  setCustomBackupPath('');
  sendOk(res, { path: null, message: 'Custom backup path cleared.' });
}

// POST /backup/restore  { filePath: "C:\\Users\\..." }
async function restoreHandler(req, res, next) {
  try {
    const { filePath } = req.body || {};
    if (!filePath) throw createHttpError(400, 'filePath is required');
    const result = restoreFromFile(filePath);
    sendOk(res, result);
  } catch (e) { next(e); }
}

module.exports = {
  listBackupsHandler,
  localBackupHandler,
  cloudBackupHandler,
  dataInfoHandler,
  getCustomPathHandler,
  setCustomPathHandler,
  clearCustomPathHandler,
  restoreHandler,
};
