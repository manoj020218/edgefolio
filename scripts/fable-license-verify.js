// Fable review: exercises licenseService state machine with real RS256 keys. No DB needed.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ef-lic-'));
process.env.EDGEFOLIO_STORAGE_PATH = tmp;

const jwt = require(path.join(__dirname, '..', 'EDGE', 'node_modules', 'jsonwebtoken'));
const privateKey = fs.readFileSync('D:/IOT Device/Billing at IOT soft/billing-server/keys/edge-license-private.pem', 'utf8');

const svc = require(path.join(__dirname, '..', 'EDGE', 'backend', 'services', 'licenseService'));
const machineId = svc.getCachedMachineId();

function makeLicense({ daysFromNow, status = 'trial', graceDays = 15, machine = machineId }) {
  const expiresAt = new Date(Date.now() + daysFromNow * 86400000).toISOString();
  return jwt.sign({
    licenseKey: 'EF-TEST-TEST-TEST-TEST',
    clientId: '000000000000000000000000',
    plan: { name: 'trial', maxEmployees: 25 },
    status,
    issuedAt: new Date().toISOString(),
    expiresAt,
    graceDays,
    machineId: machine,
  }, privateKey, { algorithm: 'RS256', expiresIn: '400d' });
}

const licenseFile = path.join(tmp, 'license.json');
function setLicense(token) {
  fs.writeFileSync(licenseFile, JSON.stringify({ license: token }));
  svc.invalidateCache();
}

const results = [];
function expect(name, actual, expected) {
  results.push(`${actual === expected ? 'PASS' : 'FAIL'}  ${name}: got '${actual}' expected '${expected}'`);
}

// 1. No license file
svc.invalidateCache();
expect('no file → unlicensed', svc.getLicenseState().state, 'unlicensed');

// 2. Valid license (90 days left)
setLicense(makeLicense({ daysFromNow: 90 }));
expect('90d left → valid', svc.getLicenseState().state, 'valid');

// 3. Expiring (10 days left)
setLicense(makeLicense({ daysFromNow: 10 }));
expect('10d left → expiring', svc.getLicenseState().state, 'expiring');

// 4. Grace (expired 5 days ago, grace 15)
setLicense(makeLicense({ daysFromNow: -5 }));
expect('expired 5d ago → grace', svc.getLicenseState().state, 'grace');

// 5. Readonly (expired 20 days ago, grace 15)
setLicense(makeLicense({ daysFromNow: -20 }));
expect('expired 20d ago → readonly', svc.getLicenseState().state, 'readonly');

// 6. Blocked status claim
setLicense(makeLicense({ daysFromNow: 90, status: 'blocked' }));
expect('status blocked → blocked', svc.getLicenseState().state, 'blocked');

// 7. Wrong machine binding
setLicense(makeLicense({ daysFromNow: 90, machine: 'some-other-machine-guid' }));
expect('wrong machine → unlicensed', svc.getLicenseState().state, 'unlicensed');

// 8. Tampered token (flip a char in the payload section)
{
  const good = makeLicense({ daysFromNow: 90 });
  const parts = good.split('.');
  const buf = Buffer.from(parts[1], 'base64url');
  const idx = buf.indexOf('90') >= 0 ? buf.indexOf('9') : 5;
  buf[idx] = buf[idx] === 51 ? 52 : 51; // mutate one byte
  parts[1] = buf.toString('base64url');
  setLicense(parts.join('.'));
  expect('tampered payload → unlicensed', svc.getLicenseState().state, 'unlicensed');
}

// 9. Garbage file
fs.writeFileSync(licenseFile, 'not json at all');
svc.invalidateCache();
expect('garbage file → unlicensed', svc.getLicenseState().state, 'unlicensed');

console.log(results.join('\n'));
const fails = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - fails}/${results.length} passed`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
