import { Schema, model } from 'mongoose';
import { ROLES, USER_STATUSES } from '../../config/constants';

const userSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', index: true },
    name: { type: String, required: true },
    mobile: { type: String },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true },
    managerId: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: USER_STATUSES, default: 'active' },
  },
  { timestamps: true, versionKey: false },
);

userSchema.index({ companyId: 1, mobile: 1 });
userSchema.index({ companyId: 1, role: 1 });

export const User = model('User', userSchema);
