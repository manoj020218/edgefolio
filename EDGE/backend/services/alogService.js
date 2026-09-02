'use strict';

/**
 * Parses ALOG attendance log files exported from biometric/RFID terminals.
 * Format: tab-delimited, UTF-16 LE or plain ASCII/UTF-8, first line is a header row.
 *
 * Columns are located BY HEADER NAME, not fixed position — different terminal
 * firmwares export different column sets/orders for the same logical fields (e.g.
 * one real-world export has blank filler columns between EnNo/Name and Name/GMNo
 * that shift everything after them by one position; see README_FIRST.md 2026-09-02
 * entry for the file that exposed this). Fixed-position parsing silently reads the
 * wrong column instead of failing loudly, which is worse than not parsing at all.
 *
 * Recognised header names (case-insensitive, first match wins):
 *   id column:        enno, en no
 *   name column:      name
 *   direction column: in/out, inout, mode  (not all terminals report this at all —
 *                      see "no direction column" handling below)
 *   datetime column:  datetime
 *   tmno column:       tmno, tm no
 */

const HEADER_ALIASES = {
  enNo:     ['enno', 'en no'],
  name:     ['name'],
  inOut:    ['in/out', 'inout', 'mode'],
  dateTime: ['datetime'],
  tmNo:     ['tmno', 'tm no'],
};

function decodeBuffer(buffer) {
  if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return buffer.slice(2).toString('utf16le');
  }
  if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
    const swapped = Buffer.alloc(buffer.length - 2);
    for (let i = 0; i < buffer.length - 2; i += 2) {
      swapped[i] = buffer[i + 3];
      swapped[i + 1] = buffer[i + 2];
    }
    return swapped.toString('utf16le');
  }
  return buffer.toString('utf8');
}

// Maps each logical field to a column index by matching the header row's cells
// against HEADER_ALIASES. Returns null for a field whose column doesn't exist in
// this export (e.g. no in/out column at all) rather than guessing a position.
function buildColumnMap(headerCells) {
  const lower = headerCells.map((c) => c.trim().toLowerCase());
  const map = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = lower.findIndex((cell) => aliases.includes(cell));
    map[field] = idx === -1 ? null : idx;
  }
  return map;
}

// Accepts both "YYYY-MM-DD HH:MM[:SS]" and "YYYY/MM/DD HH:MM[:SS]" (the latter is
// what this device's actual export uses — the original regex only accepted
// hyphens, so every record silently failed to match and the whole file was
// rejected with "No valid punch records found").
const DATETIME_RE = /^(\d{4})[/-](\d{2})[/-](\d{2})\s+(\d{2}:\d{2})(:\d{2})?/;

function parseAlogFile(buffer) {
  const text = decodeBuffer(buffer);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('ALOG file is empty or unrecognized');

  const headerCells = lines[0].split(/\t/);
  const cols = buildColumnMap(headerCells);
  if (cols.enNo == null || cols.dateTime == null) {
    throw new Error('ALOG format not recognized — expected EnNo and DateTime columns');
  }

  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(/\t/).map((s) => s.trim());
    const enNo = parts[cols.enNo];
    const dateTime = parts[cols.dateTime];
    if (!enNo || !dateTime) continue;

    const dtMatch = dateTime.match(DATETIME_RE);
    if (!dtMatch) continue;

    const [, y, mo, d, hm] = dtMatch;
    const punchDate = `${y}-${mo}-${d}`; // normalise to ISO regardless of source separator — punch_date is sorted as text downstream
    const punchTime = hm;

    // Not every terminal reports a real per-punch direction (some only ever emit
    // a constant device/mode code here, which is not direction — leave it null
    // rather than fabricate one; machineImportModel.js's commit step treats a
    // null direction as "candidate for both first-in and last-out", which is the
    // correct behaviour for a device that truly doesn't tell you which is which).
    let direction = null;
    if (cols.inOut != null) {
      const raw = (parts[cols.inOut] || '').toLowerCase();
      if (raw === '0' || raw === 'out' || raw === 'out duty') direction = 'out';
      else if (raw === '1' || raw === 'in' || raw === 'in duty') direction = 'in';
    }

    const machineEmpId = String(parseInt(enNo, 10) || enNo);

    records.push({
      machineEmpIdRaw: enNo,
      machineEmpId,
      machineName: (cols.name != null ? parts[cols.name] : '') || '',
      tmNo: (cols.tmNo != null ? parts[cols.tmNo] : '') || '',
      mode: cols.inOut != null ? (parts[cols.inOut] || '') : '',
      direction,
      recordType: 'punch',
      punchDate,
      punchTime,
      rawDateTime: dateTime,
    });
  }

  if (records.length === 0) throw new Error('No valid punch records found in ALOG file');

  const uniqueIds = [...new Set(records.map((r) => r.machineEmpId))];
  return {
    records,
    summary: {
      total: records.length,
      uniqueEmployees: uniqueIds.length,
      machineIds: uniqueIds,
      dateRange: {
        from: records[0].punchDate,
        to: records[records.length - 1].punchDate,
      },
    },
  };
}

module.exports = { parseAlogFile };
