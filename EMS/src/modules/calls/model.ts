import { Schema, model } from 'mongoose';
import { CALL_DIRECTIONS, CALL_STATUSES } from '../../config/constants';

const pointSchema = new Schema(
  {
    latitude: { type: Number },
    longitude: { type: Number },
    accuracy: { type: Number },
  },
  { _id: false },
);

const callSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    deviceId: { type: String, required: true, index: true },
    externalCallId: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    direction: { type: String, enum: CALL_DIRECTIONS, required: true },
    status: { type: String, enum: CALL_STATUSES, required: true },
    startedAt: { type: Date, required: true, index: true },
    answeredAt: { type: Date },
    endedAt: { type: Date },
    durationSeconds: { type: Number, default: 0 },
    contactName: { type: String },
    location: { type: pointSchema },
    recordingId: { type: String },
  },
  { timestamps: true, versionKey: false },
);

callSchema.index({ companyId: 1, employeeId: 1, startedAt: -1 });
callSchema.index({ deviceId: 1, externalCallId: 1 }, { unique: true });

export const CallRecord = model('CallRecord', callSchema);
