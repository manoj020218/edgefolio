const path = require('path');

const EDGE_ROOT = path.resolve(__dirname, '..', '..');
// In packaged Electron, EDGEFOLIO_STORAGE_PATH / EDGEFOLIO_LOG_PATH are set
// by electron/main.js to app.getPath('userData') subdirs — outside the asar.
const STORAGE_BASE = process.env.EDGEFOLIO_STORAGE_PATH || path.join(EDGE_ROOT, 'storage');
const STORAGE_DIR = path.join(STORAGE_BASE, 'database');
const BACKUP_DIR = path.join(STORAGE_BASE, 'backups');
const FACES_DIR = path.join(STORAGE_BASE, 'faces');
const LOG_DIR = process.env.EDGEFOLIO_LOG_PATH || path.join(EDGE_ROOT, 'logs');
const IS_TEST = process.env.NODE_ENV === 'test';

function toBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function toNumber(value, fallback, min = Number.MIN_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(parsed, min);
}

module.exports = {
  EDGE_ROOT,
  STORAGE_BASE,
  STORAGE_DIR,
  BACKUP_DIR,
  FACES_DIR,
  LOG_DIR,
  EDGE_ID: process.env.EDGE_ID || 'edgefolio-local',
  NODE_ENV: process.env.NODE_ENV || 'development',
  HOST: process.env.HOST || '127.0.0.1',
  PORT: Number(process.env.PORT || 7001),
  API_PREFIX: '/api/v1',
  DB_PATH:
    process.env.EDGEFOLIO_DB_PATH ||
    path.join(STORAGE_DIR, IS_TEST ? 'edgefolio-test.db' : 'edgefolio.db'),
  CLOUD_SYNC_BASE_URL:
    process.env.CLOUD_SYNC_BASE_URL || 'https://edgefolio.iotsoft.in/api/v1',
  SCHEDULERS_ENABLED: toBoolean(process.env.SCHEDULERS_ENABLED, !IS_TEST),
  SYNC_INTERVAL_MINUTES: toNumber(process.env.SYNC_INTERVAL_MINUTES, 240, 1),
  SYNC_RUN_ON_STARTUP: toBoolean(process.env.SYNC_RUN_ON_STARTUP, true),
  BACKUP_INTERVAL_HOURS: toNumber(process.env.BACKUP_INTERVAL_HOURS, 24, 1),
  BACKUP_RUN_ON_STARTUP: toBoolean(process.env.BACKUP_RUN_ON_STARTUP, false),
  BACKUP_KEEP_LOCAL_FILES: toNumber(process.env.BACKUP_KEEP_LOCAL_FILES, 30, 1),
  CLEANUP_INTERVAL_HOURS: toNumber(process.env.CLEANUP_INTERVAL_HOURS, 12, 1),
  LOG_RETENTION_DAYS: toNumber(process.env.LOG_RETENTION_DAYS, 30, 1),
  PAYROLL_CHECK_INTERVAL_MINUTES: toNumber(
    process.env.PAYROLL_CHECK_INTERVAL_MINUTES,
    60,
    1,
  ),
  PAYROLL_RUN_DAY: toNumber(process.env.PAYROLL_RUN_DAY, 1, 1),
  PAYROLL_RUN_HOUR: toNumber(process.env.PAYROLL_RUN_HOUR, 2, 0),
};
