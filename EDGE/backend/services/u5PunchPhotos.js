'use strict';
/**
 * U5 punch snapshots — stored as JPEG files on THIS PC only (never synced to the cloud).
 *
 * Every /getWorkNoteList row carries `pic_large`, the ~37 KB full-frame camera shot taken at
 * that punch. The device sends it whether we want it or not, so keeping it costs no extra
 * device load. When "Save punch photos" is on, each photo is written to
 *   <storage>/faces/punches/<YYYY-MM-DD>/<deviceSn>_<machineEmpId>_<HHMMSS>.jpg
 * (local date/time) and the staging row keeps only the relative path.
 *
 * Retention: date folders older than `u5_face_photo_retention_days` (default 90) are deleted
 * by the cleanup scheduler.
 */
const fs = require('fs');
const path = require('path');
const { FACES_DIR } = require('../config/app');

const PUNCH_DIR = path.join(FACES_DIR, 'punches');
const DEFAULT_RETENTION_DAYS = 90;

function safePart(value) {
  return String(value || 'x').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40);
}

/**
 * Saves one punch photo. Returns the path relative to PUNCH_DIR, or null if there is no
 * usable photo or the write fails (a missing photo must never block attendance).
 */
function savePunchPhoto(picLarge, { deviceSn, machineEmpId, punchDate, punchTime }) {
  try {
    const b64 = String(picLarge || '').replace(/^data:image\/\w+;base64,/, '');
    if (b64.length < 1000 || !/^\d{4}-\d{2}-\d{2}$/.test(String(punchDate))) return null;
    const time = String(punchTime || '').replace(/:/g, '') || '000000';
    const dir = path.join(PUNCH_DIR, punchDate);
    fs.mkdirSync(dir, { recursive: true });
    const file = `${safePart(deviceSn)}_${safePart(machineEmpId)}_${safePart(time)}.jpg`;
    const full = path.join(dir, file);
    if (!fs.existsSync(full)) fs.writeFileSync(full, Buffer.from(b64, 'base64'));
    return `${punchDate}/${file}`;
  } catch {
    return null;
  }
}

/** Reads a stored photo by its relative path. Returns a Buffer, or null if missing/invalid. */
function readPunchPhoto(relPath) {
  if (!relPath) return null;
  const full = path.resolve(PUNCH_DIR, String(relPath));
  if (!full.startsWith(path.resolve(PUNCH_DIR) + path.sep)) return null;   // no path traversal
  try { return fs.readFileSync(full); } catch { return null; }
}

/** Deletes date folders older than `retentionDays`. Returns the number of folders removed. */
function pruneOldPunchPhotos(retentionDays = DEFAULT_RETENTION_DAYS) {
  const days = Math.max(Number(retentionDays) || DEFAULT_RETENTION_DAYS, 1);
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  let removed = 0;
  let entries = [];
  try { entries = fs.readdirSync(PUNCH_DIR, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    if (e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name) && e.name < cutoff) {
      try { fs.rmSync(path.join(PUNCH_DIR, e.name), { recursive: true, force: true }); removed++; } catch { /* retry next cycle */ }
    }
  }
  return removed;
}

module.exports = { savePunchPhoto, readPunchPhoto, pruneOldPunchPhotos, PUNCH_DIR, DEFAULT_RETENTION_DAYS };
