const {
  SCHEDULERS_ENABLED,
  SYNC_INTERVAL_MINUTES,
  SYNC_RUN_ON_STARTUP,
  BACKUP_INTERVAL_HOURS,
  BACKUP_RUN_ON_STARTUP,
  BACKUP_KEEP_LOCAL_FILES,
  CLEANUP_INTERVAL_HOURS,
  LOG_RETENTION_DAYS,
  PAYROLL_CHECK_INTERVAL_MINUTES,
  PAYROLL_RUN_DAY,
  PAYROLL_RUN_HOUR,
} = require('../config/app');
const logger = require('../utils/logger');
const { startSyncScheduler } = require('./syncScheduler');
const { startBackupScheduler } = require('./backupScheduler');
const { startPayrollScheduler } = require('./payrollScheduler');
const { startCleanupScheduler } = require('./cleanupScheduler');
const { startLicenseHeartbeatScheduler } = require('./licenseHeartbeatScheduler');
const { startM68TimeSyncScheduler } = require('./m68TimeSyncScheduler');

function startSchedulers() {
  if (!SCHEDULERS_ENABLED) {
    logger.info('Schedulers are disabled by configuration');
    return {
      runners: [],
      stopAll: () => {},
    };
  }

  const runners = [
    startSyncScheduler({
      intervalMinutes: SYNC_INTERVAL_MINUTES,
      runOnStartup: SYNC_RUN_ON_STARTUP,
    }),
    startBackupScheduler({
      intervalHours: BACKUP_INTERVAL_HOURS,
      runOnStartup: BACKUP_RUN_ON_STARTUP,
    }),
    startPayrollScheduler({
      checkIntervalMinutes: PAYROLL_CHECK_INTERVAL_MINUTES,
      runDay: PAYROLL_RUN_DAY,
      runHour: PAYROLL_RUN_HOUR,
    }),
    startCleanupScheduler({
      intervalHours: CLEANUP_INTERVAL_HOURS,
      keepLocalBackups: BACKUP_KEEP_LOCAL_FILES,
      logRetentionDays: LOG_RETENTION_DAYS,
    }),
    startLicenseHeartbeatScheduler(),
    startM68TimeSyncScheduler(),
  ];

  logger.info('All schedulers started', {
    count: runners.length,
    names: runners.map((runner) => runner.name),
  });

  return {
    runners,
    stopAll: () => {
      runners.forEach((runner) => runner.stop());
      logger.info('All schedulers stopped', { count: runners.length });
    },
  };
}

module.exports = {
  startSchedulers,
};
