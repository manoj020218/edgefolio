import React, { useState, useEffect } from 'react'
import { Clock, Upload, RefreshCw } from 'lucide-react'
import { Button, Card, Badge, Alert } from '../components/atomic'
import { getAttendance, getAttendanceSummary, logAttendanceEvent, getEmployees } from '../services/api'
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Attendance Management</h1>
          <p className="text-slate-400 mt-1">Track employee check-in/out records</p>
        </div>
        <div className="flex gap-2">
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
    </div>
  )
}

export default AttendancePage
