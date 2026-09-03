'use strict';
const { randomUUID } = require('crypto');
const { getDb } = require('../config/database');
const { listDistinctDepartmentsAndDesignations } = require('./salaryPolicy');

function toISODate(d) { return d.toISOString().split('T')[0]; }

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

// ─── Resolution ─────────────────────────────────────────────────────────────

// Which structure GROUP applies to this employee — precedence: employee
// override > designation assignment > department assignment > the
// always-present default group. Doesn't care about dates; that's
// getStructureVersionForMonth's job.
function resolveStructureGroupId(employee) {
  const db = getDb();
  if (employee.salary_structure_group_id) return employee.salary_structure_group_id;

  if (employee.designation) {
    const row = db.prepare(
      "SELECT structure_group_id FROM salary_structure_assignments WHERE scope = 'designation' AND scope_value = ?",
    ).get(employee.designation);
    if (row) return row.structure_group_id;
  }
  if (employee.department) {
    const row = db.prepare(
      "SELECT structure_group_id FROM salary_structure_assignments WHERE scope = 'department' AND scope_value = ?",
    ).get(employee.department);
    if (row) return row.structure_group_id;
  }
  const def = db.prepare('SELECT structure_group_id FROM salary_structures WHERE is_default = 1 LIMIT 1').get();
  return def?.structure_group_id || null;
}

// Which VERSION of a structure group was in effect during a given payroll
// month — same date-range resolution as salaryPolicy.getPolicyVersionForMonth.
function getStructureVersionForMonth(structureGroupId, monthKey) {
  const db = getDb();
  const monthEnd = `${monthKey}-31`;
  const row = db.prepare(
    `SELECT * FROM salary_structures
     WHERE structure_group_id = ?
       AND effective_from <= ?
       AND (effective_to IS NULL OR effective_to >= ?)
     ORDER BY effective_from DESC LIMIT 1`,
  ).get(structureGroupId, monthEnd, `${monthKey}-01`);
  if (row) return row;
  return db.prepare(
    'SELECT * FROM salary_structures WHERE structure_group_id = ? ORDER BY effective_from ASC LIMIT 1',
  ).get(structureGroupId);
}

// Convenience — what computeEmployeePayroll actually calls.
function resolveSalaryStructureForEmployee(employee, monthKey) {
  const groupId = resolveStructureGroupId(employee);
  if (!groupId) return null;
  return getStructureVersionForMonth(groupId, monthKey);
}

function getStructureComponents(structureId) {
  return getDb().prepare(
    'SELECT * FROM salary_structure_components WHERE structure_id = ? ORDER BY display_order ASC',
  ).all(structureId);
}

// Pure — no DB, no attendance. Turns a basic salary + a component list into
// earnings/deductions/gross/net. Shared by computeEmployeePayroll (real
// payroll, attendance-aware) and the HR-facing "what would this basic pay
// out to" estimate (no attendance, no policy — just the structure).
function computeStructureAmounts(basic, components) {
  const earnings = { basic };
  for (const c of components.filter((c) => c.component_type === 'earning')) {
    const amount = c.calc_type === 'fixed_amount' ? Number(c.fixed_amount || 0) : (basic * Number(c.percentage || 0) / 100);
    earnings[c.name] = Number(amount.toFixed(2));
  }

  const deductions = {};
  for (const c of components.filter((c) => c.component_type === 'deduction')) {
    const isESI = c.name.toUpperCase().includes('ESI');
    if (isESI && basic > 21000) {
      deductions[c.name] = 0;
    } else {
      const amount = c.calc_type === 'fixed_amount' ? Number(c.fixed_amount || 0) : (basic * Number(c.percentage || 0) / 100);
      deductions[c.name] = Number(amount.toFixed(2));
    }
  }

  const gross = Object.values(earnings).reduce((s, v) => s + Number(v || 0), 0);
  const totalDeductions = Object.values(deductions).reduce((s, v) => s + Number(v || 0), 0);
  return {
    earnings, deductions,
    gross: Number(gross.toFixed(2)),
    net: Number((gross - totalDeductions).toFixed(2)),
  };
}

