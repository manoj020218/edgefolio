'use strict';
/**
 * Express app. Routes are mounted at the root: nginx maps the public prefix (today
 * https://edgefolio.iotsoft.in/cloud/ → http://127.0.0.1:3090/) and strips it, so the app never
 * knows where it is published. Moving to a subdomain or another VPS changes nginx + .env only.
 *
 * /health (Phase 1), app API /api/v1/apk/* and /api/v1/auth/* (Phase 2). Sync API /api/v1/sync/*
 * comes in Phase 3 (CLOUD_ATTENDANCE_PLAN.md §9).
 */
const express = require('express');
const { createMetrics } = require('./metrics');
const { apkRouter } = require('./routes/apk');
const { authRouter } = require('./routes/authRoutes');
const { syncRouter } = require('./routes/sync');
const { appCors } = require('./cors');
const { ownerRouter, reportsRouter } = require('./routes/owner');
const { createGoogleVerifier } = require('./lib/google');
const { createBilling } = require('./lib/billing');

// deps: injectable outside services (tests pass fakes): google(idToken) → {email,name,sub}, billing.
function createApp({ config, getDbState = () => 'unknown', version = '0.0.0', deps = {} }) {
  const google = deps.google || createGoogleVerifier(config.googleClientIds);
  const billing = deps.billing || createBilling({ baseUrl: config.billingApiUrl, apiKey: config.billingApiKey });
  const app = express();
  const metrics = createMetrics();
  const startedAt = Date.now();

  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');           // client IP from nginx's X-Forwarded-For
  app.use(express.json({ limit: '256kb' }));    // embeddings are ~2 KB; no photos through the API
  const cors = appCors(config.corsOrigins);      // app origins only; mounted on app routes below
  app.use('/health', cors);                      // the app's reachability check

  // Response-time logging from day one (plan §10): every request timed, slow ones logged.
  app.use((req, res, next) => {
    const t0 = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      if (req.path !== '/health') metrics.record(ms, config.slowRequestMs);
      if (ms >= config.slowRequestMs) {
        console.warn(`[slow] ${req.method} ${req.path} ${res.statusCode} ${ms.toFixed(0)}ms`);
      }
    });
    next();
  });

  app.get('/health', (req, res) => {
    const db = getDbState();
    const mem = process.memoryUsage();
    res.status(db === 'connected' ? 200 : 503).json({
      ok: db === 'connected',
      service: 'edgefolio-cloud',
      version,
      db,
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      memoryMb: { rss: Math.round(mem.rss / 1048576), heapUsed: Math.round(mem.heapUsed / 1048576) },
      responseTime: metrics.snapshot(),
    });
  });

  app.use('/api/v1/apk', cors, ownerRouter(config, { google, billing }));   // before apkRouter's auth wall
  app.use('/api/v1/apk', cors, apkRouter(config));
  app.use('/api/v1/reports', reportsRouter(config));
  app.use('/api/v1/auth', cors, authRouter(config));
  app.use('/api/v1/sync', syncRouter({ billing }));

  // Same envelope as EDGE's API ({ ok, data } / { ok:false, error }), so the app parses both alike.
  app.use((req, res) => res.status(404).json({ ok: false, error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error('[error]', err.stack || err.message);
    if (err.errorCode && status < 500) return res.status(status).json({ ok: false, error: err.errorCode, message: err.message });
    res.status(status).json({ ok: false, error: status >= 500 ? 'Internal error' : err.message });
  });

  return app;
}

module.exports = { createApp };
