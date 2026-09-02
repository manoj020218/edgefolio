export type RequestType =
  | 'leave'
  | 'attendance_correction'
  | 'advance_salary'
  | 'expense'
  | 'travel'
  | 'shift_change'
  | 'wfh'
  | 'comp_off'
  | 'document_request';

export type RequestField = 'dateRange' | 'singleDate' | 'amount' | 'category' | 'billPhoto' | 'shiftText' | 'documentType' | 'leaveType' | 'reason';

export interface RequestTypeConfig {
  type: RequestType;
  label: string;
  fields: RequestField[];
}

// Shared config driving both the type-picker grid and the adaptive New Request
// form — one form component handles all 9 types instead of nine bespoke screens.
export const REQUEST_TYPES: RequestTypeConfig[] = [
  { type: 'leave', label: 'Leave', fields: ['leaveType', 'dateRange', 'reason'] },
  { type: 'attendance_correction', label: 'Attendance Fix', fields: ['singleDate', 'reason'] },
  { type: 'advance_salary', label: 'Advance Salary', fields: ['amount', 'reason'] },
  { type: 'expense', label: 'Expense', fields: ['category', 'amount', 'billPhoto', 'reason'] },
  { type: 'travel', label: 'Travel', fields: ['dateRange', 'reason'] },
  { type: 'shift_change', label: 'Shift Change', fields: ['singleDate', 'shiftText', 'reason'] },
  { type: 'wfh', label: 'Work From Home', fields: ['dateRange', 'reason'] },
  { type: 'comp_off', label: 'Comp-off', fields: ['singleDate', 'reason'] },
  { type: 'document_request', label: 'Document', fields: ['documentType', 'reason'] },
];

export const EXPENSE_CATEGORIES = ['Travel', 'Fuel', 'Food', 'Hotel', 'Local Conveyance', 'Other'];

// Must match leave_balances' columns (EDGE/backend/models/leave.js) — the APK's
// 'leave' request type writes into the existing leave_requests table, not a new one.
export const LEAVE_TYPES = ['casual', 'sick', 'annual'] as const;

export function requestTypeLabel(type: string): string {
  return REQUEST_TYPES.find((t) => t.type === type)?.label ?? type;
}
