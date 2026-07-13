'use strict';
const Database = require('better-sqlite3');
const { randomUUID } = require('crypto');

const dbPath = process.argv[2];
const devId  = process.argv[3] || 'SIM001';
const cmdCode = process.argv[4] || 'SET_TIME';

const db = new Database(dbPath);
const txId = randomUUID();
db.prepare("INSERT INTO m68_commands (dev_id, trans_id, cmd_code, cmd_param, status) VALUES (?, ?, ?, '{}', 'pending')")
  .run(devId, txId, cmdCode);
console.log(`Inserted ${cmdCode} for ${devId}, trans_id: ${txId}`);
const cmds = db.prepare('SELECT * FROM m68_commands').all();
console.log('All commands:', JSON.stringify(cmds, null, 2));
db.close();
