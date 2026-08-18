import { Schema, model } from 'mongoose';
import { VIDEO_STATUSES } from '../../config/constants';

const sessionSchema = new Schema(
  {
    sessionId: { type: String, required: true, unique: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    callerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    calleeUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    createdAt: { type: Date, default: Date.now },
    answeredAt: { type: Date },
    endedAt: { type: Date },
    status: { type: String, enum: VIDEO_STATUSES, default: 'ringing' },
  },
  { versionKey: false, timestamps: false },
);

export const VideoSession = model('VideoSession', sessionSchema);
