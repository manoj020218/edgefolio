import { Schema, model } from 'mongoose';
import { DEVICE_STATUSES } from '../../config/constants';

const deviceSchema = new Schema(
  {
    deviceId: { type: String, required: true, unique: true, trim: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', index: true },
    platform: { type: String, required: true },
    manufacturer: { type: String },
    model: { type: String },
    androidVersion: { type: String },
    appVersion: { type: String },
    deviceName: { type: String },
    fcmToken: { type: String },
    lastSeenAt: { type: Date },
    status: { type: String, enum: DEVICE_STATUSES, default: 'active' },
    managed: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);

deviceSchema.index({ companyId: 1, employeeId: 1 });

export const Device = model('Device', deviceSchema);
