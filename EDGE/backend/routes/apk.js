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
  mobileCheckoutHandler,
  batchSyncHandler,
  liveFeedHandler,
  getAlertSubscriptionsHandler,
  createAlertSubscriptionHandler,
  deleteAlertSubscriptionHandler,
  getOfficesHandler,
  getEmbeddingHandler,
  selfEnrollFaceHandler,
  getMyFaceEnrollStatusHandler,
  broadcastHandler,
  getEmployeesHandler,
  patchEmployeeHandler,
  getProfileHandler,
  updateProfileHandler,
  listMyPayslipsHandler,
  getMyAttendanceHistoryHandler,
  getMyLeaveBalanceHandler,
} = require('../controllers/apkController');
const requestsRoutes = require('./requests');
const visitsRoutes = require('./visits');
const supportRoutes = require('./support');
const documentsRoutes = require('./documents');

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
router.post('/attendance/checkout',    mobileCheckoutHandler);
router.post('/attendance/batch-sync',  batchSyncHandler);

// Live feed — admin and owner only
router.get('/live-feed', requireRole('hr-admin', 'owner'), liveFeedHandler);

// Alert subscriptions — admin and owner only
router.get('/alert-subscriptions',        requireRole('hr-admin', 'owner'), getAlertSubscriptionsHandler);
router.post('/alert-subscriptions',       requireRole('hr-admin', 'owner'), createAlertSubscriptionHandler);
router.delete('/alert-subscriptions/:id', requireRole('hr-admin', 'owner'), deleteAlertSubscriptionHandler);

// Face embedding: own-empId reference fetch (used during attendance capture to
// compare a live capture against), and self-enroll — the employee's own phone
// generates the embedding on-device via FaceLiveness.capture() and uploads only
// that (never raw photos). No hr-admin gate: this is deliberately self-serve,
// per client direction (see apkController.js's selfEnrollFaceHandler comment).
router.get('/faces/:empId/embedding', getEmbeddingHandler);
router.post('/faces/self-enroll',     selfEnrollFaceHandler);
router.get('/faces/self-enroll',      getMyFaceEnrollStatusHandler);

// Broadcast announcement + FCM to all employees (hr-admin / owner)
router.post('/broadcast', requireRole('hr-admin', 'owner'), broadcastHandler);

// Analytics — owner and hr-admin
router.get('/analytics', requireRole('hr-admin', 'owner'), getAnalyticsHandler);

// Employee management (hr-admin only)
router.get('/employees',       requireRole('hr-admin', 'owner'), getEmployeesHandler);
router.patch('/employees/:id', requireRole('hr-admin'),          patchEmployeeHandler);

// Detailed Profile (any authenticated employee, own record only)
router.get('/profile',   getProfileHandler);
router.patch('/profile', updateProfileHandler);

// Pay Settings screen support (own data only — see handler comments for why these
// don't just proxy to the desktop /payroll and /attendance endpoints)
router.get('/payslips',           listMyPayslipsHandler);
router.get('/attendance-history', getMyAttendanceHistoryHandler);
router.get('/leave-balance',      getMyLeaveBalanceHandler);

// Unified Requests hub, Work/Visits, Help & Support, Documents — each is its own
// router; all inherit requireAuth + requireLicense from above.
router.use('/requests', requestsRoutes);
router.use('/visits', visitsRoutes);
router.use('/support-tickets', supportRoutes);
router.use('/documents', documentsRoutes);

module.exports = router;
