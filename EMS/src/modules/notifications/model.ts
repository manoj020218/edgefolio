import { Schema, model } from 'mongoose';
import { COMMAND_TYPES } from '../../config/constants';

const notificationCommandSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    targetUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    targetDeviceId: { type: String, index: true },
    commandType: { type: String, enum: COMMAND_TYPES, required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, default: 'pending' },
    acknowledgedAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

export const NotificationCommand = model('NotificationCommand', notificationCommandSchema);
