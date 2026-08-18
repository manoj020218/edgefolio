import { Schema, model } from 'mongoose';

const deviceHealthSchema = new Schema(
  {
    deviceId: { type: String, required: true, unique: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', index: true },
    timestamp: { type: Date, required: true },
    batteryPercent: { type: Number },
    charging: { type: Boolean },
    gpsEnabled: { type: Boolean },
    networkType: { type: String },
    internetAvailable: { type: Boolean },
    appVersion: { type: String },
    androidVersion: { type: String },
    trackingServiceRunning: { type: Boolean },
    lastLocationAt: { type: Date },
    offline: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

export const DeviceHealth = model('DeviceHealth', deviceHealthSchema);
