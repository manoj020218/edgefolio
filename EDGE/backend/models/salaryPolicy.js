'use strict';
const { randomUUID } = require('crypto');
const { getDb } = require('../config/database');

const POLICY_FIELDS = [
  'overtime_enabled', 'overtime_rate_type', 'overtime_multiplier', 'overtime_fixed_rate',
  'late_penalty_enabled', 'late_grace_minutes', 'late_penalty_type', 'late_penalty_value',
  'early_leave_penalty_enabled', 'early_leave_grace_minutes', 'early_leave_penalty_type', 'early_leave_penalty_value',
  'early_arrival_bonus_enabled', 'early_arrival_bonus_per_instance',
  'holiday_work_bonus_enabled', 'holiday_work_rate_multiplier',
  'weekly_off_work_bonus_enabled', 'weekly_off_work_rate_multiplier',
  'tour_allowance_enabled', 'tour_allowance_per_day',
  'field_allowance_enabled', 'field_allowance_per_day',
];

function toISODate(d) { return d.toISOString().split('T')[0]; }

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

// ─── Resolution ─────────────────────────────────────────────────────────────

// Which policy GROUP applies to this employee — precedence: employee
// override > designation assignment > department assignment > the
// always-present default group. Doesn't care about dates; that's
// getPolicyVersionForMonth's job.
function resolvePolicyGroupId(employee) {
  const db = getDb();
  if (employee.salary_policy_group_id) return employee.salary_policy_group_id;

  if (employee.designation) {
    const row = db.prepare(
      "SELECT policy_group_id FROM salary_policy_assignments WHERE scope = 'designation' AND scope_value = ?",
    ).get(employee.designation);
    if (row) return row.policy_group_id;
  }
  if (employee.department) {
    const row = db.prepare(
      "SELECT policy_group_id FROM salary_policy_assignments WHERE scope = 'department' AND scope_value = ?",
    ).get(employee.department);
    if (row) return row.policy_group_id;
  }
  const def = db.prepare('SELECT policy_group_id FROM salary_policies WHERE is_default = 1 LIMIT 1').get();
  return def?.policy_group_id || null;
}

// Which VERSION of a policy group was in effect during a given payroll
// month — picks the version whose [effective_from, effective_to] range
// overlaps the month, preferring the most recently-started one if somehow
// more than one matches (shouldn't happen if versions are only ever
// created via updatePolicy, but defensive).
function getPolicyVersionForMonth(policyGroupId, monthKey) {
  const db = getDb();
  const monthEnd = `${monthKey}-31`; // string comparison is fine — 'YYYY-MM-31' sorts correctly against any real date in that month
  const row = db.prepare(
    `SELECT * FROM salary_policies
     WHERE policy_group_id = ?
       AND effective_from <= ?
       AND (effective_to IS NULL OR effective_to >= ?)
     ORDER BY effective_from DESC LIMIT 1`,
  ).get(policyGroupId, monthEnd, `${monthKey}-01`);
  if (row) return row;
  // Fallback: group exists but somehow has no version covering this month
  // (e.g. its first version starts after this month) — use its earliest
  // version rather than silently applying no rules at all.
  return db.prepare(
    'SELECT * FROM salary_policies WHERE policy_group_id = ? ORDER BY effective_from ASC LIMIT 1',
  ).get(policyGroupId);
}

// Convenience — what computeEmployeePayroll actually calls.
function resolveSalaryPolicyForEmployee(employee, monthKey) {
  const groupId = resolvePolicyGroupId(employee);
  if (!groupId) return null;
  return getPolicyVersionForMonth(groupId, monthKey);
}

// ─── Policy CRUD (group-aware, versioned) ──────────────────────────────────

function listPolicyGroups() {
  const db = getDb();
  // Latest version per group — what the settings list shows.
  return db.prepare(`
    SELECT sp.* FROM salary_policies sp
    INNER JOIN (
      SELECT policy_group_id, MAX(effective_from) AS latest
      FROM salary_policies GROUP BY policy_group_id
    ) latest ON latest.policy_group_id = sp.policy_group_id AND latest.latest = sp.effective_from
    ORDER BY sp.is_default DESC, sp.name ASC
  `).all();
}

function getPolicyHistory(policyGroupId) {
  return getDb().prepare(
    'SELECT * FROM salary_policies WHERE policy_group_id = ? ORDER BY effective_from DESC',
  ).all(policyGroupId);
}

function pickFields(payload) {
  const out = {};
  for (const f of POLICY_FIELDS) {
    if (payload[f] !== undefined) out[f] = payload[f];
  }
  return out;
}

