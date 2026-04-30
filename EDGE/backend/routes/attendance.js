const express = require('express');
const {
  listAttendanceHandler,
  dailySummaryHandler,
  memberHistoryHandler,
  createEventHandler,
  createBatchHandler,
  apkSyncHandler,
  importHandler,
  getJenixSheetsHandler,
  parseJenixHandler,
} = require('../controllers/attendanceController');
const { validateBody } = require('../middleware/validators');

const router = express.Router();

router.get('/', listAttendanceHandler);
router.get('/summary', dailySummaryHandler);
router.get('/member/:id', memberHistoryHandler);
router.post('/event', validateBody(['memberId']), createEventHandler);
router.post('/batch', validateBody(['events']), createBatchHandler);
router.post('/apk-sync', validateBody(['records']), apkSyncHandler);
router.post('/import', validateBody(['records']), importHandler);
router.post('/jenix-sheets', validateBody(['fileData']), getJenixSheetsHandler);
router.post('/parse-jenix', validateBody(['fileData']), parseJenixHandler);

module.exports = router;
