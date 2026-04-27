/**
 * Mock Data for EDGEFOLIO Frontend
 * Phase 1: Complete mock data for all pages
 * Used until backend API is ready (Phase 2)
 */

// ============================================
// EMPLOYEES DATA
// ============================================
export const mockEmployees = [
  {
    id: 'EMP-001',
    name: 'Ramesh Kumar',
    email: 'ramesh.kumar@edgefolio.com',
    phone: '+91-98765-43210',
    department: 'Production',
    designation: 'Senior Technician',
    joiningDate: '2022-01-15',
    salary: 35000,
    status: 'active',
    avatar: 'RK'
  },
  {
    id: 'EMP-002',
    name: 'Priya Sharma',
    email: 'priya.sharma@edgefolio.com',
    phone: '+91-98765-43211',
    department: 'HR',
    designation: 'HR Manager',
    joiningDate: '2021-06-10',
    salary: 45000,
    status: 'active',
    avatar: 'PS'
  },
  {
    id: 'EMP-003',
    name: 'Arun Singh',
    email: 'arun.singh@edgefolio.com',
    phone: '+91-98765-43212',
    department: 'Finance',
    designation: 'Accountant',
    joiningDate: '2022-03-20',
    salary: 32000,
    status: 'active',
    avatar: 'AS'
  },
  {
    id: 'EMP-004',
    name: 'Neha Patel',
    email: 'neha.patel@edgefolio.com',
    phone: '+91-98765-43213',
    department: 'Production',
    designation: 'Supervisor',
    joiningDate: '2021-09-05',
    salary: 40000,
    status: 'active',
    avatar: 'NP'
  },
  {
    id: 'EMP-005',
    name: 'Vikram Desai',
    email: 'vikram.desai@edgefolio.com',
    phone: '+91-98765-43214',
    department: 'Admin',
    designation: 'Admin Officer',
    joiningDate: '2022-11-01',
    salary: 28000,
    status: 'active',
    avatar: 'VD'
  },
  {
    id: 'EMP-006',
    name: 'Deepa Gupta',
    email: 'deepa.gupta@edgefolio.com',
    phone: '+91-98765-43215',
    department: 'Production',
    designation: 'Worker',
    joiningDate: '2023-01-10',
    salary: 22000,
    status: 'active',
    avatar: 'DG'
  },
  {
    id: 'EMP-007',
    name: 'Raj Malhotra',
    email: 'raj.malhotra@edgefolio.com',
    phone: '+91-98765-43216',
    department: 'Production',
    designation: 'Worker',
    joiningDate: '2023-02-15',
    salary: 21000,
    status: 'inactive',
    avatar: 'RM'
  },
  {
    id: 'EMP-008',
    name: 'Isha Reddy',
    email: 'isha.reddy@edgefolio.com',
    phone: '+91-98765-43217',
    department: 'HR',
    designation: 'Recruiter',
    joiningDate: '2022-07-20',
    salary: 35000,
    status: 'active',
    avatar: 'IR'
  },
  {
    id: 'EMP-009',
    name: 'Suresh Nair',
    email: 'suresh.nair@edgefolio.com',
    phone: '+91-98765-43218',
    department: 'Maintenance',
    designation: 'Technician',
    joiningDate: '2021-12-01',
    salary: 26000,
    status: 'active',
    avatar: 'SN'
  },
  {
    id: 'EMP-010',
    name: 'Anjali Chopra',
    email: 'anjali.chopra@edgefolio.com',
    phone: '+91-98765-43219',
    department: 'Finance',
    designation: 'Finance Officer',
    joiningDate: '2022-05-10',
    salary: 38000,
    status: 'active',
    avatar: 'AC'
  }
];

