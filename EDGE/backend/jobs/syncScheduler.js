const { pushToCloud } = require('../services/syncService');
const logger = require('../utils/logger');

function startSyncScheduler({
  intervalMinutes = 240,
  runOnStartup = true,
} = {}) {
  const safeMinutes = Math.max(Number(intervalMinutes) || 240, 1);
  const intervalMs = safeMinutes * 60 * 1000;

  let inFlight = false;

  async function runCycle(trigger) {
    if (inFlight) {
      logger.warn('Sync scheduler cycle skipped because previous cycle is still running', {
        channel: 'sync',
        trigger,
      });
      return;
    }

    inFlight = true;
    const startedAt = Date.now();
    try {
      const result = await pushToCloud();
      logger.info('Sync scheduler cycle completed', {
        channel: 'sync',
        trigger,
        durationMs: Date.now() - startedAt,
        nextSync: result?.status?.next_sync || null,
      });
    } catch (error) {
      logger.error('Sync scheduler cycle failed', {
        channel: 'sync',
        trigger,
        reason: error.message,
      });
    } finally {
      inFlight = false;
    }
  }

  const timer = setInterval(() => {
    runCycle('interval');
  }, intervalMs);
  timer.unref();

  if (runOnStartup) {
    setTimeout(() => {
      runCycle('startup');
    }, 5000).unref();
  }

  logger.info('Sync scheduler started', {
    channel: 'sync',
    intervalMinutes: safeMinutes,
    runOnStartup,
  });

  return {
    name: 'sync',
    runNow: () => runCycle('manual'),
    stop: () => {
      clearInterval(timer);
      logger.info('Sync scheduler stopped', { channel: 'sync' });
    },
  };
}

module.exports = {
  startSyncScheduler,
};
