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

    // If we get a 401 on a non-auth endpoint, clear local session and signal the app
    if (
      err.response.status === 401 &&
      !err.config?.url?.includes('/auth/')
    ) {
      localStorage.removeItem('ef_token')
      localStorage.removeItem('ef_user')
      window.dispatchEvent(new Event('ef:unauthorized'))
    }

    const responseData = err.response.data || {}
    const msg = responseData.error || responseData.message || err.message || 'Request failed'

    // Attach license error codes so pages can detect them
    const licenseCode = responseData.code
    if (licenseCode === 'LICENSE_READONLY' || licenseCode === 'LICENSE_EMPLOYEE_LIMIT' || licenseCode === 'LICENSE_REQUIRED') {
      const enhanced = new Error(msg)
      enhanced.code = licenseCode
      enhanced.statusCode = err.response.status
      return Promise.reject(enhanced)
    }

    return Promise.reject(new Error(msg))
  },
)

// ── License ───────────────────────────────────────────────────────────────────
export const getLicenseStatus  = ()       => http.get('/license/status')
export const activateLicense   = (key)    => http.post('/license/activate', { licenseKey: key })
export const signupTrial       = (form)   => http.post('/license/signup', form)
export const refreshLicense    = ()       => http.post('/license/refresh')
export const getAnnouncement   = ()       => http.get('/license/announcement')

// ── Auth ──────────────────────────────────────────────────────────────────────
export const login          = (email, password) => http.post('/auth/login', { email, password })
export const getAuthStatus  = ()                => http.get('/auth/status')
export const setupAdmin     = (email, password) => http.post('/auth/setup', { email, password })

// ── Employees ─────────────────────────────────────────────────────────────────
export const getEmployees        = (params)     => http.get('/employees', { params })
export const getEmployeeSummary  = ()           => http.get('/employees/summary')
export const createEmployee      = (data)       => http.post('/employees', data)
export const updateEmployee      = (id, data)   => http.put(`/employees/${id}`, data)
export const deleteEmployee      = (id)         => http.delete(`/employees/${id}`)
// Custom fields
export const getCustomFields     = ()           => http.get('/employees/fields')
export const createCustomField   = (data)       => http.post('/employees/fields', data)
export const updateCustomField   = (id, data)   => http.put(`/employees/fields/${id}`, data)
export const deleteCustomField   = (id)         => http.delete(`/employees/fields/${id}`)
export const getEmployeeCustomValues  = (id)    => http.get(`/employees/${id}/custom-values`)
export const setEmployeeCustomValues  = (id, data) => http.post(`/employees/${id}/custom-values`, data)

// ── Attendance ────────────────────────────────────────────────────────────────
export const getAttendance        = (params) => http.get('/attendance', { params })
export const getAttendanceSummary = (params) => http.get('/attendance/summary', { params })
export const getAttendanceRange   = (params) => http.get('/attendance', { params })
export const logAttendanceEvent   = (data)   => http.post('/attendance/event', data)
export const importAttendance     = (data)   => http.post('/attendance/import', data)
export const getJenixSheets       = (data)   => http.post('/attendance/jenix-sheets', data, { timeout: 30000 })
export const parseJenixFile       = (data)   => http.post('/attendance/parse-jenix', data, { timeout: 30000 })

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

// ── Earnings Config ───────────────────────────────────────────────────────────
export const getEarnings      = ()           => http.get('/earnings')
export const createEarning    = (data)       => http.post('/earnings', data)
export const updateEarning    = (id, data)   => http.put(`/earnings/${id}`, data)
export const deleteEarning    = (id)         => http.delete(`/earnings/${id}`)

// ── Payslip Disputes ──────────────────────────────────────────────────────────
export const getDisputes      = (status)     => http.get('/payroll/disputes', { params: status ? { status } : {} })
export const getDisputeCount  = ()           => http.get('/payroll/disputes/count')
export const raiseDispute     = (payslipId, data) => http.post(`/payroll/slip/${payslipId}/dispute`, data)
export const resolveDispute   = (disputeId, data) => http.patch(`/payroll/disputes/${disputeId}/resolve`, data)

// ── Machine (ZK Teco / network pull) ─────────────────────────────────────────
export const testMachineConnection = (data) => http.post('/machines/test', data, { timeout: 35000 })
export const pullFromMachine       = (data) => http.post('/machines/pull', data, { timeout: 125000 })

// ── Machine import — staging pipeline (FK-safe) ───────────────────────────────
export const machineImportAlog    = (data) => http.post('/attendance/machine-import/alog',  data, { timeout: 60000 })
export const machineImportJenix   = (data) => http.post('/attendance/machine-import/jenix', data, { timeout: 60000 })
export const getMachineImportBatches  = ()         => http.get('/attendance/machine-import/batches')
export const getMachineImportUnmapped = ()         => http.get('/attendance/machine-import/unmapped')
export const getMachineImportMappings = ()         => http.get('/attendance/machine-import/mappings')
export const saveMachineImportMappings   = (data)  => http.post('/attendance/machine-import/mappings', data)
export const deleteMachineImportMappings = (data)  => http.delete('/attendance/machine-import/mappings', { data })
export const commitMachineImport  = (data)         => http.post('/attendance/machine-import/commit', data || {})
export const getMachineImportSummary = (batchId)   => http.get('/attendance/machine-import/summary', { params: batchId ? { batchId } : {} })

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

// ── Bank Payment Advice ───────────────────────────────────────────────────────
export const getBankTemplates    = ()           => http.get('/payments/templates')
export const createBankTemplate  = (data)       => http.post('/payments/templates', data)
export const updateBankTemplate  = (id, data)   => http.put(`/payments/templates/${id}`, data)
export const deleteBankTemplate  = (id)         => http.delete(`/payments/templates/${id}`)

export const getPaymentBatches   = ()           => http.get('/payments/batches')
export const getPaymentBatch     = (id)         => http.get(`/payments/batches/${id}`)
export const createPaymentBatch  = (data)       => http.post('/payments/batches', data)
export const deletePaymentBatch  = (id)         => http.delete(`/payments/batches/${id}`)
export const importBankResponse  = (id, data)   => http.post(`/payments/batches/${id}/import-response`, data)

// ── U5 Face Recognition Machines ─────────────────────────────────────────────
export const getU5Devices        = ()           => http.get('/u5/devices')
export const createU5Device      = (data)       => http.post('/u5/devices', data)
export const updateU5Device      = (id, data)   => http.put(`/u5/devices/${id}`, data)
export const deleteU5Device      = (id)         => http.delete(`/u5/devices/${id}`)
export const getU5Status         = ()           => http.get('/u5/status')
export const sendU5Command       = (data)       => http.post('/u5/command', data)
export const getU5Preferences    = ()           => http.get('/u5/preferences')
export const updateU5Preferences = (data)       => http.put('/u5/preferences', data)

// ── M68 (WitEasy FK BS-protocol) Machines ────────────────────────────────────
export const getM68Devices       = ()           => http.get('/m68/devices')
export const createM68Device     = (data)       => http.post('/m68/devices', data)
export const updateM68Device     = (id, data)   => http.put(`/m68/devices/${id}`, data)
export const deleteM68Device     = (id)         => http.delete(`/m68/devices/${id}`)
export const getM68DeviceUsers   = (id)         => http.get(`/m68/devices/${id}/users`)
export const getM68Status        = ()           => http.get('/m68/status')
export const sendM68Command      = (data)       => http.post('/m68/command', data)
export const getM68Events        = (limit = 50) => http.get('/m68/events', { params: { limit } })

export default http
