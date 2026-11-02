'use strict';
/**
 * Organisation resolution + employee auth.
 *
 * Public app endpoints (config, login-check, offices, auth/login) need to know the company: the app
 * sends the org code once typed at setup, as header `X-Org-Code` (or `orgCode` in query/body).
 * Everything behind login takes the org from the token — never from the request.
 */
const jwt = require('jsonwebtoken');
const { Organisation } = require('./models');
const { httpError } = require('./lib/http');

const TOKEN_TTL = '7d';   // same as EDGE's APK login

function orgCodeFrom(req) {
  return String(req.get('x-org-code') || req.query.orgCode || (req.body && req.body.orgCode) || '').trim().toUpperCase();
}

// For public endpoints: attaches req.org from the org code, or 400/404.
function resolveOrg() {
  return async (req, res, next) => {
    try {
      const code = orgCodeFrom(req);
      if (!code) throw httpError(400, 'Company code is required');
      const org = await Organisation.findOne({ orgCode: code }).lean();
      if (!org) throw httpError(404, 'Company code not found');
      if (org.status !== 'active') throw httpError(403, 'This company account is suspended');
      req.org = org;
      next();
    } catch (e) { next(e); }
  };
}

function signToken(config, org, emp) {
  return jwt.sign(
    { orgId: String(org._id), empId: emp.empId, empCode: emp.empCode, email: emp.email || null, role: emp.appRole },
    config.jwtSecret,
    { expiresIn: TOKEN_TTL, algorithm: 'HS256' },
  );
}

// Verifies the bearer token, attaches req.user + req.org (the org must still exist and be active).
function requireAuth(config) {
  return async (req, res, next) => {
    try {
      const m = String(req.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
      if (!m) throw httpError(401, 'Authentication required');
      let payload;
      try { payload = jwt.verify(m[1], config.jwtSecret, { algorithms: ['HS256'] }); }
      catch { throw httpError(401, 'Session expired, please log in again'); }
      const org = await Organisation.findById(payload.orgId).lean();
      if (!org) throw httpError(401, 'Company account not found');
      if (org.status !== 'active') throw httpError(403, 'This company account is suspended');
      req.user = { orgId: String(org._id), empId: payload.empId, empCode: payload.empCode, email: payload.email, role: payload.role };
      req.org = org;
      next();
    } catch (e) { next(e); }
  };
}

function requireRole(...roles) {
  return (req, res, next) => (roles.includes(req.user?.role) ? next() : next(httpError(403, 'Not allowed for your role')));
}

module.exports = { resolveOrg, signToken, requireAuth, requireRole, orgCodeFrom };
