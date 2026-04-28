const express = require('express');
const {
  loginHandler,
  forgotPasswordHandler,
  listResetRequestsHandler,
  approveResetRequestHandler,
  changePasswordHandler,
} = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.post('/login', loginHandler);
router.post('/forgot-password', forgotPasswordHandler);
router.post('/change-password', requireAuth, changePasswordHandler);
router.get('/reset-requests', requireAuth, listResetRequestsHandler);
router.post('/reset-requests/:id/approve', requireAuth, approveResetRequestHandler);
module.exports = router;
