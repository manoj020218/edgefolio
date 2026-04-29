const XLSX = require('xlsx');
const fs = require('fs');

// Mapping rules: keywords to look for in column headers (case-insensitive)
const COLUMN_MAPPING = {
  employeeId: ['userid', 'pin', 'empid', 'empno', 'id', 'employee id', 'staff id', '工号'],
  date: ['date', 'datetime', 'checktime', 'timestamp', 'attendance date', '日期'],
  checkIn: ['checkin', 'timein', 'in', 'intime', 'check in', '签到', '上班'],
  checkOut: ['checkout', 'timeout', 'out', 'outtime', 'check out', '签退', '下班'],
  // Fallback: if only a "time" column exists, we'll treat it as check-in and need extra logic
  time: ['time', 'punch time', '打卡时间']
};

/**
 * Find the best matching column key based on header text
 * @param {string} header - Original column header
 * @returns {string|null} - Mapped field name ('employeeId', 'date', 'checkIn', 'checkOut', 'time')
 */
function mapColumn(header) {
  if (!header) return null;
  const lowerHeader = String(header).toLowerCase().trim();
  for (const [field, keywords] of Object.entries(COLUMN_MAPPING)) {
    if (keywords.some(keyword => lowerHeader.includes(keyword))) {
      return field;
    }
  }
  return null;
}

/**
 * Detect the structure of the attendance file
 * @param {Object} worksheet - XLSX worksheet object
 * @returns {Object} - Detected column indices and mode
 */
function detectStructure(worksheet) {
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  const headers = [];
  // Assume first row contains headers
  for (let C = range.s.c; C <= range.e.c; C++) {
    const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: C });
    const cell = worksheet[cellAddress];
    const header = cell ? cell.v : '';
    headers.push(header);
  }

  const detected = {
    employeeIdCol: -1,
    dateCol: -1,
    checkInCol: -1,
    checkOutCol: -1,
    timeCol: -1,
    mode: 'separate' // or 'single'
  };

  headers.forEach((header, idx) => {
    const mapped = mapColumn(header);
    if (mapped === 'employeeId') detected.employeeIdCol = idx;
    else if (mapped === 'date') detected.dateCol = idx;
    else if (mapped === 'checkIn') detected.checkInCol = idx;
    else if (mapped === 'checkOut') detected.checkOutCol = idx;
    else if (mapped === 'time') detected.timeCol = idx;
  });

  // Determine mode: if we have both checkIn & checkOut columns -> separate mode
  if (detected.checkInCol !== -1 && detected.checkOutCol !== -1) {
    detected.mode = 'separate';
  } else if (detected.timeCol !== -1) {
    detected.mode = 'single';
  } else if (detected.dateCol !== -1 && (detected.checkInCol !== -1 || detected.checkOutCol !== -1)) {
    detected.mode = 'separate';
  } else {
    throw new Error('Could not detect required columns. Ensure headers match known patterns.');
  }

  return detected;
}

/**
 * Parse separate mode (check-in and check-out in different columns, one row per day)
 * @param {Object} worksheet - XLSX worksheet
 * @param {Object} structure - Detected column indices
 * @returns {Array} - Standardized records
 */
function parseSeparateMode(worksheet, structure) {
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  const startRow = range.s.r + 1; // skip header row
  const endRow = range.e.r;
  const records = [];

  for (let R = startRow; R <= endRow; R++) {
    const employeeId = structure.employeeIdCol !== -1 ? getCellValue(worksheet, R, structure.employeeIdCol) : null;
    const dateRaw = structure.dateCol !== -1 ? getCellValue(worksheet, R, structure.dateCol) : null;
    let checkInRaw = structure.checkInCol !== -1 ? getCellValue(worksheet, R, structure.checkInCol) : null;
    let checkOutRaw = structure.checkOutCol !== -1 ? getCellValue(worksheet, R, structure.checkOutCol) : null;

    // Skip rows with no employee ID or date
    if (!employeeId && !dateRaw) continue;

    // Parse date to ISO format (YYYY-MM-DD)
    let dateObj = null;
    if (dateRaw) {
      dateObj = new Date(dateRaw);
      if (isNaN(dateObj)) dateObj = null;
    }

    // Convert time strings (e.g., "10:25" or Excel serial time)
    const checkIn = parseTimeValue(checkInRaw);
    const checkOut = parseTimeValue(checkOutRaw);

    records.push({
      employeeId: String(employeeId || '').trim(),
      date: dateObj ? dateObj.toISOString().split('T')[0] : '',
      checkIn: checkIn,
      checkOut: checkOut
    });
  }

  return records.filter(rec => rec.employeeId && rec.date);
}

