import { Schema, model } from 'mongoose';
import { EMPLOYEE_STATUSES } from '../../config/constants';

const employeeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    employeeCode: { type: String, required: true, trim: true },
    designation: { type: String, required: true },
    department: { type: String, required: true },
    managerId: { type: Schema.Types.ObjectId, ref: 'User' },
    joiningDate: { type: Date, required: true },
    status: { type: String, enum: EMPLOYEE_STATUSES, default: 'active' },
  },
  { timestamps: true, versionKey: false },
);

employeeSchema.index({ companyId: 1, employeeCode: 1 }, { unique: true });

export const Employee = model('Employee', employeeSchema);
