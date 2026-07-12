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
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Public — no token required
router.get('/status',  statusHandler);
router.post('/setup',  setupHandler);
router.post('/login',  loginHandler);
router.post('/forgot-password', forgotPasswordHandler);

// Protected
router.post('/change-password',             requireAuth, changePasswordHandler);
router.get('/reset-requests',               requireAuth, listResetRequestsHandler);
router.post('/reset-requests/:id/approve',  requireAuth, approveResetRequestHandler);

module.exports = router;
