import { Schema, model } from 'mongoose';
import { COMPANY_STATUSES } from '../../config/constants';

const companySchema = new Schema(
  {
    name: { type: String, required: true },
    code: { type: String, required: true, uppercase: true, trim: true, unique: true },
    status: { type: String, enum: COMPANY_STATUSES, default: 'active' },
    timezone: { type: String, required: true },
  },
  { timestamps: true, versionKey: false },
);

export const Company = model('Company', companySchema);
