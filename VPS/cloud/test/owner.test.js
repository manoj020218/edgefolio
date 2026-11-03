'use strict';
// Phase 4: app-only companies (Google sign-up via billing), owner tools, employee management, export.
const test = require('node:test');
const assert = require('node:assert');
const { startServer, api } = require('./helpers');

// Fake Google: the "ID token" is just the email. Fake billing: in-memory licences.
const google = async (t) => {
  if (!t || !String(t).includes('@')) throw Object.assign(new Error('Google sign-in was not accepted'), { status: 401 });
  return { email: String(t).toLowerCase(), name: `Name of ${t}`, sub: `sub-${t}` };
};
const licences = new Map();   // key → { email, phone, company, valid }
let n = 0;
const billing = {
  configured: true,
  async signup({ companyName, phone, email }) {
    for (const l of licences.values()) if (l.email === email || l.phone === phone) throw Object.assign(new Error('exists'), { status: 409 });
    const key = `EF-TEST-${++n}`;
    licences.set(key, { email, phone, company: companyName, valid: true });
    return { licenseKey: key };
  },
  async verifyLicense(key) {
    const l = licences.get(key);
    if (!l) throw Object.assign(new Error('not found'), { status: 404 });
    return { valid: l.valid, licenseKey: key, ownerEmail: l.email, clientId: `client-${key}` };
  },
  async findLicenseByEmail(email) {
    for (const [key, l] of licences) if (l.email === email && l.valid) return { valid: true, licenseKey: key, ownerEmail: l.email, clientId: `client-${key}` };
    throw Object.assign(new Error('not found'), { status: 404 });
  },
  links: [],
  async link(x) { this.links.push(x); return { ok: true }; },
};

