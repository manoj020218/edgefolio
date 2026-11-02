'use strict';
/**
 * Express app. Routes are mounted at the root: nginx maps the public prefix (today
 * https://edgefolio.iotsoft.in/cloud/ → http://127.0.0.1:3090/) and strips it, so the app never
 * knows where it is published. Moving to a subdomain or another VPS changes nginx + .env only.
 *
 * Phase 1 (setup) ships only /health. App API (/api/v1/apk/*) and Sync API (/api/v1/sync/*) come
 * in Phase 2–3 (CLOUD_ATTENDANCE_PLAN.md §9).
 */
const express = require('express');
const { createMetrics } = require('./metrics');

function createApp({ config, getDbState = () => 'unknown', version = '0.0.0' }) {
  const app = express();
  const metrics = createMetrics();
  const startedAt = Date.now();

  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');           // client IP from nginx's X-Forwarded-For
  app.use(express.json({ limit: '256kb' }));    // embeddings are ~2 KB; no photos through the API

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

  // Same envelope as EDGE's API ({ ok, data } / { ok:false, error }), so the app parses both alike.
  app.use((req, res) => res.status(404).json({ ok: false, error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error('[error]', err.stack || err.message);
    res.status(status).json({ ok: false, error: status >= 500 ? 'Internal error' : err.message });
  });

  return app;
}

module.exports = { createApp };
