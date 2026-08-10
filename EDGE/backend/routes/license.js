'use strict';
const express = require('express');
const { sendOk } = require('../utils/http');
const {
  getLicenseState,
  activate,
  signupTrial,
  heartbeat,
  getCachedMachineId,
  getAnnouncement,
} = require('../services/licenseService');

const router = express.Router();

// GET /license/announcement — public. Delivered via the daily license heartbeat; this is
// the notification channel for "new version available" / urgent notices (the GitHub
// Releases auto-updater is disabled — see electron/updater.js for why).
router.get('/announcement', (_req, res) => {
  return sendOk(res, { announcement: getAnnouncement() });
});

// GET /license/status — public (no auth required, called before login)
router.get('/status', (_req, res) => {
  const { state, claims, machineId, daysLeft, error } = getLicenseState();
  return sendOk(res, {
    state,
    machineId,
    daysLeft: daysLeft ?? null,
    licenseKey: claims?.licenseKey
      ? `${claims.licenseKey.slice(0, 6)}****${claims.licenseKey.slice(-4)}`
      : null,
    plan: claims?.plan || null,
    expiresAt: claims?.expiresAt || null,
    status: claims?.status || null,
    error: error || null,
  });
});

// POST /license/activate — public
router.post('/activate', async (req, res) => {
  const { licenseKey } = req.body || {};
  if (!licenseKey || typeof licenseKey !== 'string' || !licenseKey.trim()) {
    return res.status(400).json({ ok: false, error: 'licenseKey is required' });
  }
  const result = await activate(licenseKey.trim().toUpperCase());
  if (!result.ok) {
    const statusCode = result.status === 404 ? 404
      : result.status === 409 ? 409
      : result.status === 403 ? 403
      : 400;
    return res.status(statusCode).json({ ok: false, error: result.error });
  }
  const { state, claims, daysLeft } = getLicenseState();
  return sendOk(res, { state, daysLeft, plan: claims?.plan, expiresAt: claims?.expiresAt });
});

// POST /license/signup — public
router.post('/signup', async (req, res) => {
  const { companyName, contactName, phone, email } = req.body || {};
  if (!companyName || !contactName || !phone || !email) {
    return res.status(400).json({ ok: false, error: 'companyName, contactName, phone and email are required' });
  }
  const result = await signupTrial({ companyName, contactName, phone, email });
  if (!result.ok) {
    const statusCode = result.status >= 400 ? result.status : 400;
    return res.status(statusCode).json({ ok: false, error: result.error });
  }
  return res.status(201).json({
    ok: true,
    data: {
      licenseKey: result.licenseKey,
      expiresAt: result.expiresAt,
      maxEmployees: result.maxEmployees,
      state: result.state?.state || 'valid',
    },
  });
});

// POST /license/refresh — requires auth (called from SettingsPage)
// This endpoint is mounted AFTER requireAuth in server.js, but we need it public-reachable too.
// It is placed here for consistency; server.js mounts this router BEFORE requireAuth so
// refresh also works unauthenticated if needed (heartbeat has its own guard).
router.post('/refresh', async (req, res) => {
  const result = await heartbeat();
  const { state, claims, daysLeft } = getLicenseState();
  return sendOk(res, {
    heartbeatOk: result.ok,
    state,
    daysLeft: daysLeft ?? null,
    plan: claims?.plan || null,
    expiresAt: claims?.expiresAt || null,
    error: result.ok ? null : result.error,
  });
});

module.exports = router;