// ============================================
// ATTENDANCE DATA
// ============================================
export const mockAttendance = [
  {
    eventId: 'EVT-001',
    memberId: 'EMP-001',
    date: '2026-04-24',
    checkIn: '08:55',
    checkOut: '17:30',
    status: 'present',
    hoursWorked: 8.58,
    faceMatch: 98.5
  },
  {
    eventId: 'EVT-002',
    memberId: 'EMP-002',
    date: '2026-04-24',
    checkIn: '09:05',
    checkOut: '18:00',
    status: 'present',
    hoursWorked: 8.92,
    faceMatch: 99.2
  },
  {
    eventId: 'EVT-003',
    memberId: 'EMP-003',
    date: '2026-04-24',
    checkIn: null,
    checkOut: null,
    status: 'absent',
    hoursWorked: 0,
    faceMatch: 0
  },
  {
    eventId: 'EVT-004',
    memberId: 'EMP-004',
    date: '2026-04-24',
    checkIn: '08:45',
    checkOut: null,
    status: 'present',
    hoursWorked: 8.25,
    faceMatch: 97.8
  },
  {
    eventId: 'EVT-005',
    memberId: 'EMP-005',
    date: '2026-04-24',
    checkIn: '09:15',
    checkOut: '17:45',
    status: 'present',
    hoursWorked: 8.5,
    faceMatch: 96.3
  },
  {
    eventId: 'EVT-006',
    memberId: 'EMP-006',
    date: '2026-04-24',
    checkIn: '08:50',
    checkOut: '17:20',
    status: 'present',
    hoursWorked: 8.5,
    faceMatch: 98.9
  },
  {
    eventId: 'EVT-007',
    memberId: 'EMP-007',
    date: '2026-04-24',
    checkIn: null,
    checkOut: null,
    status: 'leave',
    hoursWorked: 0,
    faceMatch: 0
  },
  {
    eventId: 'EVT-008',
    memberId: 'EMP-008',
    date: '2026-04-24',
    checkIn: '09:00',
    checkOut: '18:15',
    status: 'present',
    hoursWorked: 9.25,
    faceMatch: 99.1
  },
  {
    eventId: 'EVT-009',
    memberId: 'EMP-009',
    date: '2026-04-24',
    checkIn: '08:40',
    checkOut: '17:10',
    status: 'present',
    hoursWorked: 8.5,
    faceMatch: 98.6
  },
  {
    eventId: 'EVT-010',
    memberId: 'EMP-010',
    date: '2026-04-24',
    checkIn: '09:10',
    checkOut: '18:00',
    status: 'present',
    hoursWorked: 8.83,
    faceMatch: 99.3
  }
];

// ============================================
// PAYROLL DATA
// ============================================
export const mockPayroll = [
  {
    runId: 'PAY-2026-04',
    month: 'April 2026',
    year: 2026,
    status: 'processing',
    totalEmployees: 9,
    processed: 9,
    totalAmount: 2850000,
    processedDate: '2026-04-24',
    processedBy: 'admin@edgefolio.com'
  },
  {
    runId: 'PAY-2026-03',
    month: 'March 2026',
    year: 2026,
    status: 'completed',
    totalEmployees: 9,
    processed: 9,
    totalAmount: 2850000,
    processedDate: '2026-03-31',
    processedBy: 'admin@edgefolio.com'
  },
  {
    runId: 'PAY-2026-02',
    month: 'February 2026',
    year: 2026,
    status: 'completed',
    totalEmployees: 8,
    processed: 8,
    totalAmount: 2650000,
    processedDate: '2026-02-28',
    processedBy: 'admin@edgefolio.com'
  }
];

export const mockPayslips = [
  {
    payslipId: 'SLIP-2026-04-001',
    employeeId: 'EMP-001',
    employeeName: 'Ramesh Kumar',
    month: 'April 2026',
    basicSalary: 35000,
    earnings: {
      basic: 35000,
      da: 3500,
      hra: 2500,
      other: 0
    },
    deductions: {
      pf: 2500,
      esi: 800,
      tax: 2200,
      other: 0
    },
    gross: 41000,
    netSalary: 35500,
    bankAccount: 'XXXX-XXXX-XXXX-3421',
    status: 'generated'
  },
  {
    payslipId: 'SLIP-2026-04-002',
    employeeId: 'EMP-002',
    employeeName: 'Priya Sharma',
    month: 'April 2026',
    basicSalary: 45000,
    earnings: {
      basic: 45000,
      da: 4500,
      hra: 3200,
      other: 0
    },
    deductions: {
      pf: 3200,
      esi: 1000,
      tax: 3500,
      other: 0
    },
    gross: 52700,
    netSalary: 45000,
    bankAccount: 'XXXX-XXXX-XXXX-5678',
    status: 'generated'
  }
];

