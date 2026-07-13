'use strict';
const Database = require('better-sqlite3');
const db = new Database(process.argv[2]);

console.log('=== m68_devices ===');
db.prepare('SELECT dev_id, enabled, last_seen_at, last_request_code FROM m68_devices').all()
  .forEach(d => console.log(JSON.stringify(d)));

console.log('\n=== m68_commands ===');
db.prepare('SELECT id, dev_id, cmd_code, status, sent_at, completed_at FROM m68_commands').all()
  .forEach(c => console.log(JSON.stringify(c)));

console.log('\n=== machine_import_staging (m68 rows) ===');
db.prepare("SELECT id, import_batch, source_type, machine_emp_id, punch_date, punch_time, direction, status, mapped_employee_id FROM machine_import_staging WHERE source_type='m68'").all()
  .forEach(s => console.log(JSON.stringify(s)));

console.log('\n=== attendance_records (recent) ===');
db.prepare('SELECT member_id, date, check_in, check_out, attendance_mode, device_id FROM attendance_records ORDER BY rowid DESC LIMIT 5').all()
  .forEach(a => console.log(JSON.stringify(a)));

console.log('\n=== m68_events ===');
db.prepare('SELECT dev_id, kind, received_at FROM m68_events').all()
  .forEach(e => console.log(JSON.stringify(e)));

db.close();
