/* eslint-disable no-console */
const path = require('path');
const { getDb, closeDb } = require('../backend/config/database');
const { DB_PATH } = require('../backend/config/app');

function listTables(db) {
  return db
    .prepare(
      `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name
      `,
    )
    .all()
    .map((row) => row.name);
}

function main() {
  const db = getDb();
  const tables = listTables(db);
  const employees = db.prepare('SELECT COUNT(*) AS n FROM employees').get().n;
  const attendance = db.prepare('SELECT COUNT(*) AS n FROM attendance_records').get().n;

  console.log('EDGEFOLIO database initialized successfully.');
  console.log(`Database path : ${path.resolve(DB_PATH)}`);
  console.log(`Tables        : ${tables.length}`);
  console.log(`Employees     : ${employees}`);
  console.log(`Attendance    : ${attendance}`);
  console.log('Table list:');
  tables.forEach((tableName) => {
    console.log(`- ${tableName}`);
  });
}

try {
  main();
} catch (error) {
  console.error('Database initialization failed.');
  console.error(error.message);
  process.exitCode = 1;
} finally {
  closeDb();
}
