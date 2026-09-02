'use strict';
const { getDb } = require('../config/database');

function stageRecords(batchId, sourceType, records) {
  const db = getDb();

  // Load all known mappings upfront to auto-apply
  const knownMappings = {};
  db.prepare('SELECT machine_emp_id, employee_id FROM machine_id_mappings').all()
    .forEach(m => { knownMappings[m.machine_emp_id] = m.employee_id; });

  const insert = db.prepare(`
    INSERT INTO machine_import_staging (
      import_batch, source_type, record_type,
      machine_emp_id, machine_name, department,
      punch_date, punch_time, direction,
      check_in, check_out,
      am_in, am_out, pm_in, pm_out, over_in, over_out,
      hours_overtime, late_mins, early_leave_mins, remark,
      tm_no, mode, raw_json,
      mapped_employee_id, status
    ) VALUES (
      @importBatch, @sourceType, @recordType,
      @machineEmpId, @machineName, @department,
      @punchDate, @punchTime, @direction,
      @checkIn, @checkOut,
      @amIn, @amOut, @pmIn, @pmOut, @overIn, @overOut,
      @hoursOvertime, @lateMins, @earlyLeaveMins, @remark,
      @tmNo, @mode, @rawJson,
      @mappedEmployeeId, @status
    )
  `);

  const tx = db.transaction((rows) => {
    let count = 0;
    for (const r of rows) {
      const mapped = knownMappings[r.machineEmpId] || null;
      insert.run({
        importBatch:    batchId,
        sourceType,
        recordType:     r.recordType || 'punch',
        machineEmpId:   r.machineEmpId,
        machineName:    r.machineName  || null,
        department:     r.department   || null,
        punchDate:      r.punchDate,
        punchTime:      r.punchTime    || null,
        direction:      r.direction    || null,
        checkIn:        r.checkIn      || null,
        checkOut:       r.checkOut     || null,
        amIn:           r.amIn         || null,
        amOut:          r.amOut        || null,
        pmIn:           r.pmIn         || null,
        pmOut:          r.pmOut        || null,
        overIn:         r.overIn       || null,
        overOut:        r.overOut      || null,
        hoursOvertime:  r.hoursOvertime || null,
        lateMins:       r.lateMins     || null,
        earlyLeaveMins: r.earlyLeaveMins || null,
        remark:         r.remark       || null,
        tmNo:           r.tmNo         || null,
        mode:           r.mode         || null,
        rawJson:        JSON.stringify(r),
        mappedEmployeeId: mapped,
        status:         mapped ? 'mapped' : 'pending',
      });
      count++;
    }
    return count;
  });

  return { staged: tx(records), batchId };
}

function listUnmappedIds() {
  return getDb().prepare(`
    SELECT s.machine_emp_id,
           MAX(s.machine_name) AS machine_name,
           COUNT(*) AS record_count,
           MIN(s.punch_date) AS earliest_date,
           MAX(s.punch_date) AS latest_date
    FROM machine_import_staging s
    WHERE s.status = 'pending'
    GROUP BY s.machine_emp_id
    ORDER BY CAST(s.machine_emp_id AS INTEGER), s.machine_emp_id
  `).all();
}

