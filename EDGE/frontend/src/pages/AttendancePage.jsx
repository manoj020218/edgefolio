import React, { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { Clock, Upload, RefreshCw, Download } from 'lucide-react'
import { Button, Card, Badge, Alert, Modal, Select } from '../components/atomic'
import { getAttendance, getAttendanceSummary, logAttendanceEvent, getEmployees, getAttendanceRange } from '../services/api'
import { ImportModal } from '../components/attendance/ImportModal'

// ─── Main AttendancePage ──────────────────────────────────────────────────────
export const AttendancePage = () => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [attendanceList, setAttendanceList] = useState([])
  const [stats, setStats]     = useState({ present: 0, absent: 0, leave: 0, total: 0 })
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [showImport, setShowImport] = useState(false)

  const [selectedEmpId, setSelectedEmpId] = useState('')
  const [isCheckingIn, setIsCheckingIn]   = useState(false)
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const [checkMessage, setCheckMessage]   = useState('')
  const [showExport, setShowExport]       = useState(false)
  const [exportForm, setExportForm]       = useState({
    from: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
    format: 'xlsx',
  })
  const [exporting, setExporting] = useState(false)

  const fetchAttendance = () => {
    setLoading(true)
    Promise.all([
      getAttendance({ date: selectedDate }),
      getAttendanceSummary({ date: selectedDate }),
      employees.length === 0 ? getEmployees() : Promise.resolve({ data: employees }),
    ]).then(([attRes, sumRes, empRes]) => {
      setAttendanceList(attRes.data || [])
      const s = sumRes.data || {}
      setStats({ present: s.present ?? 0, absent: s.absent ?? 0, leave: s.leave ?? 0, total: s.total ?? 0 })
      if (employees.length === 0) setEmployees(empRes.data || [])
    }).catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchAttendance() }, [selectedDate])

  const filteredAttendance = filterStatus === 'all'
    ? attendanceList
    : attendanceList.filter((a) => a.status === filterStatus)

  const handleCheckIn = async () => {
    if (!selectedEmpId) { setError('Select an employee first'); return }
    setIsCheckingIn(true)
    try {
      await logAttendanceEvent({ memberId: selectedEmpId, eventType: 'CHECK_IN', date: selectedDate })
      setCheckMessage('Check-in recorded!')
      fetchAttendance()
    } catch (e) { setError(e.message) }
    finally { setIsCheckingIn(false) }
  }

  const handleCheckOut = async () => {
    if (!selectedEmpId) { setError('Select an employee first'); return }
    setIsCheckingOut(true)
    try {
      await logAttendanceEvent({ memberId: selectedEmpId, eventType: 'CHECK_OUT', date: selectedDate })
      setCheckMessage('Check-out recorded!')
      fetchAttendance()
    } catch (e) { setError(e.message) }
    finally { setIsCheckingOut(false) }
  }

  const percentage = stats.total > 0 ? ((stats.present / stats.total) * 100).toFixed(1) : '0'

  const handleExport = async () => {
    setExporting(true)
    try {
      // Fetch all records in range by querying each day (simple approach via backend list)
      const allRecords = []
      const d = new Date(exportForm.from)
      const end = new Date(exportForm.to)
      while (d <= end) {
        const dateStr = d.toISOString().split('T')[0]
        const res = await getAttendanceRange({ date: dateStr })
        if (res.data?.length) allRecords.push(...res.data)
        d.setDate(d.getDate() + 1)
      }

      const rows = allRecords.map((r) => ({
        Date:        r.date,
        Employee:    r.employeeName || r.memberId,
        Department:  r.department || '',
        'Check In':  r.checkIn  || '',
        'Check Out': r.checkOut || '',
        Hours:       r.hoursWorked ? Number(r.hoursWorked).toFixed(2) : '',
        Status:      r.status,
        Mode:        r.attendanceMode || '',
      }))

      const fmt = exportForm.format
      const prefix = `attendance-${exportForm.from}-to-${exportForm.to}`

      if (fmt === 'xlsx') {
        const ws = XLSX.utils.json_to_sheet(rows)
        ws['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 7 }, { wch: 10 }, { wch: 10 }]
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Attendance')
        XLSX.writeFile(wb, `${prefix}.xlsx`)
      } else if (fmt === 'csv') {
        const ws = XLSX.utils.json_to_sheet(rows)
        const csv = XLSX.utils.sheet_to_csv(ws)
        const blob = new Blob([csv], { type: 'text/csv' })
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
        a.download = `${prefix}.csv`; a.click()
      } else if (fmt === 'json') {
        const blob = new Blob([JSON.stringify(allRecords, null, 2)], { type: 'application/json' })
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
        a.download = `${prefix}.json`; a.click()
      } else if (fmt === 'txt') {
        const header = ['Date','Employee','Department','Check In','Check Out','Hours','Status'].join('\t')
        const body = rows.map((r) => [r.Date, r.Employee, r.Department, r['Check In'], r['Check Out'], r.Hours, r.Status].join('\t')).join('\n')
        const blob = new Blob([header + '\n' + body], { type: 'text/plain' })
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
        a.download = `${prefix}.txt`; a.click()
      }
      setShowExport(false)
    } catch (e) { setError(e.message) }
    finally { setExporting(false) }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Attendance Management</h1>
          <p className="text-slate-400 mt-1">Track employee check-in/out records</p>
        </div>
        <div className="flex gap-2">
          <Button icon={Download} variant="secondary" onClick={() => setShowExport(true)}>Export</Button>
          <Button icon={Upload} variant="secondary" onClick={() => setShowImport(true)}>Import from Machine</Button>
          <Button icon={RefreshCw} variant="secondary" onClick={fetchAttendance}>Refresh</Button>
        </div>
      </div>

      {error && <Alert variant="danger" message={error} onClose={() => setError('')} />}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><div className="space-y-2">
          <p className="text-slate-400 text-sm font-medium">Present</p>
          <p className="text-3xl font-bold text-green-400">{stats.present}</p>
          <p className="text-xs text-slate-500">of {stats.total} employees</p>
        </div></Card>
        <Card><div className="space-y-2">
          <p className="text-slate-400 text-sm font-medium">Absent</p>
          <p className="text-3xl font-bold text-red-400">{stats.absent}</p>
        </div></Card>
        <Card><div className="space-y-2">
          <p className="text-slate-400 text-sm font-medium">On Leave</p>
          <p className="text-3xl font-bold text-amber-400">{stats.leave}</p>
        </div></Card>
        <Card><div className="space-y-2">
          <p className="text-slate-400 text-sm font-medium">Attendance %</p>
          <p className="text-3xl font-bold text-sky-400">{percentage}%</p>
        </div></Card>
      </div>

      {/* Manual Check-In / Out */}
      <Card className="bg-gradient-to-r from-slate-800 to-slate-700">
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-slate-100">Record Attendance</h2>
          {checkMessage && (
            <div className="p-2 bg-green-900/30 border border-green-700 rounded text-green-300 text-sm">{checkMessage}</div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select
              value={selectedEmpId}
              onChange={(e) => { setSelectedEmpId(e.target.value); setCheckMessage('') }}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
            >
              <option value="">— Select Employee —</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
            <Button variant="primary"   isFullWidth icon={Clock} isLoading={isCheckingIn}  onClick={handleCheckIn}>Check In</Button>
            <Button variant="secondary" isFullWidth icon={Clock} isLoading={isCheckingOut} onClick={handleCheckOut}>Check Out</Button>
          </div>
        </div>
      </Card>

      {/* Daily Register */}
      <Card>
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-slate-100">Daily Attendance Register</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-sm text-slate-400 mb-1 block">Select Date</label>
              <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none" />
            </div>
            <div className="flex items-end">
              <div className="flex gap-2">
                {['all', 'present', 'absent', 'leave'].map((s) => (
                  <button key={s} onClick={() => setFilterStatus(s)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      filterStatus === s ? 'bg-sky-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="py-8 text-center text-slate-400">Loading attendance...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4 text-slate-400 font-semibold">Employee</th>
                    <th className="text-left py-3 px-4 text-slate-400 font-semibold">Department</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">Check-In</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">Check-Out</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">Hours</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">Status</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">Face %</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAttendance.length > 0 ? (
                    filteredAttendance.map((rec, idx) => (
                      <tr key={rec.eventId} className={idx % 2 === 0 ? 'bg-slate-900/50' : ''}>
                        <td className="py-3 px-4 text-slate-100 font-medium">{rec.employeeName}</td>
                        <td className="py-3 px-4 text-slate-400">{rec.department}</td>
                        <td className="py-3 px-4 text-center">
                          {rec.checkIn  ? <span className="text-green-400">{rec.checkIn}</span>  : <span className="text-slate-500">—</span>}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {rec.checkOut ? <span className="text-blue-400">{rec.checkOut}</span>  : <span className="text-slate-500">—</span>}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {rec.hoursWorked > 0 ? <span className="text-slate-300">{Number(rec.hoursWorked).toFixed(2)}h</span> : <span className="text-slate-500">—</span>}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Badge variant={rec.status === 'present' ? 'success' : rec.status === 'absent' ? 'danger' : 'warning'}>
                            {(rec.status || '').charAt(0).toUpperCase() + (rec.status || '').slice(1)}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {rec.faceMatch > 0 ? (
                            <span className={rec.faceMatch > 95 ? 'text-green-400' : 'text-amber-400'}>{rec.faceMatch}%</span>
                          ) : <span className="text-slate-500">—</span>}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="7" className="py-8 text-center text-slate-400">No attendance records for this date</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-700 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Records:</span>
              <span className="font-bold text-slate-100">{filteredAttendance.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Present:</span>
              <span className="font-bold text-green-400">{stats.present}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Rate:</span>
              <span className="font-bold text-sky-400">{percentage}%</span>
            </div>
          </div>
        </div>
      </Card>

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={() => { fetchAttendance(); setShowImport(false) }}
        />
      )}

      {/* Export Modal */}
      <Modal isOpen={showExport} onClose={() => setShowExport(false)} title="Export Attendance" size="md">
        <div className="space-y-4">
          <p className="text-slate-400 text-sm">Select date range and format to export attendance records.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">From Date</label>
              <input type="date" value={exportForm.from}
                onChange={(e) => setExportForm((p) => ({ ...p, from: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:border-sky-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">To Date</label>
              <input type="date" value={exportForm.to}
                onChange={(e) => setExportForm((p) => ({ ...p, to: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:border-sky-500 focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Export Format</label>
            <div className="grid grid-cols-4 gap-2">
              {['xlsx', 'csv', 'json', 'txt'].map((fmt) => (
                <button key={fmt} onClick={() => setExportForm((p) => ({ ...p, format: fmt }))}
                  className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    exportForm.format === fmt
                      ? 'bg-sky-600 border-sky-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'
                  }`}>
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <p className="text-slate-500 text-xs">
            Each day is fetched separately — large ranges may take a moment.
          </p>
        </div>
        <div className="flex gap-2 mt-6">
          <Button variant="secondary" onClick={() => setShowExport(false)} isFullWidth>Cancel</Button>
          <Button variant="primary" icon={Download} onClick={handleExport} isLoading={exporting} isFullWidth>
            Export {exportForm.format.toUpperCase()}
          </Button>
        </div>
      </Modal>
    </div>
  )
}

export default AttendancePage
