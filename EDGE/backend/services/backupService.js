'use strict';
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { getDb } = require('../config/database');
const { BACKUP_DIR, STORAGE_BASE, DB_PATH } = require('../config/app');
const logger = require('../utils/logger');

// ─── App preferences (key-value) ─────────────────────────────────────────────
function ensurePrefsTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS app_preferences (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
}

function getPref(key) {
  try {
    const db = getDb();
    ensurePrefsTable(db);
    const row = db.prepare('SELECT value FROM app_preferences WHERE key = ?').get(key);
    return row?.value || null;
  } catch {
    return null;
  }
}

function setPref(key, value) {
  const db = getDb();
  ensurePrefsTable(db);
  db.prepare(`
    INSERT INTO app_preferences (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(key, value);
}

function getCustomBackupPath() { return getPref('custom_backup_path'); }
function setCustomBackupPath(dirPath) { setPref('custom_backup_path', dirPath); }

// ─── Data info (for Settings > Data & Backup) ─────────────────────────────────
function getDataInfo() {
  const db = getDb();
  const lastBackup = db.prepare('SELECT * FROM backups ORDER BY created_at DESC LIMIT 1').get();
  let appVersion = '1.0.0';
  try { appVersion = require('../../package.json').version; } catch {}
  return {
    appVersion,
    dataPath:         STORAGE_BASE,
    dbPath:           DB_PATH,
    customBackupPath: getCustomBackupPath(),
    lastBackup:       lastBackup || null,
  };
}

// ─── List backups ─────────────────────────────────────────────────────────────
function listBackups() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM backups ORDER BY created_at DESC').all();
  logger.info('Fetched backup history', { channel: 'backup', count: rows.length });
  return rows;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function estimateSizeKb(payload) {
  return `${Math.max(Math.round(Buffer.byteLength(JSON.stringify(payload)) / 1024), 1)} KB`;
}

function buildPayload(db) {
  let appVersion = '1.0.0';
  try { appVersion = require('../../package.json').version; } catch {}
  return {
    schemaVersion: 2,
    appVersion,
    createdAt:   new Date().toISOString(),
    employees:   db.prepare('SELECT * FROM employees').all(),
    attendance:  db.prepare('SELECT * FROM attendance_records').all(),
    payrollRuns: db.prepare('SELECT * FROM payroll_runs').all(),
    payslips:    db.prepare('SELECT * FROM payslips').all(),
    leaves:      db.prepare('SELECT * FROM leave_requests').all(),
    expenses:    db.prepare('SELECT * FROM expenses').all(),
    settings:    db.prepare('SELECT * FROM company_settings').all(),
    workingHours:db.prepare('SELECT * FROM working_hours').all(),
    shifts:      db.prepare('SELECT * FROM shifts').all(),
    departments: db.prepare('SELECT * FROM departments').all(),
    holidays:    db.prepare('SELECT * FROM holidays').all(),
    deductions:  db.prepare('SELECT * FROM deductions').all(),
  };
}

// ─── Create local backup ──────────────────────────────────────────────────────
function createLocalBackup() {
  const db = getDb();
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const timestamp  = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName   = `edgefolio-backup-${timestamp}.pbbackup`;
  const filePath   = path.join(BACKUP_DIR, fileName);
  const payload    = buildPayload(db);

  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');

  // Also copy to the user-configured external path
  const customDir = getCustomBackupPath();
  let copiedPath  = null;
  if (customDir) {
    try {
      fs.mkdirSync(customDir, { recursive: true });
      copiedPath = path.join(customDir, fileName);
      fs.copyFileSync(filePath, copiedPath);
      logger.info('Backup copied to external path', { channel: 'backup', copiedPath });
    } catch (err) {
      logger.warn('Could not copy to external backup path', { channel: 'backup', error: err.message });
    }
  }

  const backupId = `BKP-${randomUUID().slice(0, 8).toUpperCase()}`;
  const size     = estimateSizeKb(payload);
  db.prepare(`
    INSERT INTO backups (backup_id, file_name, size, status, backup_type)
    VALUES (?, ?, ?, 'completed', 'local')
  `).run(backupId, fileName, size);

  logger.info('Backup created', { channel: 'backup', backupId, fileName, size });

  return { backupId, fileName, size, path: filePath, externalPath: copiedPath };
}

// Same as createLocalBackup — called automatically before installing an update
function createPreUpdateBackup() {
  logger.info('Creating pre-update safety backup', { channel: 'backup' });
  return createLocalBackup();
}

// ─── Restore from file ────────────────────────────────────────────────────────
function restoreTable(db, table, rows) {
  if (!rows || !rows.length) return;
  const cols   = Object.keys(rows[0]);
  const ph     = cols.map(() => '?').join(', ');
  const stmt   = db.prepare(`INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${ph})`);
  rows.forEach((r) => stmt.run(...cols.map((c) => r[c] ?? null)));
}

function restoreFromFile(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Backup file not found: ${filePath}`);
  const raw     = fs.readFileSync(filePath, 'utf8');
  const payload = JSON.parse(raw);

  if (!payload.createdAt || !Array.isArray(payload.employees)) {
    throw new Error('Invalid backup file — not an EDGEFOLIO backup.');
  }

  const db = getDb();
  const restore = db.transaction(() => {
    db.exec('PRAGMA foreign_keys = OFF');
    // Business data — restore in dependency order
    restoreTable(db, 'company_settings',  payload.settings     || []);
    restoreTable(db, 'working_hours',     payload.workingHours || []);
    restoreTable(db, 'departments',       payload.departments  || []);
    restoreTable(db, 'shifts',            payload.shifts       || []);
    restoreTable(db, 'holidays',          payload.holidays     || []);
    restoreTable(db, 'deductions',        payload.deductions   || []);
    // employees first (referenced by attendance, payslips, leaves)
    if (payload.employees.length) {
      db.exec('DELETE FROM employees');
      restoreTable(db, 'employees', payload.employees);
    }
    if (payload.attendance?.length) {
      db.exec('DELETE FROM attendance_records');
      restoreTable(db, 'attendance_records', payload.attendance);
    }
    if (payload.payrollRuns?.length) {
      db.exec('DELETE FROM payroll_runs');
      restoreTable(db, 'payroll_runs', payload.payrollRuns);
    }
    if (payload.payslips?.length) {
      db.exec('DELETE FROM payslips');
      restoreTable(db, 'payslips', payload.payslips);
    }
    if (payload.leaves?.length) {
      db.exec('DELETE FROM leave_requests');
      restoreTable(db, 'leave_requests', payload.leaves);
    }
    if (payload.expenses?.length) {
      db.exec('DELETE FROM expenses');
      restoreTable(db, 'expenses', payload.expenses);
    }
    db.exec('PRAGMA foreign_keys = ON');
  });

  restore();
  logger.info('Restored from backup', { channel: 'backup', filePath, backupDate: payload.createdAt });

  return {
    restored:    true,
    backupDate:  payload.createdAt,
    appVersion:  payload.appVersion || 'unknown',
    employees:   payload.employees.length,
    attendance:  payload.attendance?.length || 0,
  };
}

// ─── Cloud (stub) ─────────────────────────────────────────────────────────────
function createCloudBackupRequest() {
  const db       = getDb();
  const backupId = `BKP-${randomUUID().slice(0, 8).toUpperCase()}`;
  const fileName = `edgefolio-cloud-backup-${new Date().toISOString().slice(0, 10)}.pbbackup`;
  db.prepare(`
    INSERT INTO backups (backup_id, file_name, size, status, backup_type)
    VALUES (?, ?, 'pending', 'pending', 'gdrive')
  `).run(backupId, fileName);
  return { backupId, fileName, status: 'pending', note: 'Cloud backup queued.' };
}

module.exports = {
  listBackups,
  getDataInfo,
  getCustomBackupPath,
  setCustomBackupPath,
  createLocalBackup,
  createPreUpdateBackup,
  createCloudBackupRequest,
  restoreFromFile,
};
