'use strict';
/**
 * Data model (CLOUD_ATTENDANCE_PLAN.md §6). Every tenant collection carries `orgId` and is only
 * ever queried through tenancy.forOrg(orgId) — never directly from a route.
 *
 * IDs mirror EDGE so EDGE sync (Phase 3) is a straight copy: `empId` is EDGE's employee id
 * (unique per organisation, not globally), `empCode` the human Employee ID.
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const org = { type: ObjectId, ref: 'Organisation', required: true, index: true };

const orgSchema = new Schema({
  orgCode:      { type: String, required: true, unique: true, uppercase: true, trim: true }, // typed once in the app
  name:         { type: String, required: true, trim: true },
  status:       { type: String, enum: ['active', 'suspended'], default: 'active' },
  plan:         { type: String, default: 'early_access' },        // never shown to users (plan §4)
  maxActiveEmployees: { type: Number, default: 50 },
  billingClientId: { type: String, default: null },               // IoT billing platform Client id (Phase 4)
  licenseKey:   { type: String },                                 // EdgeLicense the org was linked with
  syncKeyHash:  { type: String },                                 // sha256 of EDGE sync key
  edgeMachineId: { type: String, default: null },                 // the office PC linked to this org
  edgeLinkedAt: { type: Date, default: null },
  edgeVersion:  { type: String, default: null },
  lastSyncAt:   { type: Date, default: null },
  syncAckSeq:   { type: Number, default: 0 },                     // last punch seq EDGE confirmed
  tzOffsetMin:  { type: Number, default: 330 },                   // IST
  settings: {
    minApkVersion:      { type: String, default: '1.0.0' },
    geofenceRadiusM:    { type: Number, default: 200 },
    offlineBufferDays:  { type: Number, default: 7 },
    weeklyOffDays:      { type: [Number], default: [0, 6] },
    allowOfficeMobile:  { type: Boolean, default: true },         // cloud orgs may have no machine
    requireWorkAssignment: { type: Boolean, default: false },     // EDGE-style tour/wfh gate, opt-in
    enforceGeofence:    { type: Boolean, default: false },        // office punches must be inside an office radius
  },
}, { timestamps: true });
// Partial (not sparse) unique indexes: only real strings are indexed, so unlinked orgs never clash.
orgSchema.index({ syncKeyHash: 1 }, { unique: true, partialFilterExpression: { syncKeyHash: { $type: 'string' } } });
orgSchema.index({ licenseKey: 1 }, { unique: true, partialFilterExpression: { licenseKey: { $type: 'string' } } });
const Organisation = mongoose.model('Organisation', orgSchema);

const PROFILE_FIELDS = [
  'gender', 'dateOfBirth', 'bloodGroup', 'anniversaryDate',
  'currentAddress', 'permanentAddress', 'vehicleNumber',
  'emergencyContactName', 'emergencyContactRelation', 'emergencyContactPhone',
];

const employeeSchema = new Schema({
  orgId: org,
  empId:   { type: String, required: true },          // EDGE employee id
  empCode: { type: String, required: true, trim: true },
  email:   { type: String, default: null, lowercase: true, trim: true },
  name:    { type: String, required: true, trim: true },
  department:  { type: String, default: null },
  designation: { type: String, default: null },
  appRole: { type: String, enum: ['owner', 'hr-admin', 'employee'], default: 'employee' },
  mobileLoginEnabled: { type: Boolean, default: true },
  isFieldEmployee:    { type: Boolean, default: false },
  status:  { type: String, enum: ['active', 'inactive'], default: 'active' },
  passwordHash:       { type: String, default: null },
  tempPasswordHash:   { type: String, default: null },
  passwordMustChange: { type: Boolean, default: false },
  // Last password hash EDGE pushed. EDGE's hash is applied only when it differs from this (HR
  // changed it in EDGE) — so a password the employee changed in the app isn't overwritten.
  edgePasswordHash: { type: String, default: null },
  source: { type: String, enum: ['edge', 'cloud'], default: 'cloud' },   // who created the row
  googleSub: { type: String, default: null },                            // owners who sign in with Google
  fcmToken: { type: String, default: null },
  profile: Object.fromEntries(PROFILE_FIELDS.map((f) => [f, { type: String, default: null }])),
}, { timestamps: true });
employeeSchema.index({ orgId: 1, empId: 1 }, { unique: true });
employeeSchema.index({ orgId: 1, empCode: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
employeeSchema.index({ orgId: 1, email: 1 });
const Employee = mongoose.model('Employee', employeeSchema);

const faceSchema = new Schema({
  orgId: org,
  empId: { type: String, required: true },
  embedding: { type: [Number], required: true },     // 192 floats from MobileFaceNet; never a photo
  enrolledAt: { type: Date, default: Date.now },
});
faceSchema.index({ orgId: 1, empId: 1 }, { unique: true });
const FaceProfile = mongoose.model('FaceProfile', faceSchema);

// Raw punches, append-only. EDGE pulls these in Phase 3 (cursor = _id order).
const punchSchema = new Schema({
  orgId: org,
  empId: { type: String, required: true },
  eventType: { type: String, enum: ['in', 'out'], required: true },
  at:   { type: Date, required: true },                // UTC instant from the phone
  date: { type: String, required: true },              // org-local YYYY-MM-DD
  time: { type: String, required: true },              // org-local HH:MM:SS
  workType: { type: String, default: null },           // office | tour | wfh
  source:   { type: String, default: 'app' },          // app | app-offline | machine
  faceMatch: { type: Number, default: 0 },
  liveness:  { type: String, default: null },
  location:  { lat: Number, lon: Number, accuracy: Number },
  geofenceOk: { type: Boolean, default: null },        // null = no geofence to check against
  deviceId:  { type: String, default: null },
  clientRef: { type: String, default: null },          // dedupe key for offline re-sends
  // Per-organisation sequence number = EDGE's pull cursor. A counter, not ObjectId order, so the
  // cursor stays gap-free even with several API instances (plan §10: stateless, can scale out).
  seq: { type: Number, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });
punchSchema.index({ orgId: 1, empId: 1, date: 1, at: 1 });
punchSchema.index({ orgId: 1, seq: 1 }, { unique: true });
punchSchema.index({ orgId: 1, clientRef: 1 }, { unique: true, partialFilterExpression: { clientRef: { $type: 'string' } } });
const Punch = mongoose.model('Punch', punchSchema);

// One row per employee per day: first-in / last-out summary (EDGE attendance_records shape).
const daySchema = new Schema({
  orgId: org,
  empId: { type: String, required: true },
  date:  { type: String, required: true },
  checkIn:  { type: String, default: null },
  checkOut: { type: String, default: null },
  hoursWorked: { type: Number, default: 0 },
  status: { type: String, default: 'present' },
  mode:   { type: String, default: null },              // mobile-office | mobile-tour | mobile-wfh
  faceMatch: { type: Number, default: 0 },
  location:  { lat: Number, lon: Number, accuracy: Number },
  leaveType: { type: String, default: null },
}, { timestamps: true });
daySchema.index({ orgId: 1, empId: 1, date: 1 }, { unique: true });
daySchema.index({ orgId: 1, date: 1 });
const AttendanceDay = mongoose.model('AttendanceDay', daySchema);

const officeSchema = new Schema({
  orgId: org,
  officeId: { type: String, required: true },
  label: { type: String, required: true },
  lat: { type: Number, default: null },
  lng: { type: Number, default: null },
  radiusM: { type: Number, default: null },              // null = org default
});
officeSchema.index({ orgId: 1, officeId: 1 }, { unique: true });
const Office = mongoose.model('Office', officeSchema);

const assignmentSchema = new Schema({
  orgId: org,
  empId: { type: String, required: true },
  workType: { type: String, enum: ['office', 'tour', 'wfh'], required: true },
  fromDate: { type: String, required: true },
  toDate:   { type: String, required: true },
  notes:    { type: String, default: null },
  createdBy: { type: String, default: null },          // empCode of the admin who made it
}, { timestamps: true });
assignmentSchema.index({ orgId: 1, empId: 1, fromDate: 1, toDate: 1 });
const WorkAssignment = mongoose.model('WorkAssignment', assignmentSchema);

// "Notify me when X checks in/out" (EDGE employee_alert_subscriptions). One row per watcher+watched.
const alertSubSchema = new Schema({
  orgId: org,
  watcherEmpId: { type: String, required: true },
  watchedEmpId: { type: String, required: true },
  alertCheckin:  { type: Boolean, default: true },
  alertCheckout: { type: Boolean, default: true },
}, { timestamps: true });
alertSubSchema.index({ orgId: 1, watcherEmpId: 1, watchedEmpId: 1 }, { unique: true });
alertSubSchema.index({ orgId: 1, watchedEmpId: 1 });
const AlertSubscription = mongoose.model('AlertSubscription', alertSubSchema);

const holidaySchema =new Schema({ orgId: org, date: { type: String, required: true }, name: String });
holidaySchema.index({ orgId: 1, date: 1 }, { unique: true });
const Holiday = mongoose.model('Holiday', holidaySchema);

// Per-org atomic counters (punch sequence).
const counterSchema = new Schema({ orgId: org, name: { type: String, required: true }, value: { type: Number, default: 0 } });
counterSchema.index({ orgId: 1, name: 1 }, { unique: true });
const Counter = mongoose.model('Counter', counterSchema);

const AuditLog = mongoose.model('AuditLog', new Schema({
  orgId: org,
  actor: { type: String, required: true },     // empId, 'edge-sync', 'support:<name>'
  action: { type: String, required: true },
  detail: { type: Schema.Types.Mixed, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } }));

module.exports = {
  Organisation, Employee, FaceProfile, Punch, AttendanceDay, Office, WorkAssignment, Holiday, AuditLog, Counter,
  AlertSubscription,
  PROFILE_FIELDS,
};