let srv, client, owner;   // owner = signup payload
const sync = (method, path, key, body) => fetch(`${srv.url}/api/v1/sync${path}`, {
  method, headers: { 'content-type': 'application/json', ...(key ? { 'x-sync-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined,
}).then(async (r) => ({ status: r.status, body: await r.json() }));

test.before(async () => { srv = await startServer({ google, billing }); client = api(srv.url); });
test.after(async () => { await srv.stop(); });

test('signup: Google + billing registration creates the company and signs the owner in', async () => {
  const bad = await client.post('/api/v1/apk/signup', { body: { idToken: 'nope', companyName: 'X', phone: '9999999999' } });
  assert.strictEqual(bad.status, 401);
  const noPhone = await client.post('/api/v1/apk/signup', { body: { idToken: 'ravi@gmail.com', companyName: 'Ravi Builders' } });
  assert.strictEqual(noPhone.status, 400);

  const r = await client.post('/api/v1/apk/signup', { body: { idToken: 'ravi@gmail.com', companyName: 'Ravi Builders', phone: '+91 98290 11111' } });
  assert.strictEqual(r.body.ok, true);
  assert.strictEqual(r.body.data.created, true);
  assert.match(r.body.data.orgCode, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.strictEqual(r.body.data.user.role, 'owner');
  assert.strictEqual(r.body.data.licenseKey, 'EF-TEST-1');
  assert.deepStrictEqual(billing.links.at(-1).orgCode, r.body.data.orgCode);
  owner = r.body.data;

  const company = await client.get('/api/v1/apk/company', { token: owner.token });
  assert.deepStrictEqual(
    [company.body.data.companyName, company.body.data.licenseKey, company.body.data.ownerEmail, company.body.data.employeesManagedIn],
    ['Ravi Builders', 'EF-TEST-1', 'ravi@gmail.com', 'app'],
  );
  assert.match(company.body.data.pcDownloadUrl, /\/download$/);
  assert.match(company.body.data.appDownloadUrl, /\/download\/apk$/);
});

test('signup: same Google email again → reuses its licence and signs in; phone of someone else → LICENCE_EXISTS', async () => {
  const again = await client.post('/api/v1/apk/signup', { body: { idToken: 'ravi@gmail.com', companyName: 'Dup', phone: '9000000000' } });
  assert.deepStrictEqual([again.body.data.created, again.body.data.orgCode, again.body.data.licenseKey], [false, owner.orgCode, 'EF-TEST-1']);
  // Registered on the desktop first (licence, no cloud company yet) → signup creates the company on that licence.
  licences.set('EF-PC-7', { email: 'pc@x.com', phone: '5550001', company: 'PC Co', valid: true });
  const pc = await client.post('/api/v1/apk/signup', { body: { idToken: 'pc@x.com', companyName: 'PC Co', phone: '9111111111' } });
  assert.deepStrictEqual([pc.body.data.created, pc.body.data.licenseKey], [true, 'EF-PC-7']);
  // Phone belongs to another owner's licence, email has none → clear 409.
  const clash = await client.post('/api/v1/apk/signup', { body: { idToken: 'new@x.com', companyName: 'New', phone: '5550001' } });
  assert.deepStrictEqual([clash.status, clash.body.error], [409, 'LICENCE_EXISTS']);
  const withKey = await client.post('/api/v1/apk/signup', { body: { idToken: 'ravi@gmail.com', companyName: 'Dup', licenseKey: 'EF-TEST-1' } });
  assert.deepStrictEqual([withKey.body.data.created, withKey.body.data.orgCode], [false, owner.orgCode]);
});

test('signup with a licence key: must belong to the same Google account', async () => {
  licences.set('EF-DESK-9', { email: 'desk@x.com', phone: '1', company: 'Desk Co', valid: true });
  const thief = await client.post('/api/v1/apk/signup', { body: { idToken: 'other@x.com', companyName: 'Steal', licenseKey: 'EF-DESK-9' } });
  assert.deepStrictEqual([thief.status, thief.body.error], [403, 'LICENCE_EMAIL_MISMATCH']);
  const missing = await client.post('/api/v1/apk/signup', { body: { idToken: 'desk@x.com', companyName: 'Desk Co', licenseKey: 'EF-NOPE' } });
  assert.deepStrictEqual([missing.status, missing.body.error], [404, 'LICENCE_NOT_FOUND']);
  const ok = await client.post('/api/v1/apk/signup', { body: { idToken: 'desk@x.com', companyName: 'Desk Co', licenseKey: 'EF-DESK-9' } });
  assert.strictEqual(ok.body.data.created, true);
});

test('Google sign-in: one company → token; unknown → NO_ACCOUNT; several → choose', async () => {
  const one = await client.post('/api/v1/apk/auth/google', { body: { idToken: 'ravi@gmail.com' } });
  assert.strictEqual(one.body.data.orgCode, owner.orgCode);
  assert.ok(one.body.data.token);
  const none = await client.post('/api/v1/apk/auth/google', { body: { idToken: 'stranger@x.com' } });
  assert.deepStrictEqual([none.status, none.body.error], [404, 'NO_ACCOUNT']);

  // Ravi also owns a second company → he must pick one (or send the company code).
  licences.set('EF-SECOND', { email: 'ravi@gmail.com', phone: '2', company: 'Second', valid: true });
  const second = await client.post('/api/v1/apk/signup', { body: { idToken: 'ravi@gmail.com', companyName: 'Ravi Second', licenseKey: 'EF-SECOND' } });
  const pick = await client.post('/api/v1/apk/auth/google', { body: { idToken: 'ravi@gmail.com' } });
  assert.strictEqual(pick.body.data.chooseCompany.length, 2);
  const chosen = await client.post('/api/v1/apk/auth/google', { orgCode: second.body.data.orgCode, body: { idToken: 'ravi@gmail.com' } });
  assert.strictEqual(chosen.body.data.companyName, 'Ravi Second');
});

test('employees: owner adds one, employee logs in with the temp password and must change it', async () => {
  const add = await client.post('/api/v1/apk/employees', { token: owner.token, body: { name: 'Sunil', department: 'Site' } });
  assert.strictEqual(add.body.data.empCode, 'E0001');
  assert.ok(add.body.data.tempPassword.length >= 8);
  const login = await client.post('/api/v1/apk/auth/login', { orgCode: owner.orgCode, body: { empCode: 'E0001', password: add.body.data.tempPassword } });
  assert.strictEqual(login.body.data.user.passwordMustChange, true);
  const dup = await client.post('/api/v1/apk/employees', { token: owner.token, body: { name: 'X', empCode: 'e0001' } });
  assert.strictEqual(dup.status, 409);

  const empToken = login.body.data.token;
  assert.strictEqual((await client.post('/api/v1/apk/employees', { token: empToken, body: { name: 'Y' } })).status, 403);

  const reset = await client.post(`/api/v1/apk/employees/${add.body.data.empId}/reset-password`, { token: owner.token });
  const relog = await client.post('/api/v1/apk/auth/login', { orgCode: owner.orgCode, body: { empCode: 'E0001', password: reset.body.data.tempPassword } });
  assert.strictEqual(relog.body.ok, true);

  const off = await client.patch(`/api/v1/apk/employees/${add.body.data.empId}`, { token: owner.token, body: { status: 'inactive' } });
  assert.strictEqual(off.body.data.status, 'inactive');
  const gone = await client.post('/api/v1/apk/auth/login', { orgCode: owner.orgCode, body: { empCode: 'E0001', password: reset.body.data.tempPassword } });
  assert.strictEqual(gone.status, 401);
  const self = await client.patch(`/api/v1/apk/employees/${owner.user.empId}`, { token: owner.token, body: { status: 'inactive' } });
  assert.strictEqual(self.status, 400);
});

test('PC-linked company: employees are managed in EdgeFolio desktop; sync connect checks the licence', async () => {
  const bad = await sync('POST', '/connect', null, { licenseKey: 'EF-UNKNOWN-1', machineId: 'PC-X' });
  assert.deepStrictEqual([bad.status, bad.body.error], [403, 'LICENCE_INVALID']);
  // The app-created company's licence connects from a PC → same company, now PC-linked.
  const c = await sync('POST', '/connect', null, { licenseKey: 'EF-TEST-1', machineId: 'PC-RAVI' });
  assert.deepStrictEqual([c.body.data.created, c.body.data.orgCode], [false, owner.orgCode]);
  const add = await client.post('/api/v1/apk/employees', { token: owner.token, body: { name: 'Z' } });
  assert.deepStrictEqual([add.status, add.body.error], [409, 'MANAGED_IN_EDGE']);
  const company = await client.get('/api/v1/apk/company', { token: owner.token });
  assert.deepStrictEqual([company.body.data.linkedToPc, company.body.data.employeesManagedIn], [true, 'pc']);
});

test('export: short-lived CSV link for the month', async () => {
  const link = await client.get('/api/v1/apk/reports/attendance/link', { token: owner.token, query: { month: '2026-11' } });
  const url = link.body.data.url.replace('https://example.test/cloud', srv.url);
  const res = await fetch(url);
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /attendance-.*-2026-11\.csv/);
  const bytes = Buffer.from(await res.arrayBuffer());
  assert.deepStrictEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);   // BOM (fetch().text() would hide it)
  assert.match(bytes.subarray(3).toString('utf8'), /^Date,Employee ID,Name,Department,Check-in,Check-out,Hours,Status,Mode/);
  assert.strictEqual((await fetch(`${srv.url}/api/v1/reports/attendance.csv?t=forged`)).status, 401);
  assert.strictEqual((await client.get('/api/v1/apk/reports/attendance/link', { token: owner.token, query: { month: 'bad' } })).status, 400);
});
