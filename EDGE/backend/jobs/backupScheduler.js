const { createLocalBackup } = require('../services/backupService');
const logger = require('../utils/logger');

function startBackupScheduler({
  intervalHours = 24,
  runOnStartup = false,
} = {}) {
  const safeHours = Math.max(Number(intervalHours) || 24, 1);
  const intervalMs = safeHours * 60 * 60 * 1000;

  let inFlight = false;

  function runCycle(trigger) {
    if (inFlight) {
      logger.warn('Backup scheduler cycle skipped because previous cycle is still running', {
        channel: 'backup',
        trigger,
      });
      return;
    }

    inFlight = true;
    const startedAt = Date.now();
    try {
      const backup = createLocalBackup();
      logger.info('Backup scheduler cycle completed', {
        channel: 'backup',
        trigger,
        durationMs: Date.now() - startedAt,
        backupId: backup.backupId,
        fileName: backup.fileName,
      });
    } catch (error) {
      logger.error('Backup scheduler cycle failed', {
        channel: 'backup',
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
    }, 10000).unref();
  }

  logger.info('Backup scheduler started', {
    channel: 'backup',
    intervalHours: safeHours,
    runOnStartup,
  });

  return {
    name: 'backup',
    runNow: () => runCycle('manual'),
    stop: () => {
      clearInterval(timer);
      logger.info('Backup scheduler stopped', { channel: 'backup' });
    },
  };
}

module.exports = {
  startBackupScheduler,
};