// ============================================
// LEAVES DATA
// ============================================
export const mockLeaves = [
  {
    leaveId: 'LEAVE-001',
    employeeId: 'EMP-001',
    employeeName: 'Ramesh Kumar',
    leaveType: 'sick',
    fromDate: '2026-04-25',
    toDate: '2026-04-25',
    days: 1,
    reason: 'Not feeling well',
    status: 'pending',
    requestDate: '2026-04-24',
    approvedBy: null
  },
  {
    leaveId: 'LEAVE-002',
    employeeId: 'EMP-007',
    employeeName: 'Raj Malhotra',
    leaveType: 'casual',
    fromDate: '2026-04-24',
    toDate: '2026-04-24',
    days: 1,
    reason: 'Personal work',
    status: 'approved',
    requestDate: '2026-04-23',
    approvedBy: 'Priya Sharma'
  },
  {
    leaveId: 'LEAVE-003',
    employeeId: 'EMP-003',
    employeeName: 'Arun Singh',
    leaveType: 'casual',
    fromDate: '2026-04-24',
    toDate: '2026-04-25',
    days: 2,
    reason: 'Family visit',
    status: 'rejected',
    requestDate: '2026-04-22',
    approvedBy: 'Priya Sharma'
  },
  {
    leaveId: 'LEAVE-004',
    employeeId: 'EMP-002',
    employeeName: 'Priya Sharma',
    leaveType: 'annual',
    fromDate: '2026-05-01',
    toDate: '2026-05-05',
    days: 5,
    reason: 'Vacation',
    status: 'pending',
    requestDate: '2026-04-20',
    approvedBy: null
  },
  {
    leaveId: 'LEAVE-005',
    employeeId: 'EMP-005',
    employeeName: 'Vikram Desai',
    leaveType: 'sick',
    fromDate: '2026-04-10',
    toDate: '2026-04-12',
    days: 3,
    reason: 'Fever',
    status: 'approved',
    requestDate: '2026-04-09',
    approvedBy: 'Priya Sharma'
  }
];

export const mockLeaveBalance = {
  'EMP-001': { annual: 15, sick: 10, casual: 8 },
  'EMP-002': { annual: 18, sick: 10, casual: 8 },
  'EMP-003': { annual: 12, sick: 8, casual: 6 },
  'EMP-004': { annual: 16, sick: 10, casual: 8 },
  'EMP-005': { annual: 14, sick: 7, casual: 5 },
  'EMP-006': { annual: 18, sick: 10, casual: 8 },
  'EMP-007': { annual: 10, sick: 5, casual: 3 },
  'EMP-008': { annual: 15, sick: 10, casual: 8 },
  'EMP-009': { annual: 16, sick: 10, casual: 8 },
  'EMP-010': { annual: 14, sick: 10, casual: 8 }
};

// ============================================
// REPORTS DATA
// ============================================
export const mockReports = [
  {
    reportId: 'RPT-001',
    reportType: 'Attendance Summary',
    month: 'April 2026',
    totalDays: 20,
    presentDays: 18,
    absentDays: 1,
    leaveDays: 1,
    avgAttendance: 90,
    generatedDate: '2026-04-24'
  },
  {
    reportId: 'RPT-002',
    reportType: 'Payroll Summary',
    month: 'April 2026',
    totalEmployees: 9,
    totalPayroll: 2850000,
    avgSalary: 316666,
    generatedDate: '2026-04-24'
  },
  {
    reportId: 'RPT-003',
    reportType: 'Leave Summary',
    month: 'April 2026',
    totalLeaveRequests: 5,
    approvedLeaves: 2,
    rejectedLeaves: 1,
    pendingLeaves: 2,
    generatedDate: '2026-04-24'
  }
];

