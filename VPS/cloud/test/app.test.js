'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');

const baseEnv = { PUBLIC_BASE_URL: 'https://example.test/cloud/', MONGO_URL: 'mongodb://x/y', JWT_SECRET: 'dev-secret' };

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

test('config: reads env, trims trailing slash, applies defaults', () => {
  const cfg = loadConfig(baseEnv);
  assert.strictEqual(cfg.publicBaseUrl, 'https://example.test/cloud');
  assert.strictEqual(cfg.port, 3090);
  assert.strictEqual(cfg.host, '127.0.0.1');
  assert.strictEqual(cfg.mongoPoolSize, 5);
});

test('config: missing required variable is a clear error', () => {
  assert.throws(() => loadConfig({ ...baseEnv, MONGO_URL: '' }), /MONGO_URL/);
});

test('config: production refuses a short JWT secret', () => {
  assert.throws(() => loadConfig({ ...baseEnv, NODE_ENV: 'production' }), /JWT_SECRET/);
  assert.doesNotThrow(() => loadConfig({ ...baseEnv, NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32) }));
});

test('health: 200 when DB connected, 503 when not; response-time stats present', async () => {
  const config = loadConfig(baseEnv);
  let state = 'connecting';
  const { server, url } = await listen(createApp({ config, getDbState: () => state, version: '9.9.9' }));
  try {
    let r = await fetch(`${url}/health`);
    assert.strictEqual(r.status, 503);
    assert.strictEqual((await r.json()).db, 'connecting');
    await fetch(`${url}/nope`);                       // a timed request
    state = 'connected';
    r = await fetch(`${url}/health`);
    const body = await r.json();
    assert.strictEqual(r.status, 200);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.version, '9.9.9');
    assert.strictEqual(body.responseTime.requests, 1);
    assert.ok(body.memoryMb.rss > 0);
  } finally { server.close(); }
});

test('unknown route: EDGE-style error envelope', async () => {
  const { server, url } = await listen(createApp({ config: loadConfig(baseEnv), getDbState: () => 'connected' }));
  try {
    const r = await fetch(`${url}/api/v1/nope`);
    assert.strictEqual(r.status, 404);
    assert.deepStrictEqual(await r.json(), { ok: false, error: 'Not found' });
  } finally { server.close(); }
});

test('CORS: app origins get headers and preflight; others do not', async () => {
  const { server, url } = await listen(createApp({ config: loadConfig(baseEnv), getDbState: () => 'connected' }));
  try {
    const pre = await fetch(`${url}/api/v1/apk/config`, { method: 'OPTIONS', headers: { origin: 'http://localhost', 'access-control-request-headers': 'x-org-code' } });
    assert.strictEqual(pre.status, 204);
    assert.strictEqual(pre.headers.get('access-control-allow-origin'), 'http://localhost');
    assert.match(pre.headers.get('access-control-allow-headers'), /X-Org-Code/);
    const evil = await fetch(`${url}/api/v1/apk/config`, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } });
    assert.strictEqual(evil.status, 403);
    const h = await fetch(`${url}/health`, { headers: { origin: 'https://localhost' } });
    assert.strictEqual(h.headers.get('access-control-allow-origin'), 'https://localhost');
    const sync = await fetch(`${url}/api/v1/sync/status`, { headers: { origin: 'http://localhost' } });
    assert.strictEqual(sync.headers.get('access-control-allow-origin'), null);   // server-to-server only
  } finally { server.close(); }
});