function saveMappings(mappings) {
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO machine_id_mappings (machine_emp_id, employee_id, machine_name)
    VALUES (@machineEmpId, @employeeId, @machineName)
    ON CONFLICT(machine_emp_id) DO UPDATE
      SET employee_id  = excluded.employee_id,
          machine_name = COALESCE(excluded.machine_name, machine_name)
  `);
  const updateStaging = db.prepare(`
    UPDATE machine_import_staging
    SET mapped_employee_id = ?, status = 'mapped'
    WHERE machine_emp_id = ? AND status = 'pending'
  `);

  db.transaction((maps) => {
    for (const m of maps) {
      upsert.run({ machineEmpId: m.machineEmpId, employeeId: m.employeeId, machineName: m.machineName || null });
      updateStaging.run(m.employeeId, m.machineEmpId);
    }
  })(mappings);

  return { saved: mappings.length };
}

function getMappings() {
  return getDb().prepare(`
    SELECT m.machine_emp_id, m.machine_name, m.employee_id,
           e.name AS employee_name, e.emp_code, e.department
    FROM machine_id_mappings m
    LEFT JOIN employees e ON e.id = m.employee_id
    ORDER BY CAST(m.machine_emp_id AS INTEGER), m.machine_emp_id
  `).all();
}

function deleteMappings(machineEmpIds) {
  const db = getDb();
  const del = db.prepare('DELETE FROM machine_id_mappings WHERE machine_emp_id = ?');
  const revert = db.prepare(`
    UPDATE machine_import_staging SET mapped_employee_id = NULL, status = 'pending'
    WHERE machine_emp_id = ? AND status = 'mapped'
  `);
  db.transaction((ids) => {
    for (const id of ids) { del.run(id); revert.run(id); }
  })(machineEmpIds);
  return { deleted: machineEmpIds.length };
}

function commitMappedRecords(batchId = null) {
  const db = getDb();
  const { upsertAttendanceEvent } = require('./attendance');

  const query = batchId
    ? "SELECT * FROM machine_import_staging WHERE status = 'mapped' AND import_batch = ? ORDER BY punch_date, machine_emp_id"
    : "SELECT * FROM machine_import_staging WHERE status = 'mapped' ORDER BY punch_date, machine_emp_id";
  const staged = batchId
    ? db.prepare(query).all(batchId)
    : db.prepare(query).all();

  if (staged.length === 0) return { committed: 0, skipped: 0, errors: [] };

  const punches = staged.filter(r => r.record_type === 'punch');
  const dailies = staged.filter(r => r.record_type === 'daily');

  // Group ALOG punches by (employee, date) → find first-in and last-out
  const punchGroups = {};
  for (const p of punches) {
    const key = `${p.mapped_employee_id}::${p.punch_date}`;
    if (!punchGroups[key]) {
      punchGroups[key] = { employeeId: p.mapped_employee_id, date: p.punch_date, ins: [], outs: [], ids: [] };
    }
    // Some terminals (e.g. this device's ALOG export — see alogService.js) don't
    // report a real per-punch direction at all; every row's "direction" ends up
    // null. In that case every punch is a candidate for both first-in and
    // last-out — checkIn = earliest punch of the day, checkOut = latest — which
    // is the standard punch-clock convention and matches what min(ins)/max(outs)
    // below already compute. Devices that DO report direction keep their exact
    // in/out split, unaffected.
    if (p.punch_time && (p.direction === 'in'  || p.direction == null)) punchGroups[key].ins.push(p.punch_time);
    if (p.punch_time && (p.direction === 'out' || p.direction == null)) punchGroups[key].outs.push(p.punch_time);
    punchGroups[key].ids.push(p.id);
  }

  const markDone  = db.prepare("UPDATE machine_import_staging SET status = 'committed' WHERE id = ?");
  const markError = db.prepare("UPDATE machine_import_staging SET status = 'error' WHERE id = ?");

  let committed = 0, skipped = 0;
  const errors = [];

  db.transaction(() => {
    for (const group of Object.values(punchGroups)) {
      const checkIn  = group.ins.sort()[0]  || null;
      const checkOut = group.outs.sort().reverse()[0] || null;
      try {
        upsertAttendanceEvent({
          memberId: group.employeeId,
          date: group.date,
          checkIn,
          checkOut,
          status: checkIn || checkOut ? 'present' : 'absent',
          faceMatch: 0,
          attendance_mode: 'machine',
          device_id: 'machine-import',
          apk_source: 0,
        });
        group.ids.forEach(id => markDone.run(id));
        committed++;
      } catch (e) {
        group.ids.forEach(id => markError.run(id));
        errors.push({ group: `${group.employeeId}:${group.date}`, error: e.message });
        skipped++;
      }
    }

    for (const rec of dailies) {
      try {
        upsertAttendanceEvent({
          memberId: rec.mapped_employee_id,
          date: rec.punch_date,
          checkIn:  rec.check_in  || null,
          checkOut: rec.check_out || null,
          status: rec.check_in || rec.check_out ? 'present' : 'absent',
          faceMatch: 0,
          attendance_mode: 'machine',
          device_id: 'machine-import',
          apk_source: 0,
        });
        markDone.run(rec.id);
        committed++;
      } catch (e) {
        markError.run(rec.id);
        errors.push({ id: rec.id, employee: rec.mapped_employee_id, date: rec.punch_date, error: e.message });
        skipped++;
      }
    }
  })();

  return { committed, skipped, errors };
}

function getStagingSummary(batchId = null) {
  const db = getDb();
  if (batchId) {
    return db.prepare(`
      SELECT import_batch, source_type, status, COUNT(*) AS count
      FROM machine_import_staging WHERE import_batch = ?
      GROUP BY import_batch, source_type, status
    `).all(batchId);
  }
  return db.prepare(`
    SELECT import_batch, source_type, status, COUNT(*) AS count
    FROM machine_import_staging
    GROUP BY import_batch, source_type, status
    ORDER BY import_batch DESC
  `).all();
}

function listBatches() {
  return getDb().prepare(`
    SELECT import_batch, source_type,
           COUNT(*) AS total_records,
           SUM(CASE WHEN status = 'pending'   THEN 1 ELSE 0 END) AS pending,
           SUM(CASE WHEN status = 'mapped'    THEN 1 ELSE 0 END) AS mapped,
           SUM(CASE WHEN status = 'committed' THEN 1 ELSE 0 END) AS committed,
           SUM(CASE WHEN status = 'error'     THEN 1 ELSE 0 END) AS errored,
           MIN(punch_date) AS date_from,
           MAX(punch_date) AS date_to,
           MAX(created_at) AS imported_at
    FROM machine_import_staging
    GROUP BY import_batch, source_type
    ORDER BY imported_at DESC
  `).all();
}

module.exports = {
  stageRecords,
  listUnmappedIds,
  saveMappings,
  getMappings,
  deleteMappings,
  commitMappedRecords,
  getStagingSummary,
  listBatches,
};
