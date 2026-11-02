'use strict';
// Runs EdgeFolio Cloud sync every 2 minutes when this PC is connected (cloudSyncService.runSync
// is a no-op otherwise and never throws).
const { runSync } = require('../services/cloudSyncService');
const logger = require('../utils/logger');

const INTERVAL_MS = 2 * 60 * 1000;

function startCloudSyncScheduler() {
  const run = (trigger) => runSync(trigger).catch(() => {});
  const timer = setInterval(() => run('interval'), INTERVAL_MS);
  timer.unref();
  setTimeout(() => run('startup'), 30_000).unref();
  logger.info('Cloud sync scheduler started', { channel: 'cloud', intervalSec: INTERVAL_MS / 1000 });
  return {
    name: 'cloud-sync',
    runNow: () => run('manual'),
    stop: () => { clearInterval(timer); logger.info('Cloud sync scheduler stopped', { channel: 'cloud' }); },
  };
}

module.exports = { startCloudSyncScheduler };
