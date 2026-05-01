const XLSX = require('xlsx');

function processAttendanceFile(buffer, options = {}) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  let sheetName = options.sheetName || '1.2.3';
  if (!workbook.SheetNames.includes(sheetName)) {
    const candidates = ['1.2.3', '4.5.6', '7.8.9'];
    for (const cand of candidates) {
      if (workbook.SheetNames.includes(cand)) {
        sheetName = cand;
        break;
      }
    }
  }
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!data.length) throw new Error('Sheet is empty');

  // Extract period (year/month)
  let periodStr = '';
  if (data[1] && data[1][2]) periodStr = String(data[1][2]);
  const yearMonthMatch = periodStr.match(/(\d{4})\/(\d{2})/);
  const year = yearMonthMatch ? yearMonthMatch[1] : '2026';
  const month = yearMonthMatch ? yearMonthMatch[2] : '03';
  const yearMonth = `${year}/${month}`;
  const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();

  // Define the three blocks (same as before)
  const blocks = [
    { startCol: 0, ddCol: 0, amInCol: 1, amOutCol: 3, pmInCol: 6, pmOutCol: 8, overInCol: 10, overOutCol: 12 },
    { startCol: 15, ddCol: 15, amInCol: 16, amOutCol: 18, pmInCol: 21, pmOutCol: 23, overInCol: 25, overOutCol: 27 },
    { startCol: 30, ddCol: 30, amInCol: 31, amOutCol: 33, pmInCol: 36, pmOutCol: 38, overInCol: 40, overOutCol: 42 }
  ];

  // Helper: convert Excel column letter to index
  function colLetterToIndex(letter) {
    let idx = 0;
    for (let i = 0; i < letter.length; i++) {
      idx = idx * 26 + (letter.charCodeAt(i) - 64);
    }
    return idx - 1;
  }

  // Get employee details from rows 3 and 4 (index 2 and 3)
  const rowNames = data[2];
  const rowNo    = data[3];
  const employees = [];

  for (const block of blocks) {
    let empId = null;
    let empName = null;
    // Find "Name"
    for (let c = block.startCol; c <= block.startCol + 12; c++) {
      const cell = rowNames[c] ? String(rowNames[c]).trim() : '';
      if (cell === 'Name') {
        const nameCandidate = rowNames[c+2] ? String(rowNames[c+2]).trim() : '';
        if (nameCandidate && nameCandidate !== 'ta' && nameCandidate !== 'Dept') {
          empName = nameCandidate;
        }
        break;
      }
    }
    // Find "No."
    for (let c = block.startCol; c <= block.startCol + 12; c++) {
      const cell = rowNo[c] ? String(rowNo[c]).trim() : '';
      if (cell === 'No' || cell === 'No.') {
        const idCandidate = rowNo[c+1] ? String(rowNo[c+1]).trim() : '';
        if (idCandidate && !isNaN(parseInt(idCandidate))) {
          empId = idCandidate;
        }
        break;
      }
    }
    if (!empName && !empId) continue;
    employees.push({ empId: empId || empName, empName, block });
  }

  // Build a map: for each employee, for each day (1..daysInMonth), store checkIn/checkOut
  const records = [];
  const dataStartRow = 11; // row 12 (0‑based)
  for (const emp of employees) {
    // Initialize all days as absent
    const dayData = {};
    for (let d = 1; d <= daysInMonth; d++) {
      dayData[d] = { checkIn: null, checkOut: null, hasData: false };
    }

    // Parse actual attendance from the Excel rows
    for (let rowIdx = dataStartRow; rowIdx < data.length && rowIdx <= 41; rowIdx++) {
      const row = data[rowIdx];
      if (!row) continue;
      const b = emp.block;
      const ddCell = row[b.ddCol];
      if (!ddCell) continue;
      const ddStr = String(ddCell).trim();
      const match = ddStr.match(/^(\d{2})/);
      if (!match) continue;
      const dayNum = parseInt(match[1]);
      if (dayNum < 1 || dayNum > daysInMonth) continue;

      const amIn   = row[b.amInCol]   ? String(row[b.amInCol]).trim() : '';
      const amOut  = row[b.amOutCol]  ? String(row[b.amOutCol]).trim() : '';
      const pmIn   = row[b.pmInCol]   ? String(row[b.pmInCol]).trim() : '';
      const pmOut  = row[b.pmOutCol]  ? String(row[b.pmOutCol]).trim() : '';
      const overIn = row[b.overInCol] ? String(row[b.overInCol]).trim() : '';
      const overOut= row[b.overOutCol]? String(row[b.overOutCol]).trim() : '';

      // Skip if explicitly "Absence" (no data at all)
      if (amIn === 'Absence' || pmIn === 'Absence') {
        dayData[dayNum] = { checkIn: null, checkOut: null, hasData: false };
        continue;
      }

      let checkIn = amIn || pmIn || overIn;
      let checkOut = overOut || pmOut || amOut;

      if (checkIn || checkOut) {
        dayData[dayNum] = { checkIn: checkIn || null, checkOut: checkOut || null, hasData: true };
      }
    }

    // Create records for every day with status code
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${yearMonth}/${d.toString().padStart(2, '0')}`;
      const data = dayData[d];
      let status = 'AB'; // default absent
      if (data.hasData && data.checkIn && data.checkOut) {
        status = 'PR'; // present (full day)
      } else if (data.hasData && (data.checkIn || data.checkOut)) {
        status = 'HD'; // half day (optional)
      }
      records.push({
        employeeId: emp.empId,
        employeeName: emp.empName,
        date: date,
        checkIn: data.checkIn || null,
        checkOut: data.checkOut || null,
        status: status   // "AB", "PR", "HD"
      });
    }
  }

  if (records.length === 0) throw new Error('No records generated');

  const summary = {
    totalRecords: records.length,
    uniqueEmployees: [...new Set(records.map(r => r.employeeId))].length,
    dateRange: { from: records[0].date, to: records[records.length-1].date },
    modeUsed: 'full_month_with_status'
  };
  return { records, summary };
}

/**
 * Same parsing logic but returns staging-ready records with ALL raw column data.
 * Records go to machine_import_staging (not attendance_records directly).
 */
function processForStaging(buffer, options = {}) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  let sheetName = options.sheetName || '1.2.3';
  if (!workbook.SheetNames.includes(sheetName)) {
    const candidates = ['1.2.3', '4.5.6', '7.8.9'];
    for (const cand of candidates) {
      if (workbook.SheetNames.includes(cand)) { sheetName = cand; break; }
    }
  }
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!data.length) throw new Error('Sheet is empty');

  let periodStr = '';
  if (data[1] && data[1][2]) periodStr = String(data[1][2]);
  const yearMonthMatch = periodStr.match(/(\d{4})\/(\d{2})/);
  const year = yearMonthMatch ? yearMonthMatch[1] : '2026';
  const month = yearMonthMatch ? yearMonthMatch[2] : '03';
  const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();

  const blocks = [
    { startCol: 0,  ddCol: 0,  amInCol: 1,  amOutCol: 3,  pmInCol: 6,  pmOutCol: 8,  overInCol: 10, overOutCol: 12, otHrsCol: 13, lateCol: 14 },
    { startCol: 15, ddCol: 15, amInCol: 16, amOutCol: 18, pmInCol: 21, pmOutCol: 23, overInCol: 25, overOutCol: 27, otHrsCol: 28, lateCol: 29 },
    { startCol: 30, ddCol: 30, amInCol: 31, amOutCol: 33, pmInCol: 36, pmOutCol: 38, overInCol: 40, overOutCol: 42, otHrsCol: 43, lateCol: 44 },
  ];

  const rowNames = data[2];
  const rowNo    = data[3];

  // Extract department from row 2 (often at block.startCol+1 or +3)
  function getDeptForBlock(b) {
    for (let c = b.startCol; c <= b.startCol + 4; c++) {
      const cell = rowNames[c] ? String(rowNames[c]).trim() : '';
      if (cell && cell !== 'Name' && cell !== 'No' && cell !== 'No.' && cell.length > 1) return cell;
    }
    return null;
  }

  const employees = [];
  for (const block of blocks) {
    let empId = null, empName = null;
    for (let c = block.startCol; c <= block.startCol + 12; c++) {
      const cell = rowNames[c] ? String(rowNames[c]).trim() : '';
      if (cell === 'Name') {
        const nc = rowNames[c + 2] ? String(rowNames[c + 2]).trim() : '';
        if (nc && nc !== 'ta' && nc !== 'Dept') empName = nc;
        break;
      }
    }
    for (let c = block.startCol; c <= block.startCol + 12; c++) {
      const cell = rowNo[c] ? String(rowNo[c]).trim() : '';
      if (cell === 'No' || cell === 'No.') {
        const ic = rowNo[c + 1] ? String(rowNo[c + 1]).trim() : '';
        if (ic && !isNaN(parseInt(ic))) empId = ic;
        break;
      }
    }
    if (!empName && !empId) continue;
    employees.push({ empId: empId || empName, empName, department: getDeptForBlock(block), block });
  }

  const stagingRecords = [];
  const dataStartRow = 11;

  for (const emp of employees) {
    for (let rowIdx = dataStartRow; rowIdx < data.length && rowIdx <= 41; rowIdx++) {
      const row = data[rowIdx];
      if (!row) continue;
      const b = emp.block;
      const ddCell = row[b.ddCol];
      if (!ddCell) continue;
      const ddStr = String(ddCell).trim();
      const match = ddStr.match(/^(\d{2})/);
      if (!match) continue;
      const dayNum = parseInt(match[1]);
      if (dayNum < 1 || dayNum > daysInMonth) continue;

      const val = (col) => (row[col] !== undefined && row[col] !== null ? String(row[col]).trim() : null) || null;

      const amIn   = val(b.amInCol);
      const amOut  = val(b.amOutCol);
      const pmIn   = val(b.pmInCol);
      const pmOut  = val(b.pmOutCol);
      const overIn = val(b.overInCol);
      const overOut= val(b.overOutCol);
      const otHrs  = val(b.otHrsCol);
      const lateMins = val(b.lateCol);

      const isAbsence = amIn === 'Absence' || pmIn === 'Absence';
      const checkIn  = isAbsence ? null : (amIn || pmIn || overIn);
      const checkOut = isAbsence ? null : (overOut || pmOut || amOut);

      const dateStr = `${year}-${month}-${String(dayNum).padStart(2, '0')}`;
      const wkday = ddStr.slice(2).trim() || null;

      stagingRecords.push({
        recordType:   'daily',
        machineEmpId: emp.empId,
        machineName:  emp.empName || null,
        department:   emp.department || null,
        punchDate:    dateStr,
        weekday:      wkday,
        checkIn,
        checkOut,
        amIn,
        amOut,
        pmIn,
        pmOut,
        overIn,
        overOut,
        hoursOvertime: otHrs,
        lateMins,
        earlyLeaveMins: null,
        remark: isAbsence ? 'AB' : null,
      });
    }
  }

  if (stagingRecords.length === 0) throw new Error('No records generated for staging');

  const uniqueIds = [...new Set(stagingRecords.map(r => r.machineEmpId))];
  return {
    records: stagingRecords,
    summary: {
      total: stagingRecords.length,
      uniqueEmployees: uniqueIds.length,
      machineIds: uniqueIds,
      period: `${year}/${month}`,
    },
  };
}

module.exports = { processAttendanceFile, processForStaging };