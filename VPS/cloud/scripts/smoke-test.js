#!/usr/bin/env node
'use strict';
/**
 * Live smoke test against PUBLIC_BASE_URL (through nginx, real database). Creates a throwaway
 * company, walks the main app flow, then deletes the company and every row it created.
 * Prints PASS/FAIL lines only — no passwords or tokens.
 *
 *   node scripts/smoke-test.js
 */
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { loadDotEnv } = require('../src/lib/dotenv');
const { createOrganisation } = require('../src/orgAdmin');
const models = require('../src/models');
const { TENANT_MODELS } = require('../src/tenancy');

let failures = 0;
const check = (label, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && extra ? `  (${extra})` : ''}`); if (!cond) failures++; };

(async () => {
  loadDotEnv(path.join(__dirname, '..', '.env'));
  const base = `${process.env.PUBLIC_BASE_URL.replace(/\/+$/, '')}/api/v1`;
  await mongoose.connect(process.env.MONGO_URL, { maxPoolSize: 2, serverSelectionTimeoutMS: 10000 });
  const { org, tempPassword } = await createOrganisation({ name: `Smoke test ${new Date().toISOString()}`, ownerName: 'Smoke Owner' });
  const call = async (method, p, { body, token, orgCode } = {}) => {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    if (orgCode) headers['x-org-code'] = orgCode;
    const res = await fetch(`${base}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  try {
    const cfg = await call('GET', '/apk/config', { orgCode: org.orgCode });
    check('config via public URL', cfg.status === 200 && cfg.body.data?.company_name === org.name, `HTTP ${cfg.status}`);

    const login = await call('POST', '/apk/auth/login', { orgCode: org.orgCode, body: { empCode: 'OWNER', password: tempPassword } });
    check('owner login with temp password', login.body.ok && login.body.data.user.passwordMustChange === true, `HTTP ${login.status}`);
    let token = login.body.data?.token;

    const newPass = crypto.randomBytes(9).toString('base64url');
    const ch = await call('POST', '/auth/change-password', { token, body: { currentPassword: tempPassword, newPassword: newPass } });
    check('change password', ch.body.ok === true, `HTTP ${ch.status}`);
    const relog = await call('POST', '/apk/auth/login', { orgCode: org.orgCode, body: { empCode: 'OWNER', password: newPass } });
    check('login with new password', relog.body.ok && relog.body.data.user.passwordMustChange === false);
    token = relog.body.data?.token;
    const empId = relog.body.data?.user.empId;

    const now = new Date();
    const inR = await call('POST', '/apk/attendance', { token, body: {
      empId, workType: 'office', timestamp: now.toISOString(), similarity: 0.9, liveness: 'PASSED',
      location: { lat: 26.9, lon: 75.8, accuracy: 10 } } });
    check('check-in', inR.body.ok && inR.body.data.alreadyMarked === false, `HTTP ${inR.status} ${inR.body.error || ''}`);
    const today = await call('GET', '/apk/today-status', { token });
    check('today-status shows currently working', today.body.data?.todayAttendance?.currentlyWorking === true);
    const out = await call('POST', '/apk/attendance/checkout', { token, body: { timestamp: new Date(now.getTime() + 60000).toISOString() } });
    check('checkout', out.body.ok === true, `HTTP ${out.status}`);
    const feed = await call('GET', '/apk/live-feed', { token });
    check('owner live feed lists the punch', feed.body.data?.summary?.present === 1);
    const other = await call('GET', '/apk/config', { orgCode: 'ZZZZZZ' });
    check('unknown company code refused', other.status === 404);
  } finally {
    for (const name of TENANT_MODELS) await models[name].deleteMany({ orgId: org._id });
    await models.Organisation.deleteOne({ _id: org._id });
    const left = (await Promise.all(TENANT_MODELS.map((n) => models[n].countDocuments({ orgId: org._id })))).reduce((a, b) => a + b, 0);
    check('throwaway company and its data removed', left === 0 && !(await models.Organisation.exists({ _id: org._id })));
    await mongoose.disconnect();
  }
  console.log(failures ? `${failures} check(s) FAILED` : 'ALL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('Smoke test error:', e.message); process.exit(1); });
