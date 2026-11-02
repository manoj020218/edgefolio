'use strict';
// Shared test setup: an in-memory MongoDB 4.4 (same major version as the VPS), the app on a random
// port, and small helpers to create organisations/employees and log in.
process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '4.4.29';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');
const { Organisation } = require('../src/models');
const { forOrg } = require('../src/tenancy');
const { hashSecret } = require('../src/lib/password');

async function startServer(deps = {}) {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('edgefolio_cloud_test'));
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  const config = loadConfig({ PUBLIC_BASE_URL: 'https://example.test/cloud', MONGO_URL: 'unused', JWT_SECRET: 'test-secret-test-secret-test-secret' });
  const app = createApp({ config, getDbState: () => 'connected', version: 'test', deps });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url, config,
    async stop() { server.close(); await mongoose.disconnect(); await mongod.stop(); },
  };
}

async function makeOrg(code, name = `Org ${code}`, settings = {}) {
  return Organisation.create({ orgCode: code, name, settings });
}

async function makeEmployee(org, { empId, empCode, name = empCode, role = 'employee', password = 'secret1', ...rest }) {
  return forOrg(org._id).Employee.create({ empId, empCode, name, appRole: role, passwordHash: hashSecret(password), ...rest });
}

function api(url) {
  async function call(method, path, { body, token, orgCode, query } = {}) {
    const qs = query ? `?${new URLSearchParams(query)}` : '';
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    if (orgCode) headers['x-org-code'] = orgCode;
    const res = await fetch(`${url}${path}${qs}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() };
  }
  return {
    get: (p, o) => call('GET', p, o), post: (p, o) => call('POST', p, o), patch: (p, o) => call('PATCH', p, o),
    async login(orgCode, empCode, password = 'secret1') {
      const r = await call('POST', '/api/v1/apk/auth/login', { orgCode, body: { empCode, password } });
      if (!r.body.ok) throw new Error(`login failed: ${JSON.stringify(r.body)}`);
      return r.body.data.token;
    },
  };
}

const embedding = (seed = 1) => Array.from({ length: 192 }, (_, i) => Math.sin(i * seed) / 10);
const punchBody = (empId, timestamp, extra = {}) => ({
  empId, workType: 'office', timestamp, similarity: 0.92, liveness: 'PASSED',
  location: { lat: 26.9124, lon: 75.7873, accuracy: 12 }, ...extra,
});

module.exports = { startServer, makeOrg, makeEmployee, api, embedding, punchBody };
