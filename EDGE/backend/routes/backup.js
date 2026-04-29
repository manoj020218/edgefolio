'use strict';
const express = require('express');
const {
  listBackupsHandler,
  localBackupHandler,
  cloudBackupHandler,
  dataInfoHandler,
  getCustomPathHandler,
  setCustomPathHandler,
  clearCustomPathHandler,
  restoreHandler,
} = require('../controllers/backupController');

const router = express.Router();

router.get('/',             listBackupsHandler);
router.post('/local',       localBackupHandler);
router.post('/gdrive',      cloudBackupHandler);
router.get('/data-info',    dataInfoHandler);
router.get('/custom-path',  getCustomPathHandler);
router.put('/custom-path',  setCustomPathHandler);
router.delete('/custom-path', clearCustomPathHandler);
router.post('/restore',     restoreHandler);

module.exports = router;
