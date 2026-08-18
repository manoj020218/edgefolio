import { Schema, model } from 'mongoose';

const recordingSchema = new Schema(
  {
    recordingId: { type: String, required: true, unique: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    callId: { type: Schema.Types.ObjectId, ref: 'CallRecord' },
    storageKey: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    duration: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

export const Recording = model('Recording', recordingSchema);
