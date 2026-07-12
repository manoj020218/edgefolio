const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { requireLicense } = require('../middleware/license');
const {
  getConfigHandler,
  getAnalyticsHandler,
  loginCheckHandler,
  apkLoginHandler,
  registerFcmTokenHandler,
  getTodayStatusHandler,
  getWorkAssignmentsHandler,
  createWorkAssignmentHandler,
  deleteWorkAssignmentHandler,
  mobileAttendanceHandler,
  batchSyncHandler,
  liveFeedHandler,
  getAlertSubscriptionsHandler,
  createAlertSubscriptionHandler,
  deleteAlertSubscriptionHandler,
  getOfficesHandler,
  getEmbeddingHandler,
  saveEmbeddingHandler,
  broadcastHandler,
  getEmployeesHandler,
  patchEmployeeHandler,
} = require('../controllers/apkController');

const router = express.Router();

// ── No auth required ─────────────────────────────────────────────────────────
router.get('/config',       getConfigHandler);
router.get('/login-check',  loginCheckHandler);
router.get('/offices',      getOfficesHandler);
router.post('/auth/login',  apkLoginHandler);

// ── JWT required for everything below ────────────────────────────────────────
router.use(requireAuth);

// ── License gate (after auth, mirrors server.js enforcement for APK routes) ──
router.use(requireLicense);

// FCM token registration (any authenticated APK user)
router.patch('/fcm-token', registerFcmTokenHandler);

// Employee: check own work type for today
router.get('/today-status', getTodayStatusHandler);

// Work assignment management (HR-Admin writes, Owner reads)
router.get('/work-assignments',        requireRole('hr-admin', 'owner'), getWorkAssignmentsHandler);
router.post('/work-assignments',       requireRole('hr-admin'),          createWorkAssignmentHandler);
router.delete('/work-assignments/:id', requireRole('hr-admin'),          deleteWorkAssignmentHandler);

// Mobile attendance (any authenticated employee)
router.post('/attendance',             mobileAttendanceHandler);
router.post('/attendance/batch-sync',  batchSyncHandler);

// Live feed — admin and owner only
router.get('/live-feed', requireRole('hr-admin', 'owner'), liveFeedHandler);

// Alert subscriptions — admin and owner only
router.get('/alert-subscriptions',        requireRole('hr-admin', 'owner'), getAlertSubscriptionsHandler);
router.post('/alert-subscriptions',       requireRole('hr-admin', 'owner'), createAlertSubscriptionHandler);
router.delete('/alert-subscriptions/:id', requireRole('hr-admin', 'owner'), deleteAlertSubscriptionHandler);

// Face embedding download (employee) and upload (hr-admin after generating via TFLite)
router.get('/faces/:empId/embedding',  getEmbeddingHandler);
router.post('/faces/:empId/embedding', requireRole('hr-admin'), saveEmbeddingHandler);

// Broadcast announcement + FCM to all employees (hr-admin / owner)
router.post('/broadcast', requireRole('hr-admin', 'owner'), broadcastHandler);

// Analytics — owner and hr-admin
router.get('/analytics', requireRole('hr-admin', 'owner'), getAnalyticsHandler);

// Employee management (hr-admin only)
router.get('/employees',       requireRole('hr-admin', 'owner'), getEmployeesHandler);
router.patch('/employees/:id', requireRole('hr-admin'),          patchEmployeeHandler);

module.exports = router;