function createPolicy({ name, effectiveFrom, ...rest }) {
  if (!name?.trim()) throw Object.assign(new Error('name is required'), { statusCode: 400 });
  const db = getDb();
  const groupId = `PGRP-${randomUUID().slice(0, 8).toUpperCase()}`;
  const id = `POLICY-${randomUUID().slice(0, 8).toUpperCase()}`;
  const fields = pickFields(rest);
  const columns = ['id', 'policy_group_id', 'name', 'effective_from', ...Object.keys(fields)];
  const placeholders = columns.map((c) => `@${c}`);
  db.prepare(
    `INSERT INTO salary_policies (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
  ).run({ id, policy_group_id: groupId, name: name.trim(), effective_from: effectiveFrom || toISODate(new Date()), ...fields });
  return db.prepare('SELECT * FROM salary_policies WHERE id = ?').get(id);
}

// "Editing" a policy never mutates its current version — closes it out as
// of the day before the new version starts, and inserts a fresh row. This
// is the whole point: a payroll month already computed under the old rules
// keeps reading the old rules forever.
function updatePolicy(policyGroupId, { name, effectiveFrom, ...rest }) {
  const db = getDb();
  const current = db.prepare(
    'SELECT * FROM salary_policies WHERE policy_group_id = ? AND effective_to IS NULL',
  ).get(policyGroupId);
  if (!current) throw Object.assign(new Error('Policy not found or has no current version'), { statusCode: 404 });

  const newEffectiveFrom = effectiveFrom || toISODate(new Date());
  const fields = { ...pickFields(current), ...pickFields(rest) }; // start from current values, apply only what changed
  const newName = (name || current.name).trim();

  const tx = db.transaction(() => {
    if (newEffectiveFrom > current.effective_from) {
      // Genuinely a new version starting later — close the old one out.
      db.prepare('UPDATE salary_policies SET effective_to = ? WHERE id = ?')
        .run(addDays(newEffectiveFrom, -1), current.id);
    } else {
      // Editing the same version's own start date or earlier — nothing to
      // preserve before it yet (e.g. fixing a typo same day it was
      // created), just replace this row's fields in place.
      db.prepare('DELETE FROM salary_policies WHERE id = ?').run(current.id);
    }
    const id = `POLICY-${randomUUID().slice(0, 8).toUpperCase()}`;
    const columns = ['id', 'policy_group_id', 'name', 'is_default', 'effective_from', ...Object.keys(fields)];
    const placeholders = columns.map((c) => `@${c}`);
    db.prepare(
      `INSERT INTO salary_policies (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
    ).run({ id, policy_group_id: policyGroupId, name: newName, is_default: current.is_default, effective_from: newEffectiveFrom, ...fields });
    return id;
  });

  const newId = tx();
  return db.prepare('SELECT * FROM salary_policies WHERE id = ?').get(newId);
}

function deletePolicyGroup(policyGroupId) {
  const db = getDb();
  const current = db.prepare('SELECT * FROM salary_policies WHERE policy_group_id = ? AND effective_to IS NULL').get(policyGroupId);
  if (current?.is_default) throw Object.assign(new Error('Cannot delete the default policy'), { statusCode: 400 });

  const inUse = db.prepare(
    `SELECT
       (SELECT COUNT(*) FROM salary_policy_assignments WHERE policy_group_id = ?) +
       (SELECT COUNT(*) FROM employees WHERE salary_policy_group_id = ?) AS n`,
  ).get(policyGroupId, policyGroupId).n;
  if (inUse > 0) {
    throw Object.assign(new Error('This policy is still assigned to a department, designation, or employee — reassign those first'), { statusCode: 400 });
  }

  db.prepare('DELETE FROM salary_policies WHERE policy_group_id = ?').run(policyGroupId);
  return { policyGroupId, deleted: true };
}

// ─── Assignments (current-state only, no history) ──────────────────────────

function listAssignments() {
  return getDb().prepare('SELECT * FROM salary_policy_assignments ORDER BY scope, scope_value').all();
}

function setAssignment(scope, scopeValue, policyGroupId) {
  if (!['department', 'designation'].includes(scope)) {
    throw Object.assign(new Error("scope must be 'department' or 'designation'"), { statusCode: 400 });
  }
  const db = getDb();
  const id = `PASSIGN-${randomUUID().slice(0, 8).toUpperCase()}`;
  db.prepare(
    `INSERT INTO salary_policy_assignments (id, scope, scope_value, policy_group_id) VALUES (?, ?, ?, ?)
     ON CONFLICT(scope, scope_value) DO UPDATE SET policy_group_id = excluded.policy_group_id`,
  ).run(id, scope, scopeValue, policyGroupId);
  return db.prepare('SELECT * FROM salary_policy_assignments WHERE scope = ? AND scope_value = ?').get(scope, scopeValue);
}

function deleteAssignment(scope, scopeValue) {
  getDb().prepare('DELETE FROM salary_policy_assignments WHERE scope = ? AND scope_value = ?').run(scope, scopeValue);
  return { scope, scopeValue, deleted: true };
}

function listDistinctDepartmentsAndDesignations() {
  const db = getDb();
  const departments = db.prepare(
    "SELECT DISTINCT department AS value FROM employees WHERE department IS NOT NULL AND department != '' ORDER BY department",
  ).all().map((r) => r.value);
  const designations = db.prepare(
    "SELECT DISTINCT designation AS value FROM employees WHERE designation IS NOT NULL AND designation != '' ORDER BY designation",
  ).all().map((r) => r.value);
  return { departments, designations };
}

module.exports = {
  resolvePolicyGroupId,
  getPolicyVersionForMonth,
  resolveSalaryPolicyForEmployee,
  listPolicyGroups,
  getPolicyHistory,
  createPolicy,
  updatePolicy,
  deletePolicyGroup,
  listAssignments,
  setAssignment,
  deleteAssignment,
  listDistinctDepartmentsAndDesignations,
};
