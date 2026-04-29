const fs = require('fs');
const path = require('path');
const { getDb } = require('../config/database');
const { BACKUP_DIR, LOG_DIR } = require('../config/app');
const logger = require('../utils/logger');

function listFilesSafe(targetDir, extFilter = null) {
  if (!fs.existsSync(targetDir)) return [];
  return fs
    .readdirSync(targetDir)
    .map((name) => path.join(targetDir, name))
    .filter((fullPath) => {
      try {
        return fs.statSync(fullPath).isFile();
      } catch {
        return false;
      }
    })
    .filter((fullPath) => !extFilter || fullPath.toLowerCase().endsWith(extFilter));
}

function pruneBackupFiles(keepCount) {
  const files = listFilesSafe(BACKUP_DIR, '.pbbackup')
    .map((fullPath) => ({
      fullPath,
      name: path.basename(fullPath),
      mtimeMs: fs.statSync(fullPath).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  const toDelete = files.slice(keepCount);
  const deleted = [];
  toDelete.forEach((row) => {
    fs.unlinkSync(row.fullPath);
    deleted.push(row.name);
  });
  return deleted;
}

function pruneBackupRows(deletedBackupFileNames) {
  const db = getDb();
  let deletedRows = 0;

  if (deletedBackupFileNames.length > 0) {
    const placeholders = deletedBackupFileNames.map(() => '?').join(', ');
    const res = db
      .prepare(
        `
        DELETE FROM backups
        WHERE backup_type = 'local'
          AND file_name IN (${placeholders})
        `,
      )
      .run(...deletedBackupFileNames);
    deletedRows += Number(res.changes || 0);
  }

  const localRows = db
    .prepare(
      `
      SELECT backup_id, file_name
      FROM backups
      WHERE backup_type = 'local'
      `,
    )
    .all();

  localRows.forEach((row) => {
    const backupPath = path.join(BACKUP_DIR, row.file_name);
    if (fs.existsSync(backupPath)) return;
    const res = db.prepare('DELETE FROM backups WHERE backup_id = ?').run(row.backup_id);
    deletedRows += Number(res.changes || 0);
  });

  return deletedRows;
}

function pruneOldLogs(retentionDays) {
  const now = Date.now();
  const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;
  const files = listFilesSafe(LOG_DIR, '.log');

  let deleted = 0;
  files.forEach((fullPath) => {
    const stats = fs.statSync(fullPath);
    if (now - stats.mtimeMs <= maxAgeMs) return;
    fs.unlinkSync(fullPath);
    deleted += 1;
  });
  return deleted;
}

function startCleanupScheduler({
  intervalHours = 12,
  keepLocalBackups = 30,
  logRetentionDays = 30,
} = {}) {
  const safeHours = Math.max(Number(intervalHours) || 12, 1);
  const safeKeepBackups = Math.max(Number(keepLocalBackups) || 30, 1);
  const safeLogDays = Math.max(Number(logRetentionDays) || 30, 1);
  const intervalMs = safeHours * 60 * 60 * 1000;

  let inFlight = false;

  function runCycle(trigger) {
    if (inFlight) {
      logger.warn('Cleanup scheduler cycle skipped because previous cycle is still running', {
        trigger,
      });
      return;
    }

    inFlight = true;
    const startedAt = Date.now();

    try {
      const deletedBackupFiles = pruneBackupFiles(safeKeepBackups);
      const deletedBackupRows = pruneBackupRows(deletedBackupFiles);
      const deletedLogs = pruneOldLogs(safeLogDays);

      logger.info('Cleanup scheduler cycle completed', {
        trigger,
        durationMs: Date.now() - startedAt,
        deletedBackupFiles: deletedBackupFiles.length,
        deletedBackupRows,
        deletedLogs,
        keepLocalBackups: safeKeepBackups,
        logRetentionDays: safeLogDays,
      });
    } catch (error) {
      logger.error('Cleanup scheduler cycle failed', {
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

  setTimeout(() => {
    runCycle('startup');
  }, 20000).unref();

  logger.info('Cleanup scheduler started', {
    intervalHours: safeHours,
    keepLocalBackups: safeKeepBackups,
    logRetentionDays: safeLogDays,
  });

  return {
    name: 'cleanup',
    runNow: () => runCycle('manual'),
    stop: () => {
      clearInterval(timer);
      logger.info('Cleanup scheduler stopped');
    },
  };
}

module.exports = {
  startCleanupScheduler,
};
