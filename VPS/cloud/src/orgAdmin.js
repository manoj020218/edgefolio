'use strict';
/**
 * Creating organisations and their first login. Used by scripts/create-org.js now, and by the
 * sign-up / EDGE-link flows later (Phase 3–4), so the rules live in one place.
 */
const crypto = require('crypto');
const { Organisation } = require('./models');
const { forOrg } = require('./tenancy');
const { hashSecret } = require('./lib/password');

// 6 characters, no look-alikes (0/O, 1/I/L) — typed by hand on a phone.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomOrgCode(len = 6) {
  const bytes = crypto.randomBytes(len);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

function randomTempPassword() {
  return crypto.randomBytes(6).toString('base64url');   // 8 chars, shown once, must be changed
}

/**
 * Creates an organisation and its owner employee with a temporary password.
 * Returns { org, owner, tempPassword } — the temp password is only ever returned here.
 */
async function createOrganisation({ name, ownerEmpCode = 'OWNER', ownerName, ownerEmail = null, tzOffsetMin = 330 }) {
  if (!name || !ownerName) throw new Error('name and ownerName are required');
  let org;
  for (let i = 0; i < 5 && !org; i++) {
    try { org = await Organisation.create({ orgCode: randomOrgCode(), name, tzOffsetMin }); }
    catch (e) { if (e.code !== 11000) throw e; }   // code collision: try another
  }
  if (!org) throw new Error('Could not allocate a unique company code');
  const tempPassword = randomTempPassword();
  const db = forOrg(org._id);
  const owner = await db.Employee.create({
    empId: `cloud-${crypto.randomUUID()}`, empCode: ownerEmpCode, name: ownerName, email: ownerEmail,
    appRole: 'owner', tempPasswordHash: hashSecret(tempPassword), passwordMustChange: true,
  });
  await db.AuditLog.create({ actor: 'admin-script', action: 'org-created', detail: { orgCode: org.orgCode } });
  return { org, owner, tempPassword };
}

module.exports = { createOrganisation, randomOrgCode, randomTempPassword };
