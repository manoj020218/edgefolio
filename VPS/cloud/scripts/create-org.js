#!/usr/bin/env node
'use strict';
/**
 * Create an organisation + owner login (until self-serve sign-up exists in Phase 4).
 *
 *   node scripts/create-org.js --name "Acme Traders" --owner "Ravi Kumar" [--owner-code OWNER] [--email x@y]
 *
 * Prints the company code and a one-time temporary password (the owner must change it at first login).
 */
const path = require('path');
const mongoose = require('mongoose');
const { loadDotEnv } = require('../src/lib/dotenv');
const { createOrganisation } = require('../src/orgAdmin');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

(async () => {
  loadDotEnv(path.join(__dirname, '..', '.env'));
  const name = arg('name'), ownerName = arg('owner');
  if (!name || !ownerName) {
    console.error('Usage: node scripts/create-org.js --name "<company>" --owner "<owner name>" [--owner-code OWNER] [--email x@y]');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URL, { maxPoolSize: 2, serverSelectionTimeoutMS: 10000 });
  try {
    const { org, owner, tempPassword } = await createOrganisation({
      name, ownerName, ownerEmpCode: arg('owner-code') || 'OWNER', ownerEmail: arg('email') || null,
    });
    console.log(`Company:        ${org.name}`);
    console.log(`Company code:   ${org.orgCode}`);
    console.log(`Owner login:    ${owner.empCode}`);
    console.log(`Temp password:  ${tempPassword}   (shown once; must be changed at first login)`);
  } finally {
    await mongoose.disconnect();
  }
})().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
