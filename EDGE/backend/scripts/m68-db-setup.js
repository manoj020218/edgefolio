'use strict';
/**
 * m68-db-setup.js — Insert test device into DB for E2E verification.
 * Usage: node scripts/m68-db-setup.js <db-path> <dev-id>
 */
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.argv[2];
const devId  = process.argv[3] || 'SIM001';

if (!dbPath) {
  console.error('Usage: node m68-db-setup.js <db-path> [dev-id]');
  process.exit(1);
}

const db = new Database(dbPath);

// Check tables
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log('Tables:', tables.map(t => t.name).join(', '));

// Insert device
try {
  db.prepare('INSERT OR IGNORE INTO m68_devices (dev_id, name, location, enabled) VALUES (?, ?, ?, 1)')
    .run(devId, 'Simulator Device', 'Lab');
  const dev = db.prepare('SELECT * FROM m68_devices WHERE dev_id = ?').get(devId);
  console.log('Device:', JSON.stringify(dev));
} catch (e) {
  console.error('Insert error:', e.message);
}

// Insert employee mapping for user 42
try {
  db.prepare('INSERT OR IGNORE INTO machine_id_mappings (machine_emp_id, employee_id, machine_name) VALUES (?, ?, ?)')
    .run('42', (db.prepare("SELECT id FROM employees LIMIT 1").get() || {}).id || 'EMP001', devId);
  const mapping = db.prepare("SELECT * FROM machine_id_mappings WHERE machine_emp_id = '42'").get();
  console.log('Mapping:', JSON.stringify(mapping));
} catch (e) {
  console.log('Mapping insert (non-fatal):', e.message);
}

db.close();
console.log('Done.');