export const mockAttendanceReport = [
  { employee: 'Ramesh Kumar', dept: 'Production', present: 18, absent: 1, leave: 1, percentage: 90 },
  { employee: 'Priya Sharma', dept: 'HR', present: 19, absent: 0, leave: 1, percentage: 95 },
  { employee: 'Arun Singh', dept: 'Finance', present: 17, absent: 2, leave: 1, percentage: 85 },
  { employee: 'Neha Patel', dept: 'Production', present: 19, absent: 0, leave: 1, percentage: 95 },
  { employee: 'Vikram Desai', dept: 'Admin', present: 18, absent: 1, leave: 1, percentage: 90 }
];

// ============================================
// CASHBOOK/EXPENSES DATA
// ============================================
export const mockExpenses = [
  {
    expenseId: 'EXP-001',
    date: '2026-04-24',
    category: 'Materials',
    amount: 5500,
    description: 'Raw materials for production',
    vendor: 'ABC Suppliers',
    receipt: 'receipt-001.pdf',
    status: 'approved'
  },
  {
    expenseId: 'EXP-002',
    date: '2026-04-23',
    category: 'Utilities',
    amount: 3200,
    description: 'Electricity bill',
    vendor: 'Power Company',
    receipt: 'receipt-002.pdf',
    status: 'approved'
  },
  {
    expenseId: 'EXP-003',
    date: '2026-04-22',
    category: 'Maintenance',
    amount: 2800,
    description: 'Equipment maintenance',
    vendor: 'Tech Services',
    receipt: 'receipt-003.pdf',
    status: 'pending'
  },
  {
    expenseId: 'EXP-004',
    date: '2026-04-21',
    category: 'Travel',
    amount: 1200,
    description: 'Client meeting travel',
    vendor: 'Transport',
    receipt: 'receipt-004.pdf',
    status: 'approved'
  },
  {
    expenseId: 'EXP-005',
    date: '2026-04-20',
    category: 'Office',
    amount: 800,
    description: 'Office supplies',
    vendor: 'Stationery Store',
    receipt: 'receipt-005.pdf',
    status: 'approved'
  }
];

export const expenseCategories = ['Materials', 'Utilities', 'Maintenance', 'Travel', 'Office', 'Other'];

// ============================================
// SETTINGS DATA
// ============================================
export const mockCompanySettings = {
  companyName: 'EDGEFOLIO Manufacturing',
  address: '123 Industrial Avenue, Industrial City',
  city: 'Mumbai',
  state: 'Maharashtra',
  country: 'India',
  pincode: '400001',
  phone: '+91-22-1234-5678',
  email: 'contact@edgefolio.com',
  gstNumber: '27ABCDE1234F2Z5',
  panNumber: 'AAAPN1234K',
  website: 'www.edgefolio.com'
};

export const mockWorkingHours = {
  startTime: '09:00',
  endTime: '18:00',
  breakDuration: 60,
  daysPerWeek: 5,
  hoursPerDay: 8
};

export const mockShifts = [
  {
    shiftId: 'SHIFT-001',
    shiftName: 'Morning Shift',
    startTime: '06:00',
    endTime: '14:00',
    breakDuration: 60,
    employees: 5
  },
  {
    shiftId: 'SHIFT-002',
    shiftName: 'Evening Shift',
    startTime: '14:00',
    endTime: '22:00',
    breakDuration: 60,
    employees: 4
  },
  {
    shiftId: 'SHIFT-003',
    shiftName: 'Night Shift',
    startTime: '22:00',
    endTime: '06:00',
    breakDuration: 60,
    employees: 0
  }
];

export const mockHolidays = [
  { holidayId: 'HOL-001', date: '2026-01-26', name: 'Republic Day', type: 'national' },
  { holidayId: 'HOL-002', date: '2026-03-25', name: 'Holi', type: 'national' },
  { holidayId: 'HOL-003', date: '2026-04-14', name: 'Ambedkar Jayanti', type: 'national' },
  { holidayId: 'HOL-004', date: '2026-08-15', name: 'Independence Day', type: 'national' },
  { holidayId: 'HOL-005', date: '2026-10-02', name: 'Gandhi Jayanti', type: 'national' }
];

