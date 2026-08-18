import { Schema, model } from 'mongoose';

const pointSchema = new Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true },
  },
  { _id: false },
);

const locationSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    deviceId: { type: String, required: true, index: true },
    timestamp: { type: Date, required: true, index: true },
    location: { type: pointSchema, required: true, index: '2dsphere' },
    accuracy: { type: Number, required: true },
    speed: { type: Number },
    heading: { type: Number },
    battery: { type: Number },
    mockLocation: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

locationSchema.index({ companyId: 1, employeeId: 1, timestamp: 1 });
locationSchema.index({ companyId: 1, employeeId: 1, deviceId: 1, timestamp: 1 }, { unique: true });

export const LocationPoint = model('LocationPoint', locationSchema);
