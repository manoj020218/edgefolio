'use strict';
const { API_PREFIX } = require('../config/app');
const { getLicenseState } = require('../services/licenseService');

/**
 * requireLicense — license gate middleware.
 *
 * Applied after requireAuth. Blocks requests based on license state:
 *   - unlicensed / blocked  → 403 LICENSE_REQUIRED (always)
 *   - readonly              → 403 LICENSE_READONLY for mutating methods
 *                             except requests whose path starts with /backup
 *   - valid / expiring / grace → allowed
 *
 * When mounted at server root (e.g. app.use(requireLicense)):
 *   req.path is the full path like /api/v1/backup/local
 *
 * When mounted inside a sub-router (e.g. router.use(requireLicense)):
 *   req.path is relative to the mount point, like /attendance
 *   — the APK router has no /backup routes so the isBackup check is moot,
 *     but we handle both forms defensively.
 */
function requireLicense(req, res, next) {
  const { state } = getLicenseState();

  // Unlicensed or blocked → block everything
  if (state === 'unlicensed' || state === 'blocked') {
    return res.status(403).json({
      ok: false,
      code: 'LICENSE_REQUIRED',
      error: state === 'blocked'
        ? 'This license has been blocked. Contact support.'
        : 'License required. Please activate your EDGEFOLIO license.',
    });
  }

  // Readonly (past expiry + grace) → block mutating methods except /backup/*
  if (state === 'readonly') {
    const method = req.method.toUpperCase();
    const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    // Accept full path (server root context) or relative path (sub-router context)
    const isBackup = req.path.startsWith(`${API_PREFIX}/backup`) || req.path.startsWith('/backup');
    if (isMutating && !isBackup) {
      return res.status(403).json({
        ok: false,
        code: 'LICENSE_READONLY',
        error: 'License expired. Renew to continue.',
      });
    }
  }

  // valid / expiring / grace → allow
  next();
}

module.exports = { requireLicense };
