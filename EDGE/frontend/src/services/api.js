import axios from 'axios'

const BASE_URL = 'http://127.0.0.1:7001/api/v1'

const http = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('ef_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (!err.response) {
      return Promise.reject(new Error('Cannot connect to EDGEFOLIO service. Ensure the app is running.'))
    }
    const msg = err.response.data?.error || err.response.data?.message || err.message || 'Request failed'
    return Promise.reject(new Error(msg))
  },
)

// ── Auth ──────────────────────────────────────────────────────────────────────
export const login = (email, password) => http.post('/auth/login', { email, password })

// ── Employees ─────────────────────────────────────────────────────────────────
export const getEmployees   = (params) => http.get('/employees', { params })
export const getEmployeeSummary = () => http.get('/employees/summary')
export const createEmployee = (data)   => http.post('/employees', data)
export const updateEmployee = (id, data) => http.put(`/employees/${id}`, data)
export const deleteEmployee = (id)     => http.delete(`/employees/${id}`)

// ── Attendance ────────────────────────────────────────────────────────────────
export const getAttendance        = (params) => http.get('/attendance', { params })
export const getAttendanceSummary = (params) => http.get('/attendance/summary', { params })
export const logAttendanceEvent   = (data)   => http.post('/attendance/event', data)
export const importAttendance     = (data)   => http.post('/attendance/import', data)

// ── Payroll ───────────────────────────────────────────────────────────────────
export const getPayrollRuns     = ()        => http.get('/payroll/runs')
export const runPayroll         = (monthKey) => http.post('/payroll/run', { monthKey })
export const approvePayrollRun  = (runId)   => http.post(`/payroll/approve/${runId}`)
export const getPayslips        = (month)   => http.get('/payroll/payslips', { params: { month } })
export const getPayslip         = (id)      => http.get(`/payroll/slip/${id}`)

// ── Leaves ────────────────────────────────────────────────────────────────────
export const getLeaves        = (params) => http.get('/leaves', { params })
export const getLeaveBalances = ()       => http.get('/leaves/balances')
export const createLeave      = (data)   => http.post('/leaves', data)
export const updateLeaveStatus = (leaveId, status) =>
  http.patch(`/leaves/${leaveId}/status`, { status })

// ── Cashbook ──────────────────────────────────────────────────────────────────
export const getExpenses        = (params) => http.get('/cashbook', { params })
export const getCashbookSummary = ()       => http.get('/cashbook/summary')
export const createExpense      = (data)   => http.post('/cashbook', data)
export const approveExpense     = (id)     => http.patch(`/cashbook/${id}/approve`)
export const deleteExpense      = (id)     => http.delete(`/cashbook/${id}`)

// ── Reports ───────────────────────────────────────────────────────────────────
export const getDashboard          = ()       => http.get('/reports/dashboard')
export const getAttendanceReport   = (params) => http.get('/reports/attendance', { params })
export const getSalaryReport       = (params) => http.get('/reports/salary', { params })

// ── Settings ──────────────────────────────────────────────────────────────────
export const getCompanySettings    = ()     => http.get('/settings/company')
export const updateCompanySettings = (data) => http.put('/settings/company', data)
export const getWorkingHours       = ()     => http.get('/settings/working-hours')
export const updateWorkingHours    = (data) => http.put('/settings/working-hours', data)

// ── Shifts ────────────────────────────────────────────────────────────────────
export const getShifts    = ()           => http.get('/shifts')
export const createShift  = (data)       => http.post('/shifts', data)
export const updateShift  = (id, data)   => http.put(`/shifts/${id}`, data)
export const deleteShift  = (id)         => http.delete(`/shifts/${id}`)

// ── Departments ───────────────────────────────────────────────────────────────
export const getDepartments    = ()           => http.get('/departments')
export const createDepartment  = (data)       => http.post('/departments', data)
export const updateDepartment  = (id, data)   => http.put(`/departments/${id}`, data)
export const deleteDepartment  = (id)         => http.delete(`/departments/${id}`)

// ── Holidays ──────────────────────────────────────────────────────────────────
export const getHolidays    = (year)      => http.get('/holidays', { params: year ? { year } : {} })
export const createHoliday  = (data)      => http.post('/holidays', data)
export const updateHoliday  = (id, data)  => http.put(`/holidays/${id}`, data)
export const deleteHoliday  = (id)        => http.delete(`/holidays/${id}`)

// ── Deductions ────────────────────────────────────────────────────────────────
export const getDeductions    = ()           => http.get('/deductions')
export const createDeduction  = (data)       => http.post('/deductions', data)
export const updateDeduction  = (id, data)   => http.put(`/deductions/${id}`, data)
export const deleteDeduction  = (id)         => http.delete(`/deductions/${id}`)

// ── Machine (ZK Teco / network pull) ─────────────────────────────────────────
export const testMachineConnection = (data) => http.post('/machines/test', data, { timeout: 35000 })
export const pullFromMachine       = (data) => http.post('/machines/pull', data, { timeout: 125000 })

// ── Sync ──────────────────────────────────────────────────────────────────────
export const getSyncStatus = () => http.get('/sync/status')
export const pushSync      = () => http.post('/sync/push')

// ── Backup ────────────────────────────────────────────────────────────────────
export const getBackups         = ()           => http.get('/backup')
export const createLocalBackup  = ()           => http.post('/backup/local')
export const getDataInfo        = ()           => http.get('/backup/data-info')
export const getCustomBackupPath = ()          => http.get('/backup/custom-path')
export const setCustomBackupPath = (data)      => http.put('/backup/custom-path', data)
export const clearCustomBackupPath = ()        => http.delete('/backup/custom-path')
export const restoreFromBackup  = (data)       => http.post('/backup/restore', data, { timeout: 60000 })

export default http
