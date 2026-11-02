'use strict';
/**
 * /api/v1/auth/* — the app's ChangePasswordPage posts here after a first login with a temporary
 * password (passwordMustChange). Mirrors EDGE authController.changePasswordHandler.
 * Forgot-password / HR reset approval come in a later phase.
 */
const express = require('express');
const { forOrg } = require('../tenancy');
const { requireAuth } = require('../auth');
const { sendOk, httpError } = require('../lib/http');
const { hashSecret, verifySecret } = require('../lib/password');

function authRouter(config) {
  const r = express.Router();

  r.post('/change-password', requireAuth(config), async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body || {};
      if (!currentPassword || !newPassword) throw httpError(400, 'currentPassword and newPassword are required');
      if (String(newPassword).length < 6) throw httpError(400, 'New password must be at least 6 characters');
      const db = forOrg(req.user.orgId);
      const emp = await db.Employee.findOne({ empId: req.user.empId }).lean();
      if (!emp) throw httpError(404, 'User not found');
      if (!verifySecret(String(currentPassword), emp.tempPasswordHash || emp.passwordHash)) {
        throw httpError(401, 'Current password is incorrect');
      }
      await db.Employee.updateOne(
        { empId: req.user.empId },
        { $set: { passwordHash: hashSecret(newPassword), tempPasswordHash: null, passwordMustChange: false } },
      );
      await db.AuditLog.create({ actor: req.user.empId, action: 'password-changed' });
      sendOk(res, { message: 'Password changed successfully' });
    } catch (e) { next(e); }
  });

  return r;
}

module.exports = { authRouter };
