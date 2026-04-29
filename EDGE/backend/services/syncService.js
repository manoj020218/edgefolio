const https = require('https');
const { getDb } = require('../config/database');
const { getFrpConfig } = require('../config/frpConfig');
const { CLOUD_SYNC_BASE_URL } = require('../config/app');
const logger = require('../utils/logger');

const SYNC_TIMEOUT_MS = 15000;

function ensureSyncRow(db) {
  const row = db.prepare('SELECT * FROM sync_status WHERE id = 1').get();
  if (row) return row;

  db.prepare(
    `
    INSERT INTO sync_status (
      id, last_sync, next_sync, sync_status, records_synced, records_new, records_modified, offline_mode, pending_changes
    ) VALUES (1, NULL, NULL, 'idle', 0, 0, 0, 0, 0)
    `,
  ).run();
  return db.prepare('SELECT * FROM sync_status WHERE id = 1').get();
}

function getSyncStatus() {
  const db = getDb();
  const status = ensureSyncRow(db);
  logger.info('Fetched sync status', { channel: 'sync' });
  return status;
}

function buildSyncPayload(db) {
  const employees = db
    .prepare(
      `SELECT id, name, email, phone, department, designation,
              joining_date, salary, status, updated_at
       FROM employees
       WHERE status = 'active'`,
    )
    .all();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const attendance = db
    .prepare(
      `SELECT event_id, member_id, date, check_in, check_out,
              status, hours_worked, updated_at
       FROM attendance
       WHERE date >= ?`,
    )
    .all(thirtyDaysAgo);

  return {
    deviceId: getFrpConfig().subdomain || 'unknown',
    sentAt: new Date().toISOString(),
    employees,
    attendance,
  };
}

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + (parsed.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Edge-Client': '1',
      },
    };

    const mod = parsed.protocol === 'https:' ? https : require('http');
    const req = mod.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    });

    req.setTimeout(SYNC_TIMEOUT_MS, () => {
      req.destroy(new Error(`VPS sync timed out after ${SYNC_TIMEOUT_MS}ms`));
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function pushToCloud() {
  const db = getDb();
  ensureSyncRow(db);

  const now = new Date();
  const next = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  const syncUrl = `${CLOUD_SYNC_BASE_URL}/edge/sync`;

  let recordsNew = 0;
  let recordsModified = 0;
  let recordsSynced = 0;
  let offlineMode = 0;
  let finalStatus = 'completed';

  try {
    const payload = buildSyncPayload(db);
    recordsNew = payload.employees.length;

    const response = await postJson(syncUrl, payload);

    if (response.statusCode >= 200 && response.statusCode < 300) {
      const serverData = response.body?.data || {};
      recordsSynced = serverData.recordsSynced ?? recordsNew;
      recordsModified = serverData.recordsModified ?? 0;
      offlineMode = 0;
      finalStatus = 'completed';

      logger.info('VPS sync push succeeded', {
        channel: 'sync',
        statusCode: response.statusCode,
        recordsSynced,
      });
    } else {
      throw new Error(`VPS responded with HTTP ${response.statusCode}`);
    }
  } catch (err) {
    offlineMode = 1;
    finalStatus = 'failed';
    logger.warn('VPS sync push failed — offline mode', {
      channel: 'sync',
      reason: err.message,
    });
  }

  db.prepare(
    `
    UPDATE sync_status
    SET last_sync = ?, next_sync = ?, sync_status = ?,
        records_synced = ?, records_new = ?, records_modified = ?,
        pending_changes = CASE WHEN ? = 0 THEN 0 ELSE pending_changes END,
        offline_mode = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
    `,
  ).run(
    now.toISOString(),
    next.toISOString(),
    finalStatus,
    recordsSynced,
    recordsNew,
    recordsModified,
    offlineMode,
    offlineMode,
  );

  logger.info('Sync status updated', {
    channel: 'sync',
    finalStatus,
    offlineMode: Boolean(offlineMode),
    recordsSynced,
  });

  return {
    status: db.prepare('SELECT * FROM sync_status WHERE id = 1').get(),
    frp: getFrpConfig(),
  };
}

module.exports = {
  getSyncStatus,
  pushToCloud,
};