// HR-facing "what would this pay out to" preview while editing an
// employee's Basic/department/designation/override — no attendance, no
// policy (overtime/late/etc. only make sense against a real month's
// attendance), just the structure that would resolve for this employee
// shape today. `employeeLike` needs salary, department, designation, and
// optionally salary_structure_group_id (the override).
function estimateStructureForEmployeeLike(employeeLike) {
  const basic = Number(employeeLike.salary || 0);
  const monthKey = toISODate(new Date()).slice(0, 7);
  const structure = resolveSalaryStructureForEmployee(employeeLike, monthKey);
  const components = structure ? getStructureComponents(structure.id) : [];
  const amounts = computeStructureAmounts(basic, components);
  return { ...amounts, structureName: structure?.name || null, basic };
}

// ─── Structure CRUD (group-aware, versioned) ───────────────────────────────

function attachComponents(rows) {
  const db = getDb();
  return rows.map((r) => ({
    ...r,
    components: db.prepare(
      'SELECT * FROM salary_structure_components WHERE structure_id = ? ORDER BY display_order ASC',
    ).all(r.id),
  }));
}

function listStructureGroups() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT ss.* FROM salary_structures ss
    INNER JOIN (
      SELECT structure_group_id, MAX(effective_from) AS latest
      FROM salary_structures GROUP BY structure_group_id
    ) latest ON latest.structure_group_id = ss.structure_group_id AND latest.latest = ss.effective_from
    ORDER BY ss.is_default DESC, ss.name ASC
  `).all();
  return attachComponents(rows);
}

function getStructureHistory(structureGroupId) {
  const rows = getDb().prepare(
    'SELECT * FROM salary_structures WHERE structure_group_id = ? ORDER BY effective_from DESC',
  ).all(structureGroupId);
  return attachComponents(rows);
}

function insertComponents(db, structureId, components) {
  const insert = db.prepare(
    `INSERT INTO salary_structure_components
       (id, structure_id, component_type, name, calc_type, percentage, fixed_amount, display_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  (components || []).forEach((c, i) => {
    if (!c?.name?.trim()) throw Object.assign(new Error('Each component needs a name'), { statusCode: 400 });
    if (!['earning', 'deduction'].includes(c.component_type)) {
      throw Object.assign(new Error("component_type must be 'earning' or 'deduction'"), { statusCode: 400 });
    }
    const calcType = c.calc_type === 'fixed_amount' ? 'fixed_amount' : 'percentage_of_basic';
    insert.run(
      `SSC-${randomUUID().slice(0, 8).toUpperCase()}`, structureId, c.component_type, c.name.trim(),
      calcType, Number(c.percentage || 0), Number(c.fixed_amount || 0), i,
    );
  });
}

