'use strict';
const { getDb } = require('../config/database');
const { workDateFor, addDays } = require('../services/shiftDay');

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
      mapped_employee_id, status, photo_path
    ) VALUES (
      @importBatch, @sourceType, @recordType,
      @machineEmpId, @machineName, @department,
      @punchDate, @punchTime, @direction,
      @checkIn, @checkOut,
      @amIn, @amOut, @pmIn, @pmOut, @overIn, @overOut,
      @hoursOvertime, @lateMins, @earlyLeaveMins, @remark,
      @tmNo, @mode, @rawJson,
      @mappedEmployeeId, @status, @photoPath
    )
  `);

  const tx = db.transaction((rows) => {
    let count = 0;
    for (const r of rows) {
      // A source that already knows the EDGE employee (cloud app punches carry EDGE's own
      // employee id) passes mappedEmployeeId; machines rely on the HR-made ID mappings.
      const mapped = r.mappedEmployeeId || knownMappings[r.machineEmpId] || null;
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
        photoPath:      r.photoPath    || null,
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
           MAX(s.punch_date) AS latest_date,
           -- newest stored punch snapshot, so HR sees the face before linking the ID
           (SELECT p.id FROM machine_import_staging p
             WHERE p.machine_emp_id = s.machine_emp_id AND p.photo_path IS NOT NULL
             ORDER BY p.punch_date DESC, p.punch_time DESC LIMIT 1) AS latest_photo_id
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

  // Group punches by (employee, WORK date) -> first-in and last-out. The work date is the date a
  // shift started, so a 20:00 -> 04:00 night shift stays one record even though its last punch is
  // on the next calendar date (see services/shiftDay.js). Punches carry real date+time stamps.
  const norm = (t) => String(t).length === 5 ? `${t}:00` : String(t);
  const mk = (date, time) => ({ stamp: `${date} ${norm(time)}`, date, time });
  const punchGroups = {};
  const lookupInBatch = (empId, date) => {
    const g = punchGroups[`${empId}::${date}`];
    if (!g || !g.ins.length) return db
      .prepare('SELECT check_in, check_out FROM attendance_records WHERE member_id = ? AND date = ?')
      .get(empId, date) || null;
    const ins = g.ins.map((x) => x.stamp).sort();
    const outs = g.outs.map((x) => x.stamp).sort();
    const first = g.ins.find((x) => x.stamp === ins[0]);
    const last = outs.length ? outs[outs.length - 1] : null;
    return { check_in: first.time, check_out: last && last !== ins[0] ? last.slice(11) : null };
  };
  const rawWorkDate = (p) => {
    try { const w = JSON.parse(p.raw_json || '{}').workDate; return /^\d{4}-\d{2}-\d{2}$/.test(w || '') ? w : null; }
    catch { return null; }
  };
  punches.sort((x, y) =>
    String(x.punch_date).localeCompare(String(y.punch_date)) ||
    String(x.punch_time || '').localeCompare(String(y.punch_time || '')));
  for (const p of punches) {
    const workDate = (p.punch_time && (rawWorkDate(p) || workDateFor(db, p.mapped_employee_id, p.punch_date, p.punch_time, lookupInBatch)))
      || p.punch_date;
    const key = `${p.mapped_employee_id}::${workDate}`;
    if (!punchGroups[key]) {
      punchGroups[key] = { employeeId: p.mapped_employee_id, date: workDate, ins: [], outs: [], ids: [] };
    }
    // Some terminals (e.g. this device's ALOG export — see alogService.js) don't
    // report a real per-punch direction at all; every row's "direction" ends up
    // null. In that case every punch is a candidate for both first-in and
    // last-out — checkIn = earliest punch of the day, checkOut = latest — which
    // is the standard punch-clock convention and matches what min(ins)/max(outs)
    // below already compute. Devices that DO report direction keep their exact
    // in/out split, unaffected.
    // The U5 face terminal reports no direction either; older U5 staging rows were
    // hard-coded 'in', which meant a U5 day never got a check-out. Treat U5 as directionless.
    const direction = p.source_type === 'u5_face' ? null : p.direction;
    if (p.punch_time && (direction === 'in'  || direction == null)) punchGroups[key].ins.push(mk(p.punch_date, p.punch_time));
    if (p.punch_time && (direction === 'out' || direction == null)) punchGroups[key].outs.push(mk(p.punch_date, p.punch_time));
    punchGroups[key].ids.push(p.id);
  }

  // Merge with the attendance already saved for that day. Punches for one day can arrive
  // in several commits (the U5 poll stages new punches every 30 s); without this a later
  // commit replaced the earlier check-in with its own, later, first punch.
  const getExisting = db.prepare('SELECT check_in, check_out, overnight FROM attendance_records WHERE member_id = ? AND date = ?');

  const markDone  = db.prepare("UPDATE machine_import_staging SET status = 'committed' WHERE id = ?");
  const markError = db.prepare("UPDATE machine_import_staging SET status = 'error' WHERE id = ?");

  let committed = 0, skipped = 0;
  const errors = [];

  db.transaction(() => {
    for (const group of Object.values(punchGroups)) {
      const existing = getExisting.get(group.employeeId, group.date);
      const ins  = group.ins.slice();
      const outs = group.outs.slice();
      if (existing && existing.check_in) ins.push(mk(group.date, existing.check_in));
      if (existing && existing.check_out) {
        const nextDay = existing.overnight || (existing.check_in && existing.check_out < existing.check_in);
        outs.push(mk(nextDay ? addDays(group.date, 1) : group.date, existing.check_out));
      }
      ins.sort((x, y) => x.stamp.localeCompare(y.stamp));
      outs.sort((x, y) => x.stamp.localeCompare(y.stamp));
      const inP  = ins[0] || null;
      let   outP = outs[outs.length - 1] || null;
      // A directionless single punch is both "first" and "last" -- that's a check-in only.
      if (outP && inP && outP.stamp === inP.stamp) outP = null;
      const checkIn  = inP ? inP.time : null;
      const checkOut = outP ? outP.time : null;
      const overnight = outP && outP.date > group.date ? 1 : 0;
      try {
        upsertAttendanceEvent({
          memberId: group.employeeId,
          date: group.date,
          checkIn,
          checkOut,
          overnight,
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

// Removes a staged batch entirely — for duplicate/accidental re-uploads (people
// retry when a first attempt doesn't look right, same file staged repeatedly).
// Only removes staging rows, never touches attendance_records — a batch whose
// records were already committed leaves the real attendance data untouched,
// this just cleans up the now-redundant staging bookkeeping for it.
function deleteBatch(batchId) {
  const db = getDb();
  const result = db.prepare('DELETE FROM machine_import_staging WHERE import_batch = ?').run(batchId);
  return { batchId, deleted: result.changes };
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
  deleteBatch,
};
