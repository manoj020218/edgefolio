import React, { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { Clock, Upload, RefreshCw, Download, ListOrdered, Loader2 } from 'lucide-react'
import { Button, Card, Badge, Alert, Modal, Select } from '../components/atomic'
import { getAttendance, getAttendanceSummary, logAttendanceEvent, getEmployees, getAttendanceRange, getMachineImportRecords, getHolidays, getWorkingHours } from '../services/api'
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

  // Register view: Daily (single date, existing behaviour) / Monthly (per-employee
  // roll-up for a month) / Range (flat record list across a from/to span).
  const [viewMode, setViewMode] = useState('daily') // 'daily' | 'monthly' | 'range'
  const [monthValue, setMonthValue] = useState(new Date().toISOString().slice(0, 7)) // YYYY-MM
  const [rangeFrom, setRangeFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0])
  const [rangeTo, setRangeTo] = useState(new Date().toISOString().split('T')[0])
  const [rangeRecords, setRangeRecords] = useState([])
  const [rangeLoading, setRangeLoading] = useState(false)
  const [registerEmpFilter, setRegisterEmpFilter] = useState('') // employee id, '' = all — applies across Daily/Monthly/Range
  const [markingLeave, setMarkingLeave] = useState('') // `${memberId}::${date}` currently being marked, for button loading state
  const [punchDetail, setPunchDetail] = useState(null) // { employeeId, employeeName, date } — non-null opens the modal
  const [punchDetailRecords, setPunchDetailRecords] = useState([])
  const [punchDetailLoading, setPunchDetailLoading] = useState(false)
  const [holidaysByDate, setHolidaysByDate] = useState({}) // 'YYYY-MM-DD' -> holiday name
  const [weeklyOffDays, setWeeklyOffDays] = useState([0, 6]) // day-of-week ints, 0=Sunday

  useEffect(() => {
    getHolidays().then((res) => {
      const map = {}
      ;(res.data || []).forEach((h) => { map[h.date] = h.name })
      setHolidaysByDate(map)
    }).catch(() => {})
    getWorkingHours().then((res) => {
      if (res.data?.weeklyOffDays) setWeeklyOffDays(res.data.weeklyOffDays)
    }).catch(() => {})
  }, [])

  const selectedDateHoliday = holidaysByDate[selectedDate] || null
  const selectedDateIsWeeklyOff = weeklyOffDays.includes(new Date(`${selectedDate}T00:00:00`).getDay())

  // Same day-by-day fetch approach already used by Export below — no batch
  // range endpoint exists server-side, so this loops the single-day endpoint.
  const fetchDateSpan = async (fromStr, toStr) => {
    setRangeLoading(true); setError('')
    try {
      const records = []
      const d = new Date(fromStr)
      const end = new Date(toStr)
      while (d <= end) {
        const dateStr = d.toISOString().split('T')[0]
        const res = await getAttendanceRange({ date: dateStr })
        if (res.data?.length) records.push(...res.data)
        d.setDate(d.getDate() + 1)
      }
      setRangeRecords(records)
    } catch (e) { setError(e.message) }
    finally { setRangeLoading(false) }
  }

  useEffect(() => {
    if (viewMode === 'monthly') {
      const [y, m] = monthValue.split('-').map(Number)
      const from = `${monthValue}-01`
      const to = new Date(y, m, 0).toISOString().split('T')[0] // last day of month
      fetchDateSpan(from, to)
    } else if (viewMode === 'range') {
      fetchDateSpan(rangeFrom, rangeTo)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, monthValue, rangeFrom, rangeTo])

  // Monthly view aggregates the fetched span into one row per employee.
  const monthlyRollup = React.useMemo(() => {
    if (viewMode !== 'monthly') return []
    const byEmp = {}
    for (const r of rangeRecords) {
      const key = r.memberId
      if (!byEmp[key]) byEmp[key] = { employeeName: r.employeeName, department: r.department, present: 0, absent: 0, leave: 0, hours: 0 }
      if (r.status === 'present') byEmp[key].present += 1
      else if (r.status === 'absent') byEmp[key].absent += 1
      else if (r.status === 'leave') byEmp[key].leave += 1
      byEmp[key].hours += Number(r.hoursWorked || 0)
    }
    return Object.values(byEmp).sort((a, b) => a.employeeName.localeCompare(b.employeeName))
  }, [viewMode, rangeRecords])

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

  // attendance_records only ever gets a row for someone who punched (or was
  // manually marked) — an employee who simply didn't show up has NO row at
  // all, not an explicit 'absent' one, so the backend's absent count is
  // always 0 for machine-imported data. Derive the missing employees here for
  // display (never written to the DB) so "Absent" actually shows who it means.
  const dailyMerged = React.useMemo(() => {
    const presentIds = new Set(attendanceList.map((a) => a.memberId))
    // On a holiday or weekly off, someone with no punch didn't skip work —
    // don't call it an absence. Shown as its own status instead of red
    // 'Absent'. Holiday takes precedence if somehow both apply to one date.
    const noPunchStatus = selectedDateHoliday ? 'holiday' : selectedDateIsWeeklyOff ? 'weekly-off' : 'absent'
    const derivedAbsent = employees
      .filter((e) => !presentIds.has(e.id))
      .map((e) => ({
        eventId: `absent-${e.id}`, memberId: e.id, employeeName: e.name, department: e.department,
        checkIn: null, checkOut: null, hoursWorked: 0, status: noPunchStatus, faceMatch: 0, leaveType: null,
        isDerived: true,
      }))
    return [...attendanceList, ...derivedAbsent]
  }, [attendanceList, employees, selectedDateHoliday, selectedDateIsWeeklyOff])

  const dailyStats = React.useMemo(() => ({
    present: dailyMerged.filter((r) => r.status === 'present').length,
    absent: dailyMerged.filter((r) => r.status === 'absent').length,
    leave: dailyMerged.filter((r) => r.status === 'leave').length,
    holiday: dailyMerged.filter((r) => r.status === 'holiday').length,
    weeklyOff: dailyMerged.filter((r) => r.status === 'weekly-off').length,
  }), [dailyMerged])

  const empScoped = (list) => registerEmpFilter ? list.filter((r) => r.memberId === registerEmpFilter) : list

  const filteredAttendance = empScoped(filterStatus === 'all'
    ? dailyMerged
    : dailyMerged.filter((a) => a.status === filterStatus))

  const filteredRangeRecords = empScoped(filterStatus === 'all'
    ? rangeRecords
    : rangeRecords.filter((a) => a.status === filterStatus)
  ).slice().sort((a, b) => a.date.localeCompare(b.date) || a.employeeName.localeCompare(b.employeeName))

  // Same derivation as Daily (dailyMerged) but for an arbitrary span — fills
  // in every day an employee has no record with Absent/Holiday/Weekly Off
  // instead of that day just silently not appearing. Used by Monthly and
  // Range once one employee is selected, where a day-by-day list is what's
  // actually shown (an aggregate roll-up has nothing to derive for).
  const deriveDaySpan = (empId, fromDateStr, toDateStr, recordsForEmp) => {
    const byDate = {}
    recordsForEmp.forEach((r) => { byDate[r.date] = r })
    const out = []
    const cursor = new Date(`${fromDateStr}T00:00:00`)
    const end = new Date(`${toDateStr}T00:00:00`)
    while (cursor <= end) {
      const dateStr = cursor.toISOString().split('T')[0]
      const existing = byDate[dateStr]
      if (existing) {
        out.push(existing)
      } else {
        const holidayName = holidaysByDate[dateStr]
        const status = holidayName ? 'holiday' : weeklyOffDays.includes(cursor.getDay()) ? 'weekly-off' : 'absent'
        out.push({
          eventId: `absent-${empId}-${dateStr}`, memberId: empId, date: dateStr,
          checkIn: null, checkOut: null, hoursWorked: 0, status, faceMatch: 0, leaveType: null,
          isDerived: true,
        })
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    return out
  }

  const monthRangeDates = (() => {
    const [y, m] = monthValue.split('-').map(Number)
    return { from: `${monthValue}-01`, to: new Date(y, m, 0).toISOString().split('T')[0] }
  })()

  // When one employee is selected, Monthly/Range switch from the whole-company
  // view (roll-up totals, or a flat multi-employee list) to that employee's
  // own complete day-by-day list — an aggregate table showing only one
  // person's totals isn't useful, and a flat list should show every day, not
  // just the ones with a record.
  const rawMonthlyEmp = registerEmpFilter
    ? deriveDaySpan(registerEmpFilter, monthRangeDates.from, monthRangeDates.to, rangeRecords.filter((r) => r.memberId === registerEmpFilter))
    : []
  const monthlyEmpRecords = filterStatus === 'all' ? rawMonthlyEmp : rawMonthlyEmp.filter((r) => r.status === filterStatus)

  const rawRangeEmp = registerEmpFilter
    ? deriveDaySpan(registerEmpFilter, rangeFrom, rangeTo, rangeRecords.filter((r) => r.memberId === registerEmpFilter))
    : []
  const rangeEmpRecords = filterStatus === 'all' ? rawRangeEmp : rawRangeEmp.filter((r) => r.status === filterStatus)

  const registerEmpName = employees.find((e) => e.id === registerEmpFilter)?.name || ''

  // Marks a day that has no punch as paid or unpaid leave, instead of it
  // just sitting as an unexplained absence. Unpaid leave is what payroll
  // should eventually deduct for — that calculation isn't wired up yet
  // (payrollEngine.js currently doesn't look at attendance at all), this
  // just records the fact so it's ready when that's built.
  const handleMarkLeave = async (memberId, date, leaveType) => {
    const key = `${memberId}::${date}`
    setMarkingLeave(key); setError('')
    try {
      await logAttendanceEvent({ memberId, date, status: 'leave', leaveType })
      fetchAttendance()
      if (viewMode === 'monthly') fetchDateSpan(monthRangeDates.from, monthRangeDates.to)
      else if (viewMode === 'range') fetchDateSpan(rangeFrom, rangeTo)
    } catch (e) { setError(e.message) }
    finally { setMarkingLeave('') }
  }

  const openPunchDetail = async (employeeId, employeeName, date) => {
    setPunchDetail({ employeeId, employeeName, date })
    setPunchDetailLoading(true); setPunchDetailRecords([])
    try {
      const res = await getMachineImportRecords({ employeeId, date })
      setPunchDetailRecords(res.data || [])
    } catch (e) { setError(e.message) }
    finally { setPunchDetailLoading(false) }
  }

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
          <p className="text-3xl font-bold text-green-400">{dailyStats.present}</p>
          <p className="text-xs text-slate-500">of {stats.total} employees</p>
        </div></Card>
        <Card><div className="space-y-2">
          <p className="text-slate-400 text-sm font-medium">Absent</p>
          <p className="text-3xl font-bold text-red-400">{dailyStats.absent}</p>
        </div></Card>
        <Card><div className="space-y-2">
          <p className="text-slate-400 text-sm font-medium">On Leave</p>
          <p className="text-3xl font-bold text-amber-400">{dailyStats.leave}</p>
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
          <p className="text-xs text-slate-400">
            Manually stamps the current time as of right now — for date <span className="text-slate-200 font-medium">{selectedDate}</span> (change it from the Daily tab below).
          </p>
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

          {selectedEmpId && (() => {
            const rec = attendanceList.find((a) => a.memberId === selectedEmpId)
            return (
              <div className="text-sm text-slate-300 bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2">
                <span className="font-medium text-slate-100">{employees.find((e) => e.id === selectedEmpId)?.name}</span>
                {' '}on {selectedDate}: {rec?.checkIn ? (
                  <>
                    checked in at <span className="text-green-400 font-mono">{rec.checkIn}</span>
                    {rec.checkOut ? <> · checked out at <span className="text-blue-400 font-mono">{rec.checkOut}</span></> : <span className="text-amber-400"> · not checked out yet</span>}
                  </>
                ) : (
                  <span className="text-red-400">not checked in yet</span>
                )}
              </div>
            )
          })()}
        </div>
      </Card>

      {/* Attendance Register */}
      <Card>
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-xl font-bold text-slate-100">Attendance Register</h2>
            <div className="flex gap-1 bg-slate-900 rounded-lg p-1">
              {[['daily', 'Daily'], ['monthly', 'Monthly'], ['range', 'Date Range']].map(([id, label]) => (
                <button key={id} onClick={() => setViewMode(id)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    viewMode === id ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {viewMode === 'daily' && (
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Select Date</label>
                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none" />
                {selectedDateHoliday && (
                  <p className="text-xs text-sky-400 mt-1">🎉 Holiday: {selectedDateHoliday} — no-punch employees marked Holiday, not Absent</p>
                )}
                {!selectedDateHoliday && selectedDateIsWeeklyOff && (
                  <p className="text-xs text-slate-400 mt-1">Weekly off — no-punch employees marked Weekly Off, not Absent</p>
                )}
              </div>
            )}
            {viewMode === 'monthly' && (
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Select Month</label>
                <input type="month" value={monthValue} onChange={(e) => setMonthValue(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none" />
              </div>
            )}
            {viewMode === 'range' && (
              <>
                <div>
                  <label className="text-sm text-slate-400 mb-1 block">From</label>
                  <input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none" />
                </div>
                <div>
                  <label className="text-sm text-slate-400 mb-1 block">To</label>
                  <input type="date" value={rangeTo} min={rangeFrom} onChange={(e) => setRangeTo(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none" />
                </div>
              </>
            )}
            {(viewMode !== 'monthly' || registerEmpFilter) && (
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
            )}
          </div>

          <div>
            <label className="text-sm text-slate-400 mb-1 block">Employee (optional)</label>
            <select value={registerEmpFilter} onChange={(e) => setRegisterEmpFilter(e.target.value)}
              className="w-full md:w-72 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none">
              <option value="">— All Employees —</option>
              {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
            </select>
          </div>

          {viewMode === 'daily' && (
            loading ? (
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
                      <th className="text-center py-3 px-4 text-slate-400 font-semibold">Actions</th>
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
                            <Badge variant={
                              rec.status === 'present' ? 'success'
                                : rec.status === 'absent' ? 'danger'
                                : rec.status === 'holiday' ? 'info'
                                : rec.status === 'weekly-off' ? 'default'
                                : 'warning'
                            }>
                              {rec.status === 'weekly-off' ? 'Weekly Off' : (rec.status || '').charAt(0).toUpperCase() + (rec.status || '').slice(1)}
                            </Badge>
                            {rec.status === 'leave' && rec.leaveType && (
                              <span className={`ml-1.5 text-xs ${rec.leaveType === 'paid' ? 'text-green-400' : 'text-red-400'}`}>
                                ({rec.leaveType === 'paid' ? 'Paid' : 'Unpaid'})
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {rec.faceMatch > 0 ? (
                              <span className={rec.faceMatch > 95 ? 'text-green-400' : 'text-amber-400'}>{rec.faceMatch}%</span>
                            ) : <span className="text-slate-500">—</span>}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              {rec.status === 'absent' && (
                                <>
                                  <button onClick={() => handleMarkLeave(rec.memberId, selectedDate, 'paid')}
                                    disabled={markingLeave === `${rec.memberId}::${selectedDate}`}
                                    className="text-xs px-2 py-1 rounded border border-green-700/50 text-green-400 hover:bg-green-900/20 disabled:opacity-50">
                                    {markingLeave === `${rec.memberId}::${selectedDate}` ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Paid Leave'}
                                  </button>
                                  <button onClick={() => handleMarkLeave(rec.memberId, selectedDate, 'unpaid')}
                                    disabled={markingLeave === `${rec.memberId}::${selectedDate}`}
                                    className="text-xs px-2 py-1 rounded border border-red-700/50 text-red-400 hover:bg-red-900/20 disabled:opacity-50">
                                    Unpaid Leave
                                  </button>
                                </>
                              )}
                              {!rec.isDerived && (
                                <button onClick={() => openPunchDetail(rec.memberId, rec.employeeName, selectedDate)}
                                  title="See every raw punch that fed into this row"
                                  className="text-xs px-2 py-1 rounded border border-slate-600 text-slate-400 hover:bg-slate-700 flex items-center gap-1">
                                  <ListOrdered className="w-3 h-3" /> Punches
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="8" className="py-8 text-center text-slate-400">No attendance records for this date</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )
          )}

          {viewMode === 'range' && !registerEmpFilter && (
            rangeLoading ? (
              <div className="py-8 text-center text-slate-400">Loading attendance...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-3 px-4 text-slate-400 font-semibold">Date</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-semibold">Employee</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-semibold">Department</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-semibold">Check-In</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-semibold">Check-Out</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-semibold">Hours</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-semibold">Status</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRangeRecords.length > 0 ? (
                      filteredRangeRecords.map((rec, idx) => (
                        <tr key={rec.eventId} className={idx % 2 === 0 ? 'bg-slate-900/50' : ''}>
                          <td className="py-3 px-4 text-slate-300">{rec.date}</td>
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
                            <Badge variant={
                              rec.status === 'present' ? 'success'
                                : rec.status === 'absent' ? 'danger'
                                : rec.status === 'holiday' ? 'info'
                                : rec.status === 'weekly-off' ? 'default'
                                : 'warning'
                            }>
                              {rec.status === 'weekly-off' ? 'Weekly Off' : (rec.status || '').charAt(0).toUpperCase() + (rec.status || '').slice(1)}
                            </Badge>
                            {rec.status === 'leave' && rec.leaveType && (
                              <span className={`ml-1.5 text-xs ${rec.leaveType === 'paid' ? 'text-green-400' : 'text-red-400'}`}>
                                ({rec.leaveType === 'paid' ? 'Paid' : 'Unpaid'})
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button onClick={() => openPunchDetail(rec.memberId, rec.employeeName, rec.date)}
                              title="See every raw punch that fed into this row"
                              className="text-xs px-2 py-1 rounded border border-slate-600 text-slate-400 hover:bg-slate-700 inline-flex items-center gap-1">
                              <ListOrdered className="w-3 h-3" /> Punches
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="8" className="py-8 text-center text-slate-400">No attendance records in this range</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )
          )}

          {viewMode === 'range' && registerEmpFilter && (
            rangeLoading ? (
              <div className="py-8 text-center text-slate-400">Loading attendance...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-3 px-4 text-slate-400 font-semibold">Date</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-semibold">Check-In</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-semibold">Check-Out</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-semibold">Hours</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-semibold">Status</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rangeEmpRecords.length > 0 ? (
                      rangeEmpRecords.map((rec, idx) => (
                        <tr key={rec.eventId} className={idx % 2 === 0 ? 'bg-slate-900/50' : ''}>
                          <td className="py-3 px-4 text-slate-300">{rec.date}</td>
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
                            <Badge variant={
                              rec.status === 'present' ? 'success'
                                : rec.status === 'absent' ? 'danger'
                                : rec.status === 'holiday' ? 'info'
                                : rec.status === 'weekly-off' ? 'default'
                                : 'warning'
                            }>
                              {rec.status === 'weekly-off' ? 'Weekly Off' : (rec.status || '').charAt(0).toUpperCase() + (rec.status || '').slice(1)}
                            </Badge>
                            {rec.status === 'leave' && rec.leaveType && (
                              <span className={`ml-1.5 text-xs ${rec.leaveType === 'paid' ? 'text-green-400' : 'text-red-400'}`}>
                                ({rec.leaveType === 'paid' ? 'Paid' : 'Unpaid'})
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              {rec.status === 'absent' && (
                                <>
                                  <button onClick={() => handleMarkLeave(rec.memberId, rec.date, 'paid')}
                                    disabled={markingLeave === `${rec.memberId}::${rec.date}`}
                                    className="text-xs px-2 py-1 rounded border border-green-700/50 text-green-400 hover:bg-green-900/20 disabled:opacity-50">
                                    {markingLeave === `${rec.memberId}::${rec.date}` ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Paid Leave'}
                                  </button>
                                  <button onClick={() => handleMarkLeave(rec.memberId, rec.date, 'unpaid')}
                                    disabled={markingLeave === `${rec.memberId}::${rec.date}`}
                                    className="text-xs px-2 py-1 rounded border border-red-700/50 text-red-400 hover:bg-red-900/20 disabled:opacity-50">
                                    Unpaid Leave
                                  </button>
                                </>
                              )}
                              {!rec.isDerived && (
                                <button onClick={() => openPunchDetail(rec.memberId, registerEmpName, rec.date)}
                                  title="See every raw punch that fed into this row"
                                  className="text-xs px-2 py-1 rounded border border-slate-600 text-slate-400 hover:bg-slate-700 inline-flex items-center gap-1">
                                  <ListOrdered className="w-3 h-3" /> Punches
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="6" className="py-8 text-center text-slate-400">No attendance records for this employee in this range</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )
          )}

          {viewMode === 'monthly' && registerEmpFilter && (
            rangeLoading ? (
              <div className="py-8 text-center text-slate-400">Loading attendance...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-3 px-4 text-slate-400 font-semibold">Date</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-semibold">Check-In</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-semibold">Check-Out</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-semibold">Hours</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-semibold">Status</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyEmpRecords.length > 0 ? (
                      monthlyEmpRecords.map((rec, idx) => (
                        <tr key={rec.eventId} className={idx % 2 === 0 ? 'bg-slate-900/50' : ''}>
                          <td className="py-3 px-4 text-slate-300">{rec.date}</td>
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
                            <Badge variant={
                              rec.status === 'present' ? 'success'
                                : rec.status === 'absent' ? 'danger'
                                : rec.status === 'holiday' ? 'info'
                                : rec.status === 'weekly-off' ? 'default'
                                : 'warning'
                            }>
                              {rec.status === 'weekly-off' ? 'Weekly Off' : (rec.status || '').charAt(0).toUpperCase() + (rec.status || '').slice(1)}
                            </Badge>
                            {rec.status === 'leave' && rec.leaveType && (
                              <span className={`ml-1.5 text-xs ${rec.leaveType === 'paid' ? 'text-green-400' : 'text-red-400'}`}>
                                ({rec.leaveType === 'paid' ? 'Paid' : 'Unpaid'})
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              {rec.status === 'absent' && (
                                <>
                                  <button onClick={() => handleMarkLeave(rec.memberId, rec.date, 'paid')}
                                    disabled={markingLeave === `${rec.memberId}::${rec.date}`}
                                    className="text-xs px-2 py-1 rounded border border-green-700/50 text-green-400 hover:bg-green-900/20 disabled:opacity-50">
                                    {markingLeave === `${rec.memberId}::${rec.date}` ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Paid Leave'}
                                  </button>
                                  <button onClick={() => handleMarkLeave(rec.memberId, rec.date, 'unpaid')}
                                    disabled={markingLeave === `${rec.memberId}::${rec.date}`}
                                    className="text-xs px-2 py-1 rounded border border-red-700/50 text-red-400 hover:bg-red-900/20 disabled:opacity-50">
                                    Unpaid Leave
                                  </button>
                                </>
                              )}
                              {!rec.isDerived && (
                                <button onClick={() => openPunchDetail(rec.memberId, registerEmpName, rec.date)}
                                  title="See every raw punch that fed into this row"
                                  className="text-xs px-2 py-1 rounded border border-slate-600 text-slate-400 hover:bg-slate-700 inline-flex items-center gap-1">
                                  <ListOrdered className="w-3 h-3" /> Punches
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="6" className="py-8 text-center text-slate-400">No attendance records for this employee this month</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )
          )}

          {viewMode === 'monthly' && !registerEmpFilter && (
            rangeLoading ? (
              <div className="py-8 text-center text-slate-400">Loading attendance...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-3 px-4 text-slate-400 font-semibold">Employee</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-semibold">Department</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-semibold">Present Days</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-semibold">Absent Days</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-semibold">Leave Days</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-semibold">Total Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyRollup.length > 0 ? (
                      monthlyRollup.map((row, idx) => (
                        <tr key={row.employeeName + idx} className={idx % 2 === 0 ? 'bg-slate-900/50' : ''}>
                          <td className="py-3 px-4 text-slate-100 font-medium">{row.employeeName}</td>
                          <td className="py-3 px-4 text-slate-400">{row.department}</td>
                          <td className="py-3 px-4 text-center text-green-400">{row.present}</td>
                          <td className="py-3 px-4 text-center text-red-400">{row.absent}</td>
                          <td className="py-3 px-4 text-center text-amber-400">{row.leave}</td>
                          <td className="py-3 px-4 text-center text-slate-300">{row.hours.toFixed(1)}h</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="6" className="py-8 text-center text-slate-400">No attendance records for this month</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )
          )}

          {viewMode === 'daily' && (
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
          )}
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

      {/* Detail Punch Record — raw punches behind a first-in/last-out row */}
      <Modal isOpen={!!punchDetail} onClose={() => setPunchDetail(null)} title="Detail Punch Record" size="md">
        {punchDetail && (
          <div className="space-y-3">
            <p className="text-slate-400 text-sm">
              <span className="text-slate-200 font-medium">{punchDetail.employeeName}</span> — {punchDetail.date}
            </p>
            <p className="text-xs text-slate-500">
              First punch below is used as Check-In, last as Check-Out — everything in between is recorded but doesn&rsquo;t change either.
            </p>
            {punchDetailLoading ? (
              <div className="py-8 text-center text-slate-400">Loading punches...</div>
            ) : punchDetailRecords.length === 0 ? (
              <div className="py-8 text-center text-slate-400">No raw punch data for this employee on this date.</div>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-2 px-3 text-slate-400 font-semibold">#</th>
                      <th className="text-left py-2 px-3 text-slate-400 font-semibold">Time</th>
                      <th className="text-left py-2 px-3 text-slate-400 font-semibold">Direction</th>
                      <th className="text-left py-2 px-3 text-slate-400 font-semibold">Batch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {punchDetailRecords.map((p, idx) => (
                      <tr key={p.id} className={idx % 2 === 0 ? 'bg-slate-900/50' : ''}>
                        <td className="py-2 px-3 text-slate-500">{idx + 1}</td>
                        <td className="py-2 px-3 text-slate-100 font-mono">{p.punch_time}</td>
                        <td className="py-2 px-3 text-slate-400 capitalize">{p.direction || '—'}</td>
                        <td className="py-2 px-3 text-slate-500 text-xs font-mono truncate max-w-[140px]">{p.import_batch}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

export default AttendancePage
