'use strict';
// Regression check for the ALOG attendance-file parser against a real device
// export ("K43" — the label the client used for this data set/device). Fixture
// is gitignored (real employee PII), so this only runs where the file exists —
// it's a local sanity check, not a CI-enforced test.
//
// Run: node scripts/verify-alog-parser.js

const fs = require('fs');
const path = require('path');
const { parseAlogFile } = require('../backend/services/alogService');

const fixturePath = path.join(__dirname, '..', 'backend/services/__fixtures__/alog-k43-sample.txt');
if (!fs.existsSync(fixturePath)) {
  console.log('No fixture at', fixturePath, '— nothing to verify (fixture is gitignored, local-only).');
  process.exit(0);
}

const buf = fs.readFileSync(fixturePath);
const { records, summary } = parseAlogFile(buf);

console.log('Parsed', summary.total, 'records,', summary.uniqueEmployees, 'unique employees, range', summary.dateRange);

const assertions = [
  [summary.total > 0, 'expected > 0 records'],
  [records.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.punchDate)), 'every punchDate must be ISO YYYY-MM-DD'],
  [records.every((r) => /^\d{2}:\d{2}$/.test(r.punchTime)), 'every punchTime must be HH:MM'],
  [records.some((r) => r.machineName && r.machineName.trim().length > 0), 'expected at least one non-blank machineName'],
];

let failed = 0;
for (const [ok, msg] of assertions) {
  if (!ok) { console.error('FAIL:', msg); failed++; }
}

if (failed > 0) {
  console.error(`${failed} assertion(s) failed.`);
  process.exit(1);
}
console.log('All assertions passed.');