function createStructure({ name, effectiveFrom, components }) {
  if (!name?.trim()) throw Object.assign(new Error('name is required'), { statusCode: 400 });
  const db = getDb();
  const groupId = `SGRP-${randomUUID().slice(0, 8).toUpperCase()}`;
  const id = `STRUCT-${randomUUID().slice(0, 8).toUpperCase()}`;
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO salary_structures (id, structure_group_id, name, effective_from)
       VALUES (?, ?, ?, ?)`,
    ).run(id, groupId, name.trim(), effectiveFrom || toISODate(new Date()));
    insertComponents(db, id, components);
  });
  tx();
  return attachComponents([db.prepare('SELECT * FROM salary_structures WHERE id = ?').get(id)])[0];
}

// "Editing" a structure never mutates its current version — closes it out
// as of the day before the new version starts, and inserts a fresh row
// with a fresh, full snapshot of components. A payroll month already
// computed keeps reading the version (and its components) that were live
// at the time.
function updateStructure(structureGroupId, { name, effectiveFrom, components }) {
  const db = getDb();
  const current = db.prepare(
    'SELECT * FROM salary_structures WHERE structure_group_id = ? AND effective_to IS NULL',
  ).get(structureGroupId);
  if (!current) throw Object.assign(new Error('Structure not found or has no current version'), { statusCode: 404 });

  const newEffectiveFrom = effectiveFrom || toISODate(new Date());
  const newName = (name || current.name).trim();
  const newComponents = components || getStructureComponents(current.id);

  const tx = db.transaction(() => {
    if (newEffectiveFrom > current.effective_from) {
      db.prepare('UPDATE salary_structures SET effective_to = ? WHERE id = ?')
        .run(addDays(newEffectiveFrom, -1), current.id);
    } else {
      db.prepare('DELETE FROM salary_structures WHERE id = ?').run(current.id); // cascades components
    }
    const id = `STRUCT-${randomUUID().slice(0, 8).toUpperCase()}`;
    db.prepare(
      `INSERT INTO salary_structures (id, structure_group_id, name, is_default, effective_from)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(id, structureGroupId, newName, current.is_default, newEffectiveFrom);
    insertComponents(db, id, newComponents);
    return id;
  });

  const newId = tx();
  return attachComponents([db.prepare('SELECT * FROM salary_structures WHERE id = ?').get(newId)])[0];
}

function deleteStructureGroup(structureGroupId) {
  const db = getDb();
  const current = db.prepare('SELECT * FROM salary_structures WHERE structure_group_id = ? AND effective_to IS NULL').get(structureGroupId);
  if (current?.is_default) throw Object.assign(new Error('Cannot delete the default structure'), { statusCode: 400 });

  const inUse = db.prepare(
    `SELECT
       (SELECT COUNT(*) FROM salary_structure_assignments WHERE structure_group_id = ?) +
       (SELECT COUNT(*) FROM employees WHERE salary_structure_group_id = ?) AS n`,
  ).get(structureGroupId, structureGroupId).n;
  if (inUse > 0) {
    throw Object.assign(new Error('This structure is still assigned to a department, designation, or employee — reassign those first'), { statusCode: 400 });
  }

  db.prepare('DELETE FROM salary_structures WHERE structure_group_id = ?').run(structureGroupId);
  return { structureGroupId, deleted: true };
}

// ─── Assignments (current-state only, no history) ──────────────────────────

function listAssignments() {
  return getDb().prepare('SELECT * FROM salary_structure_assignments ORDER BY scope, scope_value').all();
}

function setAssignment(scope, scopeValue, structureGroupId) {
  if (!['department', 'designation'].includes(scope)) {
    throw Object.assign(new Error("scope must be 'department' or 'designation'"), { statusCode: 400 });
  }
  const db = getDb();
  const id = `SASSIGN-${randomUUID().slice(0, 8).toUpperCase()}`;
  db.prepare(
    `INSERT INTO salary_structure_assignments (id, scope, scope_value, structure_group_id) VALUES (?, ?, ?, ?)
     ON CONFLICT(scope, scope_value) DO UPDATE SET structure_group_id = excluded.structure_group_id`,
  ).run(id, scope, scopeValue, structureGroupId);
  return db.prepare('SELECT * FROM salary_structure_assignments WHERE scope = ? AND scope_value = ?').get(scope, scopeValue);
}

function deleteAssignment(scope, scopeValue) {
  getDb().prepare('DELETE FROM salary_structure_assignments WHERE scope = ? AND scope_value = ?').run(scope, scopeValue);
  return { scope, scopeValue, deleted: true };
}

module.exports = {
  resolveStructureGroupId,
  getStructureVersionForMonth,
  resolveSalaryStructureForEmployee,
  getStructureComponents,
  computeStructureAmounts,
  estimateStructureForEmployeeLike,
  listStructureGroups,
  getStructureHistory,
  createStructure,
  updateStructure,
  deleteStructureGroup,
  listAssignments,
  setAssignment,
  deleteAssignment,
  listDistinctDepartmentsAndDesignations,
};
