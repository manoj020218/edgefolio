import { Schema, model } from 'mongoose';
import { VISIT_STATUSES } from '../../config/constants';

const pointSchema = new Schema(
  {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    accuracy: { type: Number },
  },
  { _id: false },
);

const visitSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    customerName: { type: String, required: true },
    customerId: { type: String },
    checkInAt: { type: Date, required: true, index: true },
    checkOutAt: { type: Date },
    location: { type: pointSchema, required: true },
    notes: { type: String },
    status: { type: String, enum: VISIT_STATUSES, default: 'open' },
  },
  { timestamps: true, versionKey: false },
);

visitSchema.index({ companyId: 1, employeeId: 1, checkInAt: -1 });

export const Visit = model('Visit', visitSchema);
