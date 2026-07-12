'use strict';
const { heartbeat } = require('../services/licenseService');
const logger = require('../utils/logger');

const HEARTBEAT_INTERVAL_HOURS = 24;

function startLicenseHeartbeatScheduler() {
  const intervalMs = HEARTBEAT_INTERVAL_HOURS * 60 * 60 * 1000;

  async function runHeartbeat(trigger) {
    try {
      const result = await heartbeat();
      if (result.ok) {
        logger.info('License heartbeat sent successfully', { channel: 'license', trigger });
      } else {
        // Offline is normal — log at debug level so it doesn't alarm
        logger.info('License heartbeat skipped (network unavailable)', {
          channel: 'license',
          trigger,
          reason: result.error,
        });
      }
    } catch (err) {
      // Never crash the scheduler on heartbeat failure (STAB-01)
      logger.info('License heartbeat error (ignored)', {
        channel: 'license',
        trigger,
        reason: err.message,
      });
    }
  }

  const timer = setInterval(() => {
    runHeartbeat('interval');
  }, intervalMs);
  timer.unref();

  // Run on startup after 60s delay (let DB initialize first)
  setTimeout(() => {
    runHeartbeat('startup');
  }, 60_000).unref();

  logger.info('License heartbeat scheduler started', {
    channel: 'license',
    intervalHours: HEARTBEAT_INTERVAL_HOURS,
  });

  return {
    name: 'license-heartbeat',
    runNow: () => runHeartbeat('manual'),
    stop: () => {
      clearInterval(timer);
      logger.info('License heartbeat scheduler stopped', { channel: 'license' });
    },
  };
}

module.exports = { startLicenseHeartbeatScheduler };
