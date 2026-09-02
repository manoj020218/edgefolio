const express = require('express');
const {
  loginHandler,
  forgotPasswordHandler,
  listResetRequestsHandler,
  approveResetRequestHandler,
  changePasswordHandler,
  statusHandler,
  setupHandler,
} = require('../controllers/authController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Public — no token required
router.get('/status',  statusHandler);
router.post('/setup',  setupHandler);
router.post('/login',  loginHandler);
router.post('/forgot-password', forgotPasswordHandler);

// Protected
router.post('/change-password', requireAuth, changePasswordHandler);
// 'admin' = desktop EDGE admin, 'hr-admin' = APK role — either can manage resets.
// Previously these had no role check at all (any authenticated user, including a
// plain 'employee' APK login, could approve resets) — closing that here since the
// APK now actually calls this.
router.get('/reset-requests',               requireAuth, requireRole('admin', 'hr-admin'), listResetRequestsHandler);
router.post('/reset-requests/:id/approve',  requireAuth, requireRole('admin', 'hr-admin'), approveResetRequestHandler);

module.exports = router;