export const mockDeductions = [
  { deductionId: 'DED-001', name: 'Provident Fund (PF)', percentage: 12, type: 'fixed' },
  { deductionId: 'DED-002', name: 'Employee State Insurance (ESI)', percentage: 0.75, type: 'fixed' },
  { deductionId: 'DED-003', name: 'Income Tax', percentage: 5, type: 'variable' },
  { deductionId: 'DED-004', name: 'Other Deductions', percentage: 0, type: 'optional' }
];

// ============================================
// BACKUP & SYNC DATA
// ============================================
export const mockBackups = [
  {
    backupId: 'BACKUP-001',
    date: '2026-04-24',
    time: '22:00',
    size: '245 MB',
    status: 'completed',
    backupType: 'full'
  },
  {
    backupId: 'BACKUP-002',
    date: '2026-04-23',
    time: '22:00',
    size: '125 MB',
    status: 'completed',
    backupType: 'incremental'
  },
  {
    backupId: 'BACKUP-003',
    date: '2026-04-22',
    time: '22:00',
    size: '98 MB',
    status: 'completed',
    backupType: 'incremental'
  }
];

export const mockSyncStatus = {
  lastSync: '2026-04-24 15:30:45',
  nextSync: '2026-04-24 20:00:00',
  syncStatus: 'completed',
  recordsSynced: 1245,
  recordsNew: 45,
  recordsModified: 12,
  offlineMode: false,
  pendingChanges: 0
};

export const mockDatabaseHealth = {
  databaseSize: '485 MB',
  recordCounts: {
    employees: 10,
    attendance: 450,
    payroll: 45,
    leaves: 25,
    expenses: 150
  },
  integrityStatus: 'healthy',
  lastCheck: '2026-04-24 10:00:00',
  indexes: 'optimized',
  fragmentation: 5
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

export const getEmployeeById = (id) => {
  return mockEmployees.find(emp => emp.id === id);
};

export const getAttendanceByDate = (date) => {
  return mockAttendance.filter(att => att.date === date);
};

export const getTodayAttendance = () => {
  const today = new Date().toISOString().split('T')[0];
  return getAttendanceByDate(today);
};

export const getEmployeeLeaveBalance = (employeeId) => {
  return mockLeaveBalance[employeeId] || { annual: 0, sick: 0, casual: 0 };
};

export const getDepartmentStats = () => {
  const departments = {};
  mockEmployees.forEach(emp => {
    if (!departments[emp.department]) {
      departments[emp.department] = 0;
    }
    departments[emp.department]++;
  });
  return departments;
};

export const getPayrollStats = () => {
  const latestPayroll = mockPayroll[0];
  return {
    totalEmployees: latestPayroll.totalEmployees,
    totalAmount: latestPayroll.totalAmount,
    avgSalary: Math.round(latestPayroll.totalAmount / latestPayroll.totalEmployees),
    month: latestPayroll.month
  };
};

export const getAttendanceStats = () => {
  const today = mockAttendance.filter(att => att.date === '2026-04-24');
  const present = today.filter(att => att.status === 'present').length;
  const absent = today.filter(att => att.status === 'absent').length;
  const leave = today.filter(att => att.status === 'leave').length;
  
  return {
    total: mockEmployees.length,
    present,
    absent,
    leave,
    percentage: Math.round((present / mockEmployees.length) * 100)
  };
};

export const getExpenseSummary = () => {
  const today = new Date().toISOString().split('T')[0];
  const thisMonth = new Date().getMonth() + 1;
  const thisYear = new Date().getFullYear();
  
  const todayExpenses = mockExpenses
    .filter(exp => exp.date === today)
    .reduce((sum, exp) => sum + exp.amount, 0);
  
  const monthExpenses = mockExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  
  return {
    today: todayExpenses,
    thisMonth: monthExpenses,
    byCategory: expenseCategories.map(cat => ({
      category: cat,
      amount: mockExpenses
        .filter(exp => exp.category === cat)
        .reduce((sum, exp) => sum + exp.amount, 0)
    }))
  };
};
