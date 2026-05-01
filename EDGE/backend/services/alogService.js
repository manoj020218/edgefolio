'use strict';

/**
 * Parses ALOG attendance log files exported from biometric/RFID terminals.
 * Format: tab-delimited, UTF-16 LE encoded.
 * Columns: No, TMNo, EnNo, Name, GMNo, Mode, In/Out, Antipass, ProxyWork, DateTime
 */
function parseAlogFile(buffer) {
  let text;
  // Detect encoding by BOM
  if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
    text = buffer.slice(2).toString('utf16le');
  } else if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
    // UTF-16 BE — swap bytes
    const swapped = Buffer.alloc(buffer.length - 2);
    for (let i = 0; i < buffer.length - 2; i += 2) {
      swapped[i] = buffer[i + 3];
      swapped[i + 1] = buffer[i + 2];
    }
    text = swapped.toString('utf16le');
  } else {
    text = buffer.toString('utf8');
  }

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('ALOG file is empty or unrecognized');

  const header = lines[0].toLowerCase();
  if (!header.includes('enno') && !header.includes('datetime') && !header.includes('en no')) {
    throw new Error('ALOG format not recognized — expected EnNo and DateTime columns');
  }

  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(/\t/);
    if (parts.length < 10) continue;

    const [, tmNo, enNo, name, , mode, inOut, , , dateTime] = parts.map(s => s.trim());
    if (!enNo || !dateTime) continue;

    const dtMatch = dateTime.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(:\d{2})?)/);
    if (!dtMatch) continue;

    const punchDate = dtMatch[1];
    const punchTime = dtMatch[2].slice(0, 5); // HH:MM only
    // strip leading zeros: "00000001" → "1"
    const machineEmpId = String(parseInt(enNo, 10) || enNo);

    records.push({
      machineEmpIdRaw: enNo,
      machineEmpId,
      machineName: name || '',
      tmNo: tmNo || '',
      mode: mode || '',
      direction: inOut === '0' ? 'out' : 'in',
      recordType: 'punch',
      punchDate,
      punchTime,
      rawDateTime: dateTime,
    });
  }

  if (records.length === 0) throw new Error('No valid punch records found in ALOG file');

  const uniqueIds = [...new Set(records.map(r => r.machineEmpId))];
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
