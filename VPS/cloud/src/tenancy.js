'use strict';
/**
 * Tenant isolation — the ONE place org scoping happens (plan §7). Routes never touch tenant models
 * directly; they call forOrg(orgId) and get the same models with `orgId` forced into every filter,
 * every created document and every aggregation. A caller-supplied orgId in a filter or body is
 * overwritten, so one organisation can never read or write another's rows.
 * test/tenancy.test.js tries to break this.
 */
const mongoose = require('mongoose');
const models = require('./models');

const TENANT_MODELS = ['Employee', 'FaceProfile', 'Punch', 'AttendanceDay', 'Office', 'WorkAssignment', 'Holiday', 'Shift', 'AuditLog', 'Counter', 'AlertSubscription', 'FaceRecaptureRequest', 'AppNotification', 'Announcement', 'EmployeeRequest'];

function scope(Model, orgId) {
  const f = (filter = {}) => ({ ...filter, orgId });
  const d = (doc = {}) => ({ ...doc, orgId });
  return {
    find:            (filter, proj, opts) => Model.find(f(filter), proj, opts),
    findOne:         (filter, proj, opts) => Model.findOne(f(filter), proj, opts),
    countDocuments:  (filter)              => Model.countDocuments(f(filter)),
    exists:          (filter)              => Model.exists(f(filter)),
    create:          (doc)                 => Model.create(Array.isArray(doc) ? doc.map(d) : d(doc)),
    // Any attempt to set/unset orgId in an update is stripped, so an update can't move a row to
    // another org. On upsert, the orgId in the (forced) filter becomes the new row's orgId.
    updateOne:       (filter, update, opts) => Model.updateOne(f(filter), guard(update), opts),
    updateMany:      (filter, update, opts) => Model.updateMany(f(filter), guard(update), opts),
    findOneAndUpdate:(filter, update, opts) => Model.findOneAndUpdate(f(filter), guard(update), opts),
    deleteOne:       (filter)              => Model.deleteOne(f(filter)),
    deleteMany:      (filter)              => Model.deleteMany(f(filter)),
    aggregate:       (pipeline = [])       => Model.aggregate([{ $match: { orgId } }, ...pipeline]),
  };
}

function guard(update = {}) {
  const u = { ...update };
  delete u.orgId;                                            // plain-object update form
  for (const op of ['$set', '$unset', '$setOnInsert', '$rename', '$inc']) {
    if (u[op]) { u[op] = { ...u[op] }; delete u[op].orgId; }
  }
  return u;
}

function forOrg(orgId) {
  if (!orgId || !mongoose.isValidObjectId(orgId)) throw new Error('forOrg: a valid orgId is required');
  const id = new mongoose.Types.ObjectId(String(orgId));
  const db = Object.fromEntries(TENANT_MODELS.map((name) => [name, scope(models[name], id)]));
  // Next value of a per-org counter, atomically (used for the punch sequence / EDGE pull cursor).
  db.nextSeq = async (name) => {
    const c = await db.Counter.findOneAndUpdate({ name }, { $inc: { value: 1 } }, { upsert: true, new: true });
    return c.value;
  };
  return db;
}

module.exports = { forOrg, TENANT_MODELS };
