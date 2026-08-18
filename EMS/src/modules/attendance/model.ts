import { Schema, model } from 'mongoose';

const pointSchema = new Schema(
  {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    accuracy: { type: Number },
  },
  { _id: false },
);

const attendanceSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    deviceId: { type: String, index: true },
    checkInAt: { type: Date, required: true, index: true },
    checkOutAt: { type: Date },
    checkInLocation: { type: pointSchema, required: true },
    checkOutLocation: { type: pointSchema },
    notes: { type: String },
    open: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);

attendanceSchema.index({ companyId: 1, employeeId: 1, checkInAt: -1 });
attendanceSchema.index(
  { companyId: 1, employeeId: 1, open: 1 },
  { unique: true, partialFilterExpression: { open: true } },
);

export const AttendanceSession = model('AttendanceSession', attendanceSchema);
