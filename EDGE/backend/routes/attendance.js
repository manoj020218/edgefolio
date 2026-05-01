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
  machineImportAlogHandler,
  machineImportJenixHandler,
  stagingBatchesHandler,
  stagingUnmappedHandler,
  stagingGetMappingsHandler,
  stagingSaveMappingsHandler,
  stagingDeleteMappingsHandler,
  stagingCommitHandler,
  stagingSummaryHandler,
  stagingRecordsHandler,
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

// ─── Machine import routes (staging-based, FK-safe) ───────────────────────
// Step 1: Upload machine file → goes to staging (no FK error, all punches stored)
router.post('/machine-import/alog',  validateBody(['fileData']), machineImportAlogHandler);
router.post('/machine-import/jenix', validateBody(['fileData']), machineImportJenixHandler);

// Step 2: See what came in
router.get('/machine-import/batches',       stagingBatchesHandler);
router.get('/machine-import/summary',       stagingSummaryHandler);   // ?batchId=
router.get('/machine-import/records',       stagingRecordsHandler);   // ?batchId=&machineEmpId=&status=&page=&limit=
router.get('/machine-import/unmapped',      stagingUnmappedHandler);  // machine IDs with no mapping yet

// Step 3: Map machine IDs to employees (user's choice)
router.get('/machine-import/mappings',      stagingGetMappingsHandler);
router.post('/machine-import/mappings',     validateBody(['mappings']), stagingSaveMappingsHandler);
router.delete('/machine-import/mappings',   validateBody(['machineEmpIds']), stagingDeleteMappingsHandler);

// Step 4: Commit mapped records to attendance_records
router.post('/machine-import/commit',       stagingCommitHandler);    // body: { batchId? }

module.exports = router;
