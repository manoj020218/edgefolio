#!/usr/bin/env node
'use strict';
/**
 * Demo company for Google Play reviewers / testers ("App access" sign-in details).
 *
 *   node scripts/create-demo-org.js            # creates "EdgeFolio Demo" once (re-run = no-op)
 *   node scripts/create-demo-org.js --reset     # new random passwords for the two demo logins
 *
 * Logins use Employee ID + password (no Google account needed), and never force a password change,
 * so a reviewer can sign in straight away. Prints the company code and credentials as JSON —
 * copy them into Play Console, never into git.
 */
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { loadDotEnv } = require('../src/lib/dotenv');
const { createOrgRecord } = require('../src/orgAdmin');
const { Organisation } = require('../src/models');
const { forOrg } = require('../src/tenancy');
const { hashSecret } = require('../src/lib/password');

const DEMO_NAME = 'EdgeFolio Demo';
const LOGINS = [
  { empCode: 'DEMOADMIN', name: 'Demo Admin', appRole: 'owner', department: 'Management', designation: 'Owner' },
  { empCode: 'DEMO1', name: 'Demo Employee', appRole: 'employee', department: 'Sales', designation: 'Executive' },
];
const newPassword = () => `Demo-${crypto.randomBytes(4).toString('hex')}`;

(async () => {
  loadDotEnv(path.join(__dirname, '..', '.env'));
  await mongoose.connect(process.env.MONGO_URL, { maxPoolSize: 2, serverSelectionTimeoutMS: 10000 });
  try {
    const reset = process.argv.includes('--reset');
    let org = await Organisation.findOne({ name: DEMO_NAME }).lean();
    const created = !org;
    if (!org) org = (await createOrgRecord({ name: DEMO_NAME })).toObject();
    const db = forOrg(org._id);
    const out = { companyCode: org.orgCode, company: DEMO_NAME, created, logins: [] };
    for (const l of LOGINS) {
      const existing = await db.Employee.findOne({ empCode: l.empCode }).lean();
      if (existing && !reset) { out.logins.push({ employeeId: l.empCode, role: l.appRole, password: '(unchanged — run with --reset to set a new one)' }); continue; }
      const password = newPassword();
      const fields = {
        name: l.name, appRole: l.appRole, department: l.department, designation: l.designation,
        passwordHash: hashSecret(password), tempPasswordHash: null, passwordMustChange: false,
        mobileLoginEnabled: true, status: 'active',
      };
      if (existing) await db.Employee.updateOne({ empCode: l.empCode }, { $set: fields });
      else await db.Employee.create({ empId: `cloud-${crypto.randomUUID()}`, empCode: l.empCode, ...fields });
      out.logins.push({ employeeId: l.empCode, role: l.appRole, password });
    }
    await db.AuditLog.create({ actor: 'admin-script', action: created ? 'demo-org-created' : 'demo-org-updated', detail: { reset } });
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await mongoose.disconnect();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