/**
 * Parse single column mode (only one time column, each punch is a separate row)
 * Then aggregate by employee + date: first punch as check-in, last as check-out
 * @param {Object} worksheet - XLSX worksheet
 * @param {Object} structure - Detected column indices
 * @returns {Array} - Standardized records
 */
function parseSingleMode(worksheet, structure) {
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  const startRow = range.s.r + 1;
  const endRow = range.e.r;
  const punches = [];

  for (let R = startRow; R <= endRow; R++) {
    const employeeId = structure.employeeIdCol !== -1 ? getCellValue(worksheet, R, structure.employeeIdCol) : null;
    let dateTimeRaw = structure.dateCol !== -1 ? getCellValue(worksheet, R, structure.dateCol) : null;
    // If no separate date column, try using the time column as full datetime
    if (!dateTimeRaw && structure.timeCol !== -1) {
      dateTimeRaw = getCellValue(worksheet, R, structure.timeCol);
    }

    if (!employeeId || !dateTimeRaw) continue;

    let datetime = new Date(dateTimeRaw);
    if (isNaN(datetime)) {
      // Try to parse if date and time are separate (e.g., date in one column, time in another)
      const timeRaw = structure.timeCol !== -1 ? getCellValue(worksheet, R, structure.timeCol) : null;
      if (timeRaw && dateTimeRaw) {
        datetime = new Date(`${dateTimeRaw} ${timeRaw}`);
      }
    }
    if (isNaN(datetime)) continue;

    punches.push({
      employeeId: String(employeeId).trim(),
      datetime: datetime,
      timeValue: datetime.getHours() * 60 + datetime.getMinutes()
    });
  }

  // Group by employeeId and date
  const grouped = new Map();
  for (const punch of punches) {
    const dateKey = punch.datetime.toISOString().split('T')[0];
    const key = `${punch.employeeId}_${dateKey}`;
    if (!grouped.has(key)) {
      grouped.set(key, { employeeId: punch.employeeId, date: dateKey, punches: [] });
    }
    grouped.get(key).punches.push(punch.datetime);
  }

  // For each day, first punch = check-in, last punch = check-out
  const records = [];
  for (const entry of grouped.values()) {
    const sorted = entry.punches.sort((a, b) => a - b);
    const checkIn = sorted[0];
    const checkOut = sorted[sorted.length - 1];
    records.push({
      employeeId: entry.employeeId,
      date: entry.date,
      checkIn: formatTime(checkIn),
      checkOut: formatTime(checkOut)
    });
  }

  return records;
}

/**
 * Helper: get cell value safely
 */
function getCellValue(worksheet, row, col) {
  const address = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = worksheet[address];
  return cell ? cell.v : null;
}

/**
 * Parse a time value (Excel serial time, string "HH:MM", or Date object)
 */
function parseTimeValue(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return formatTime(value);
  }
  if (typeof value === 'number') {
    // Excel serial time (fraction of day)
    const totalSeconds = Math.round(value * 86400);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }
  const str = String(value).trim();
  // Match HH:MM or H:MM
  const timeMatch = str.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    return `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
  }
  return str;
}

function formatTime(date) {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Main function to process an attendance Excel file
 * @param {string|Buffer} input - File path or buffer
 * @param {Object} options - Optional settings
 * @returns {Object} - Standardized data { records, summary }
 */
function processAttendanceFile(input, options = {}) {
  let workbook;
  if (typeof input === 'string') {
    const buffer = fs.readFileSync(input);
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } else if (Buffer.isBuffer(input)) {
    workbook = XLSX.read(input, { type: 'buffer' });
  } else {
    throw new Error('Input must be a file path or buffer');
  }

  // Use the first sheet by default, or specify sheet name
  const sheetName = options.sheetName || workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  const structure = detectStructure(worksheet);
  let records;
  if (structure.mode === 'separate') {
    records = parseSeparateMode(worksheet, structure);
  } else {
    records = parseSingleMode(worksheet, structure);
  }

  // Summary statistics
  const uniqueEmployees = [...new Set(records.map(r => r.employeeId))];
  const summary = {
    totalRecords: records.length,
    uniqueEmployees: uniqueEmployees.length,
    dateRange: records.length ? {
      from: records.reduce((min, r) => r.date < min ? r.date : min, records[0].date),
      to: records.reduce((max, r) => r.date > max ? r.date : max, records[0].date)
    } : null,
    modeUsed: structure.mode
  };

  return { records, summary };
}

module.exports = { processAttendanceFile, COLUMN_MAPPING };