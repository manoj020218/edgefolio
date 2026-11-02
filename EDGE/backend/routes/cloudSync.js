'use strict';
// EDGE ↔ EdgeFolio Cloud settings: /api/v1/cloud-sync/* (desktop admin only).
const express = require('express');
const { requireRole } = require('../middleware/auth');
const cloud = require('../services/cloudSyncService');
const { sendOk } = require('../utils/http');

const router = express.Router();
const adminOnly = requireRole('admin', 'hr-admin');
// Cloud errors → desktop status codes. A 401 *from the cloud* (sync key rejected) must not reach
// the desktop as 401, or the frontend would treat it as its own session expiring.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch((err) => {
  if (err.offline) err.statusCode = 503;
  else if (err.status === 401 || (err.status && err.status >= 500)) err.statusCode = 502;
  else if (err.status) err.statusCode = err.status;   // 400, 409 ALREADY_LINKED, …
  next(err);
});

router.get('/status', (req, res) => sendOk(res, cloud.getStatus()));
router.post('/connect', adminOnly, ah(async (req, res) => sendOk(res, await cloud.connect({ baseUrlOverride: req.body?.baseUrl }))));
router.post('/disconnect', adminOnly, (req, res) => sendOk(res, cloud.disconnect()));
router.post('/sync-now', adminOnly, ah(async (req, res) => { const result = await cloud.runSync('manual'); sendOk(res, { result, status: cloud.getStatus() }); }));
router.put('/offices', adminOnly, (req, res) => sendOk(res, cloud.saveOffices(req.body?.offices, req.body?.enforceGeofence)));

module.exports = router;
