const express = require('express');
const {
  listAttendanceHandler,
  dailySummaryHandler,
  memberHistoryHandler,
  createEventHandler,
  createBatchHandler,
  apkSyncHandler,
} = require('../controllers/attendanceController');
const { validateBody } = require('../middleware/validators');

const router = express.Router();

router.get('/', listAttendanceHandler);
router.get('/summary', dailySummaryHandler);
router.get('/member/:id', memberHistoryHandler);
router.post('/event', validateBody(['memberId']), createEventHandler);
router.post('/batch', validateBody(['events']), createBatchHandler);
router.post('/apk-sync', validateBody(['records']), apkSyncHandler);

module.exports = router;
