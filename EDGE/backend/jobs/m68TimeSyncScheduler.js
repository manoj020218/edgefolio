'use strict';
/**
 * m68TimeSyncScheduler.js — Queue a SET_TIME command for every enabled M68 device
 * once per day and on service start.
 *
 * Time sync prevents clock-drift issues like the CST/IST offset bugs seen with U5.
 * The scheduler inserts a SET_TIME command into m68_commands; m68Service picks it up
 * on the device's next receive_cmd poll and delivers the current server time.
 *
 * Skips queuing if a 'pending' SET_TIME already exists for the device (idempotent).
 */

const { randomUUID } = require('crypto');
const { getDb } = require('../config/database');
const logger = require('../utils/logger');

const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000;

function queueSetTimeForAllDevices(trigger) {
  try {
    const db = getDb();
    const devices = db.prepare(
      "SELECT dev_id FROM m68_devices WHERE enabled = 1"
    ).all();

    if (!devices.length) return;

    const hasPending = db.prepare(`
      SELECT 1 FROM m68_commands
      WHERE dev_id = ? AND cmd_code = 'SET_TIME' AND status = 'pending'
      LIMIT 1
    `);
    const insert = db.prepare(`
      INSERT INTO m68_commands (dev_id, trans_id, cmd_code, cmd_param, status, created_at)
      VALUES (?, ?, 'SET_TIME', ?, 'pending', CURRENT_TIMESTAMP)
    `);

    let queued = 0;
    for (const { dev_id } of devices) {
      try {
        if (hasPending.get(dev_id)) continue;  // already pending, skip
        // cmd_param is filled in at delivery time by m68Service (server's live clock)
        insert.run(dev_id, randomUUID(), JSON.stringify({ time: '' }));
        queued++;
      } catch (e) {
        logger.info('[m68-timesync] error queuing for device', { dev_id, error: e.message });
      }
    }

    if (queued > 0) {
      logger.info('[m68-timesync] SET_TIME queued', { trigger, count: queued });
    }
  } catch (e) {
    // STAB-01: never crash the scheduler
    logger.info('[m68-timesync] queueSetTimeForAllDevices error (ignored)', { trigger, error: e.message });
  }
}

function startM68TimeSyncScheduler() {
  // Run immediately on startup (with a short delay to let DB settle)
  const startupTimer = setTimeout(() => {
    queueSetTimeForAllDevices('startup');
  }, 5_000);
  startupTimer.unref();

  // Run daily thereafter
  const dailyTimer = setInterval(() => {
    queueSetTimeForAllDevices('daily');
  }, DAILY_INTERVAL_MS);
  dailyTimer.unref();

  logger.info('[m68-timesync] scheduler started');

  return {
    name: 'm68-time-sync',
    runNow: () => queueSetTimeForAllDevices('manual'),
    stop: () => {
      clearTimeout(startupTimer);
      clearInterval(dailyTimer);
      logger.info('[m68-timesync] scheduler stopped');
    },
  };
}

module.exports = { startM68TimeSyncScheduler };
