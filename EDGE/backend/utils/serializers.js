function serializeEmployee(row) {
  if (!row) return null;
  return {
    id: row.id,
    empCode: row.emp_code || null,
    name: row.name,
    email: row.email,
    phone: row.phone,
    department: row.department,
    designation: row.designation,
    joiningDate: row.joining_date,
    salary: Number(row.salary || 0),
    status: row.status,
    avatar: row.avatar,
    workType: row.work_type || 'office',
    appRole: row.app_role || 'user',
    allowRemoteAttendance: Boolean(row.allow_remote_attendance),
    bankAccountNumber: row.bank_account_number || null,
    bankIfsc: row.bank_ifsc || null,
    bankName: row.bank_name || null,
    paymentMode: row.payment_mode || 'NEFT',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeAttendance(row) {
  if (!row) return null;
  return {
    eventId: row.event_id,
    memberId: row.member_id,
    date: row.date,
    checkIn: row.check_in,
    checkOut: row.check_out,
    status: row.status,
    hoursWorked: Number(row.hours_worked || 0),
    faceMatch: Number(row.face_match || 0),
    employeeName: row.employeeName || row.employee_name || null,
    department: row.department || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializePayrollRun(row) {
  if (!row) return null;
  return {
    runId: row.run_id,
    monthKey: row.month_key,
    monthLabel: row.month_label,
    year: row.year,
    status: row.status,
    totalEmployees: Number(row.total_employees || 0),
    processed: Number(row.processed || 0),
    totalAmount: Number(row.total_amount || 0),
    processedDate: row.processed_date,
    processedBy: row.processed_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializePayslip(row) {
  if (!row) return null;
  let earnings = {};
  let deductions = {};

  try {
    earnings = JSON.parse(row.earnings_json || '{}');
  } catch {
    earnings = {};
  }

  try {
    deductions = JSON.parse(row.deductions_json || '{}');
  } catch {
    deductions = {};
  }

  return {
    payslipId:     row.payslip_id,
    empCode:       row.emp_code       || null,
    employeeId:    row.employee_id,
    employeeName:  row.employee_name,
    employeeEmail: row.employee_email || null,
    employeePhone: row.employee_phone || null,
    month:         row.month,
    basicSalary:   Number(row.basic_salary || 0),
    earnings,
    deductions,
    gross:         Number(row.gross || 0),
    netSalary:     Number(row.net_salary || 0),
    bankAccount:   row.bank_account,
    status:        row.status,
    dispute:       row.dispute        || null,
    createdAt:     row.created_at,
    updatedAt:     row.updated_at,
  };
}

function serializeLeave(row) {
  if (!row) return null;
  return {
    leaveId: row.leave_id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    leaveType: row.leave_type,
    fromDate: row.from_date,
    toDate: row.to_date,
    days: Number(row.days || 0),
    reason: row.reason,
    status: row.status,
    requestDate: row.request_date,
    approvedBy: row.approved_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeLeaveBalance(row) {
  if (!row) return null;
  return {
    employeeId: row.employee_id,
    annual: Number(row.annual || 0),
    sick: Number(row.sick || 0),
    casual: Number(row.casual || 0),
    updatedAt: row.updated_at,
  };
}

function serializeExpense(row) {
  if (!row) return null;
  return {
    expenseId: row.expense_id,
    date: row.date,
    category: row.category,
    amount: Number(row.amount || 0),
    description: row.description,
    vendor: row.vendor,
    receipt: row.receipt,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeShift(row) {
  if (!row) return null;
  return {
    shiftId: row.shift_id,
    shiftName: row.shift_name,
    startTime: row.start_time,
    endTime: row.end_time,
    breakDuration: Number(row.break_duration || 0),
    employees: Number(row.employees || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeBackup(row) {
  if (!row) return null;
  return {
    backupId: row.backup_id,
    fileName: row.file_name,
    size: row.size,
    status: row.status,
    backupType: row.backup_type,
    createdAt: row.created_at,
  };
}

function serializeSyncStatus(row) {
  if (!row) return null;
  return {
    lastSync: row.last_sync,
    nextSync: row.next_sync,
    syncStatus: row.sync_status,
    recordsSynced: Number(row.records_synced || 0),
    recordsNew: Number(row.records_new || 0),
    recordsModified: Number(row.records_modified || 0),
    offlineMode: Boolean(row.offline_mode),
    pendingChanges: Number(row.pending_changes || 0),
    updatedAt: row.updated_at,
  };
}

module.exports = {
  serializeEmployee,
  serializeAttendance,
  serializePayrollRun,
  serializePayslip,
  serializeLeave,
  serializeLeaveBalance,
  serializeExpense,
  serializeShift,
  serializeBackup,
  serializeSyncStatus,
};
