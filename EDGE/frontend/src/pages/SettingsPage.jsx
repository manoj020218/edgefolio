import React, { useState, useEffect } from 'react'
import {
  Settings, RefreshCw, Plus, Trash2, Edit2, Moon,
  FolderOpen, Shield, RotateCcw, HardDrive, Info,
} from 'lucide-react'
import { Button, Card, Input, Alert } from '../components/atomic'
import {
  getCompanySettings, updateCompanySettings,
  getWorkingHours, updateWorkingHours,
  getSyncStatus, pushSync, getBackups, createLocalBackup,
  getDataInfo, setCustomBackupPath, clearCustomBackupPath, restoreFromBackup,
  getShifts, createShift, updateShift, deleteShift,
  getDepartments, createDepartment, updateDepartment, deleteDepartment,
  getHolidays, createHoliday, updateHoliday, deleteHoliday,
  getDeductions, createDeduction, updateDeduction, deleteDeduction,
  getCustomFields, createCustomField, updateCustomField, deleteCustomField,
} from '../services/api'

const hasElectron = () => typeof window !== 'undefined' && !!window.electronAPI

const TABS = [
  { id: 'company',        label: 'Company' },
  { id: 'working-hours',  label: 'Working Hours' },
  { id: 'departments',    label: 'Departments' },
  { id: 'shifts',         label: 'Shifts' },
  { id: 'holidays',       label: 'Holidays' },
  { id: 'deductions',     label: 'Deductions' },
  { id: 'emp-fields',     label: 'Employee Fields' },
  { id: 'data',           label: 'Data & Backup' },
  { id: 'sync',           label: 'Cloud Sync' },
]

// ─── tiny inline-edit row helpers ─────────────────────────────────────────────
function FieldRow({ label, children }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-700/50 last:border-0">
      <span className="text-slate-400 text-sm w-40 flex-shrink-0">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  )
}

// ─── Generic CRUD list panel ──────────────────────────────────────────────────
function CrudTable({ columns, rows, onDelete, onEdit, renderForm, addLabel, idKey }) {
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId]   = useState(null)

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" icon={Plus} variant="primary" onClick={() => { setShowAdd(true); setEditId(null) }}>
          {addLabel}
        </Button>
      </div>

      {showAdd && (
        <div className="bg-slate-900 border border-sky-700 rounded-lg p-4">
          {renderForm({ onDone: () => setShowAdd(false), item: null })}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              {columns.map((c) => (
                <th key={c.key} className="text-left py-2 px-3 text-slate-400 font-semibold">{c.label}</th>
              ))}
              <th className="text-right py-2 px-3 text-slate-400 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="py-6 text-center text-slate-500">No records yet.</td></tr>
            )}
            {rows.map((row) => (
              <React.Fragment key={row[idKey]}>
                <tr className="border-b border-slate-800 hover:bg-slate-800/40">
                  {columns.map((c) => (
                    <td key={c.key} className="py-2 px-3 text-slate-300">{c.render ? c.render(row) : row[c.key]}</td>
                  ))}
                  <td className="py-2 px-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setEditId(editId === row[idKey] ? null : row[idKey])} className="p-1.5 text-sky-400 hover:bg-sky-900/30 rounded">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => onDelete(row[idKey])} className="p-1.5 text-red-400 hover:bg-red-900/30 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
                {editId === row[idKey] && (
                  <tr>
                    <td colSpan={columns.length + 1} className="bg-slate-900 border-b border-sky-700">
                      <div className="p-4">
                        {renderForm({ onDone: () => setEditId(null), item: row })}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Shift form ───────────────────────────────────────────────────────────────
function ShiftForm({ item, onDone, onSaved }) {
  const blank = { shiftName: '', startTime: '09:00', endTime: '18:00', breakDuration: 60, graceMinutes: 10 }
  const [form, setForm] = useState(item ? {
    shiftName: item.shift_name, startTime: item.start_time, endTime: item.end_time,
    breakDuration: item.break_duration, graceMinutes: item.grace_minutes ?? 10,
  } : blank)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const isOvernight = form.endTime && form.startTime && form.endTime < form.startTime

  const handleSave = async () => {
    setSaving(true); setErr('')
    try {
      if (item) await updateShift(item.shift_id, form)
      else await createShift(form)
      onSaved(); onDone()
    } catch (e) { setErr(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-3">
      {err && <p className="text-red-400 text-sm">{err}</p>}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="col-span-2 md:col-span-1">
          <Input label="Shift Name" value={form.shiftName} onChange={(e) => setForm({ ...form, shiftName: e.target.value })} placeholder="e.g. Night Shift" />
        </div>
        <Input label="Start Time" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
        <Input label="End Time"   type="time" value={form.endTime}   onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
        <Input label="Break (min)" type="number" value={form.breakDuration} onChange={(e) => setForm({ ...form, breakDuration: Number(e.target.value) })} />
        <Input label="Grace (min)" type="number" value={form.graceMinutes}  onChange={(e) => setForm({ ...form, graceMinutes:  Number(e.target.value) })} />
      </div>
      {isOvernight && (
        <div className="flex items-center gap-2 text-amber-400 text-xs bg-amber-900/20 border border-amber-700/40 rounded px-3 py-2">
          <Moon className="w-3.5 h-3.5 flex-shrink-0" />
          Overnight shift detected — end time is next calendar day
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="secondary" onClick={onDone}>Cancel</Button>
        <Button size="sm" variant="primary" isLoading={saving} onClick={handleSave}>
          {item ? 'Update' : 'Add Shift'}
        </Button>
      </div>
    </div>
  )
}

// ─── Department form ──────────────────────────────────────────────────────────
function DeptForm({ item, onDone, onSaved }) {
  const [form, setForm] = useState({ name: item?.name ?? '', description: item?.description ?? '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const handleSave = async () => {
    setSaving(true); setErr('')
    try {
      if (item) await updateDepartment(item.dept_id, form)
      else await createDepartment(form)
      onSaved(); onDone()
    } catch (e) { setErr(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-3">
      {err && <p className="text-red-400 text-sm">{err}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input label="Department Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Quality Control" />
        <Input label="Description"     value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional" />
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="secondary" onClick={onDone}>Cancel</Button>
        <Button size="sm" variant="primary" isLoading={saving} onClick={handleSave}>
          {item ? 'Update' : 'Add Department'}
        </Button>
      </div>
    </div>
  )
}

// ─── Holiday form ─────────────────────────────────────────────────────────────
function HolidayForm({ item, onDone, onSaved }) {
  const [form, setForm] = useState({
    date: item?.date ?? '', name: item?.name ?? '', type: item?.type ?? 'national',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const handleSave = async () => {
    setSaving(true); setErr('')
    try {
      if (item) await updateHoliday(item.holiday_id, form)
      else await createHoliday(form)
      onSaved(); onDone()
    } catch (e) { setErr(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-3">
      {err && <p className="text-red-400 text-sm">{err}</p>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Input label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <Input label="Holiday Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Diwali" />
        <div>
          <label className="block text-xs text-slate-400 mb-1">Type</label>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none text-sm">
            <option value="national">National</option>
            <option value="regional">Regional</option>
            <option value="company">Company</option>
            <option value="custom">Custom</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="secondary" onClick={onDone}>Cancel</Button>
        <Button size="sm" variant="primary" isLoading={saving} onClick={handleSave}>
          {item ? 'Update' : 'Add Holiday'}
        </Button>
      </div>
    </div>
  )
}

// ─── Deduction form ───────────────────────────────────────────────────────────
function DeductionForm({ item, onDone, onSaved }) {
  const [form, setForm] = useState({
    name: item?.name ?? '', percentage: item?.percentage ?? 0, type: item?.type ?? 'fixed',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const handleSave = async () => {
    setSaving(true); setErr('')
    try {
      if (item) await updateDeduction(item.deduction_id, form)
      else await createDeduction(form)
      onSaved(); onDone()
    } catch (e) { setErr(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-3">
      {err && <p className="text-red-400 text-sm">{err}</p>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Input label="Deduction Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Provident Fund" />
        <Input label="Percentage (%)" type="number" step="0.01" value={form.percentage} onChange={(e) => setForm({ ...form, percentage: Number(e.target.value) })} />
        <div>
          <label className="block text-xs text-slate-400 mb-1">Type</label>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none text-sm">
            <option value="fixed">Fixed %</option>
            <option value="variable">Variable</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="secondary" onClick={onDone}>Cancel</Button>
        <Button size="sm" variant="primary" isLoading={saving} onClick={handleSave}>
          {item ? 'Update' : 'Add Deduction'}
        </Button>
      </div>
    </div>
  )
}

// ─── Main SettingsPage ────────────────────────────────────────────────────────
export const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState('company')
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')

  const [company, setCompany] = useState({
    companyName: '', email: '', phone: '', gstNumber: '',
    address: '', city: '', state: '', country: '', pincode: '', website: '',
  })
  const [hours, setHours] = useState({
    startTime: '09:00', endTime: '18:00', breakDuration: 60, daysPerWeek: 5, hoursPerDay: 8,
  })
  const [syncStatus, setSyncStatus]  = useState(null)
  const [backups, setBackups]        = useState([])
  const [dataInfo, setDataInfo]      = useState(null)
  const [syncing, setSyncing]        = useState(false)
  const [backingUp, setBackingUp]    = useState(false)
  const [restoring, setRestoring]    = useState(false)
  const [settingPath, setSettingPath] = useState(false)

  const [shifts, setShifts]         = useState([])
  const [departments, setDepartments] = useState([])
  const [holidays, setHolidays]     = useState([])
  const [deductions, setDeductions] = useState([])

  const showSuccess = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000) }

  const fetchAll = () => {
    setLoading(true)
    Promise.all([
      getCompanySettings(), getWorkingHours(), getSyncStatus(), getBackups(),
      getShifts(), getDepartments(), getHolidays(), getDeductions(), getDataInfo(),
    ]).then(([cs, wh, ss, bk, sh, dp, hol, ded, di]) => {
      if (cs.data)  setCompany(cs.data)
      if (wh.data)  setHours(wh.data)
      setSyncStatus(ss.data)
      setBackups(bk.data || [])
      setShifts(sh.data || [])
      setDepartments(dp.data || [])
      setHolidays(hol.data || [])
      setDeductions(ded.data || [])
      if (di.data)  setDataInfo(di.data)
    }).catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchAll() }, [])

  const handleSaveCompany = async () => {
    setSaving(true); setError('')
    try { await updateCompanySettings(company); showSuccess('Company settings saved!') }
    catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleSaveHours = async () => {
    setSaving(true); setError('')
    try { await updateWorkingHours(hours); showSuccess('Working hours saved!') }
    catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await pushSync()
      setSyncStatus(res.data?.status || res.data)
      showSuccess('Sync completed!')
    } catch (e) { setError(e.message) }
    finally { setSyncing(false) }
  }

  const handleBackup = async () => {
    setBackingUp(true)
    try {
      const res = await createLocalBackup()
      const dest = res.data?.externalPath || res.data?.path || 'backup folder'
      showSuccess(`Backup created! Saved to: ${dest}`)
      Promise.all([
        getBackups().then((r) => setBackups(r.data || [])),
        getDataInfo().then((r) => { if (r.data) setDataInfo(r.data) }),
      ]).catch(() => {})
    } catch (e) { setError(e.message) }
    finally { setBackingUp(false) }
  }

  const handleChooseBackupFolder = async () => {
    if (!hasElectron()) { setError('Folder selection requires the desktop app.'); return }
    const result = await window.electronAPI.chooseFolderDialog()
    if (result.canceled || !result.filePaths?.[0]) return
    setSettingPath(true)
    try {
      await setCustomBackupPath({ path: result.filePaths[0] })
      const di = await getDataInfo()
      if (di.data) setDataInfo(di.data)
      showSuccess(`Backup folder set: ${result.filePaths[0]}`)
    } catch (e) { setError(e.message) }
    finally { setSettingPath(false) }
  }

  const handleClearBackupFolder = async () => {
    try {
      await clearCustomBackupPath()
      const di = await getDataInfo()
      if (di.data) setDataInfo(di.data)
      showSuccess('Custom backup folder cleared.')
    } catch (e) { setError(e.message) }
  }

  const handleRestore = async () => {
    if (!hasElectron()) { setError('File selection requires the desktop app.'); return }
    const result = await window.electronAPI.openFileDialog({
      title: 'Select EDGEFOLIO Backup File',
      filters: [{ name: 'EDGEFOLIO Backup', extensions: ['pbbackup'] }],
    })
    if (result.canceled || !result.filePaths?.[0]) return
    if (!window.confirm(
      `Restore from backup?\n\nThis will REPLACE all current data with the backup from:\n${result.filePaths[0]}\n\nA safety backup of current data will be created first.\n\nContinue?`
    )) return

    setRestoring(true)
    try {
      // Create safety backup of current data before restore
      await createLocalBackup()
      const res = await restoreFromBackup({ filePath: result.filePaths[0] })
      showSuccess(`Restore complete! ${res.data?.employees || 0} employees, ${res.data?.attendance || 0} attendance records restored from ${res.data?.backupDate?.slice(0, 10)}.`)
      fetchAll()
    } catch (e) { setError(e.message) }
    finally { setRestoring(false) }
  }

  const handleDeleteShift = async (id) => {
    if (!window.confirm('Delete this shift?')) return
    try { await deleteShift(id); setShifts((p) => p.filter((s) => s.shift_id !== id)) }
    catch (e) { setError(e.message) }
  }

  const handleDeleteDept = async (id) => {
    if (!window.confirm('Delete this department?')) return
    try { await deleteDepartment(id); setDepartments((p) => p.filter((d) => d.dept_id !== id)) }
    catch (e) { setError(e.message) }
  }

  const handleDeleteHoliday = async (id) => {
    if (!window.confirm('Delete this holiday?')) return
    try { await deleteHoliday(id); setHolidays((p) => p.filter((h) => h.holiday_id !== id)) }
    catch (e) { setError(e.message) }
  }

  const handleDeleteDeduction = async (id) => {
    if (!window.confirm('Delete this deduction?')) return
    try { await deleteDeduction(id); setDeductions((p) => p.filter((d) => d.deduction_id !== id)) }
    catch (e) { setError(e.message) }
  }

  const reloadShifts     = () => getShifts().then((r) => setShifts(r.data || [])).catch(() => {})
  const reloadDepts      = () => getDepartments().then((r) => setDepartments(r.data || [])).catch(() => {})
  const reloadHolidays   = () => getHolidays().then((r) => setHolidays(r.data || [])).catch(() => {})
  const reloadDeductions = () => getDeductions().then((r) => setDeductions(r.data || [])).catch(() => {})

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-2">
            <Settings className="w-8 h-8" /> Settings
          </h1>
          <p className="text-slate-400 mt-1">Configure company settings and preferences</p>
        </div>
        <Button icon={RefreshCw} variant="secondary" onClick={fetchAll}>Refresh</Button>
      </div>

      {error   && <Alert variant="danger"  message={error}   onClose={() => setError('')}   />}
      {success && <Alert variant="success" message={success} onClose={() => setSuccess('')} />}

      {/* Tab bar */}
      <Card>
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                activeTab === tab.id ? 'bg-sky-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </Card>

      {/* ── Company ── */}
      {activeTab === 'company' && (
        <Card>
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-100">Company Information</h2>
            {loading ? <div className="py-4 text-center text-slate-400">Loading...</div> : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input label="Company Name" value={company.companyName || ''} onChange={(e) => setCompany({ ...company, companyName: e.target.value })} />
                  <Input label="Email" type="email" value={company.email || ''} onChange={(e) => setCompany({ ...company, email: e.target.value })} />
                  <Input label="Phone" value={company.phone || ''} onChange={(e) => setCompany({ ...company, phone: e.target.value })} />
                  <Input label="GST Number" value={company.gstNumber || ''} onChange={(e) => setCompany({ ...company, gstNumber: e.target.value })} />
                </div>
                <Input label="Address" value={company.address || ''} onChange={(e) => setCompany({ ...company, address: e.target.value })} />
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Input label="City"    value={company.city    || ''} onChange={(e) => setCompany({ ...company, city:    e.target.value })} />
                  <Input label="State"   value={company.state   || ''} onChange={(e) => setCompany({ ...company, state:   e.target.value })} />
                  <Input label="Country" value={company.country || ''} onChange={(e) => setCompany({ ...company, country: e.target.value })} />
                  <Input label="Pincode" value={company.pincode || ''} onChange={(e) => setCompany({ ...company, pincode: e.target.value })} />
                </div>
                <div className="flex gap-2 pt-4">
                  <Button variant="secondary" onClick={fetchAll}>Discard</Button>
                  <Button variant="primary" onClick={handleSaveCompany} isLoading={saving}>Save Changes</Button>
                </div>
              </>
            )}
          </div>
        </Card>
      )}

      {/* ── Working Hours ── */}
      {activeTab === 'working-hours' && (
        <Card>
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-100">Default Working Hours</h2>
            <p className="text-slate-400 text-sm">These are the company-wide defaults. Individual shifts can override them.</p>
            {loading ? <div className="py-4 text-center text-slate-400">Loading...</div> : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Input label="Start Time" type="time" value={hours.startTime || ''} onChange={(e) => setHours({ ...hours, startTime: e.target.value })} />
                  <Input label="End Time"   type="time" value={hours.endTime   || ''} onChange={(e) => setHours({ ...hours, endTime:   e.target.value })} />
                  <Input label="Break (min)" type="number" value={hours.breakDuration ?? 60} onChange={(e) => setHours({ ...hours, breakDuration: Number(e.target.value) })} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input label="Working Days / Week" type="number" value={hours.daysPerWeek ?? 5}  onChange={(e) => setHours({ ...hours, daysPerWeek: Number(e.target.value) })} />
                  <Input label="Hours / Day"         type="number" value={hours.hoursPerDay ?? 8}  onChange={(e) => setHours({ ...hours, hoursPerDay: Number(e.target.value) })} />
                </div>
                <div className="flex gap-2 pt-4">
                  <Button variant="secondary" onClick={fetchAll}>Discard</Button>
                  <Button variant="primary" onClick={handleSaveHours} isLoading={saving}>Save Changes</Button>
                </div>
              </>
            )}
          </div>
        </Card>
      )}

      {/* ── Departments ── */}
      {activeTab === 'departments' && (
        <Card>
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-slate-100">Departments</h2>
              <p className="text-slate-400 text-sm mt-1">Create custom departments for your company structure.</p>
            </div>
            {loading ? <div className="py-4 text-center text-slate-400">Loading...</div> : (
              <CrudTable
                idKey="dept_id"
                addLabel="Add Department"
                columns={[
                  { key: 'name',        label: 'Name' },
                  { key: 'description', label: 'Description' },
                ]}
                rows={departments}
                onDelete={handleDeleteDept}
                renderForm={({ item, onDone }) => (
                  <DeptForm item={item} onDone={onDone} onSaved={reloadDepts} />
                )}
              />
            )}
          </div>
        </Card>
      )}

      {/* ── Shifts ── */}
      {activeTab === 'shifts' && (
        <Card>
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-slate-100">Shift Management</h2>
              <p className="text-slate-400 text-sm mt-1">
                Define work shifts. Overnight shifts (e.g. 20:00 – 03:00) are auto-detected when end time is before start time.
              </p>
            </div>
            {loading ? <div className="py-4 text-center text-slate-400">Loading...</div> : (
              <CrudTable
                idKey="shift_id"
                addLabel="Add Shift"
                columns={[
                  { key: 'shift_name',  label: 'Name' },
                  { key: 'start_time',  label: 'Start' },
                  { key: 'end_time',    label: 'End' },
                  { key: 'is_overnight', label: 'Type', render: (r) => (
                    r.is_overnight
                      ? <span className="flex items-center gap-1 text-amber-400"><Moon className="w-3 h-3" /> Overnight</span>
                      : <span className="text-slate-400">Day</span>
                  )},
                  { key: 'break_duration', label: 'Break', render: (r) => `${r.break_duration}m` },
                  { key: 'grace_minutes',  label: 'Grace', render: (r) => `${r.grace_minutes ?? 10}m` },
                ]}
                rows={shifts}
                onDelete={handleDeleteShift}
                renderForm={({ item, onDone }) => (
                  <ShiftForm item={item} onDone={onDone} onSaved={reloadShifts} />
                )}
              />
            )}
          </div>
        </Card>
      )}

      {/* ── Holidays ── */}
      {activeTab === 'holidays' && (
        <Card>
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-slate-100">Holidays</h2>
              <p className="text-slate-400 text-sm mt-1">National, regional, and company holidays used in payroll calculations.</p>
            </div>
            {loading ? <div className="py-4 text-center text-slate-400">Loading...</div> : (
              <CrudTable
                idKey="holiday_id"
                addLabel="Add Holiday"
                columns={[
                  { key: 'date', label: 'Date' },
                  { key: 'name', label: 'Name' },
                  { key: 'type', label: 'Type', render: (r) => (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      r.type === 'national' ? 'bg-blue-900/40 text-blue-300' :
                      r.type === 'regional' ? 'bg-purple-900/40 text-purple-300' :
                      r.type === 'company'  ? 'bg-green-900/40 text-green-300' :
                      'bg-slate-700 text-slate-300'
                    }`}>{r.type}</span>
                  )},
                ]}
                rows={holidays}
                onDelete={handleDeleteHoliday}
                renderForm={({ item, onDone }) => (
                  <HolidayForm item={item} onDone={onDone} onSaved={reloadHolidays} />
                )}
              />
            )}
          </div>
        </Card>
      )}

      {/* ── Deductions ── */}
      {activeTab === 'deductions' && (
        <Card>
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-slate-100">Payroll Deductions</h2>
              <p className="text-slate-400 text-sm mt-1">PF, ESI, income tax and other deductions applied during payroll processing.</p>
            </div>
            {loading ? <div className="py-4 text-center text-slate-400">Loading...</div> : (
              <CrudTable
                idKey="deduction_id"
                addLabel="Add Deduction"
                columns={[
                  { key: 'name',       label: 'Name' },
                  { key: 'percentage', label: 'Rate', render: (r) => `${r.percentage}%` },
                  { key: 'type',       label: 'Type', render: (r) => (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      r.type === 'fixed' ? 'bg-green-900/40 text-green-300' : 'bg-amber-900/40 text-amber-300'
                    }`}>{r.type}</span>
                  )},
                ]}
                rows={deductions}
                onDelete={handleDeleteDeduction}
                renderForm={({ item, onDone }) => (
                  <DeductionForm item={item} onDone={onDone} onSaved={reloadDeductions} />
                )}
              />
            )}
          </div>
        </Card>
      )}

      {/* ── Employee Fields ── */}
      {activeTab === 'emp-fields' && (
        <EmpFieldsTab />
      )}

      {/* ── Data & Backup ── */}
      {activeTab === 'data' && (
        <div className="space-y-6">

          {/* Version & App Info */}
          <Card>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Info className="w-5 h-5 text-sky-400" />
                <h2 className="text-xl font-bold text-slate-100">App Version & Data Location</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 space-y-1">
                  <p className="text-slate-400 text-xs">Current Version</p>
                  <p className="text-sky-400 font-bold text-xl">v{dataInfo?.appVersion || '1.0.0'}</p>
                </div>
                <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 space-y-1 md:col-span-2">
                  <p className="text-slate-400 text-xs flex items-center gap-1">
                    <HardDrive className="w-3 h-3" /> Data Location (safe from reinstall)
                  </p>
                  <p className="text-slate-300 text-xs font-mono break-all">{dataInfo?.dataPath || 'Loading…'}</p>
                  <p className="text-slate-500 text-xs mt-1">Your data stays here even if the app is uninstalled or reinstalled.</p>
                </div>
              </div>
            </div>
          </Card>

          {/* External Backup Path */}
          <Card>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-green-400" />
                <h2 className="text-xl font-bold text-slate-100">External Backup Location</h2>
              </div>
              <p className="text-slate-400 text-sm">
                Set a folder on a different drive (e.g. <code className="text-sky-400 bg-slate-900 px-1 rounded">D:\CompanyBackups\</code> or a USB drive)
                where every backup is automatically saved as a second copy. If your PC is damaged or the app is reinstalled, restore from there.
              </p>

              <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-slate-400 text-xs mb-1">Current external backup folder</p>
                  {dataInfo?.customBackupPath ? (
                    <p className="text-green-400 font-mono text-sm break-all">{dataInfo.customBackupPath}</p>
                  ) : (
                    <p className="text-slate-500 text-sm italic">Not set — backups stay in AppData only</p>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button size="sm" variant="primary" icon={FolderOpen}
                    isLoading={settingPath} onClick={handleChooseBackupFolder}>
                    Choose Folder
                  </Button>
                  {dataInfo?.customBackupPath && (
                    <Button size="sm" variant="secondary" onClick={handleClearBackupFolder}>
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              {!hasElectron() && (
                <p className="text-amber-400 text-xs bg-amber-900/20 border border-amber-700/40 rounded px-3 py-2">
                  Folder picker requires the EDGEFOLIO desktop app (.exe). Not available in browser mode.
                </p>
              )}
            </div>
          </Card>

          {/* Backup & Restore */}
          <Card>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-100">Backup & Restore</h2>
                <div className="flex gap-2">
                  <Button size="sm" icon={RotateCcw} variant="secondary"
                    isLoading={restoring} onClick={handleRestore}>
                    Restore from Backup
                  </Button>
                  <Button size="sm" icon={Shield} variant="primary"
                    isLoading={backingUp} onClick={handleBackup}>
                    Create Backup Now
                  </Button>
                </div>
              </div>

              <div className="p-3 bg-blue-900/20 border border-blue-700/40 rounded-lg text-xs text-blue-300 space-y-1">
                <p className="font-semibold text-blue-200">Auto-backup before updates</p>
                <p>EDGEFOLIO automatically creates a backup before installing any new version, so your data is always safe during upgrades.</p>
              </div>

              {backups.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-slate-400 text-xs">Recent backups (stored in AppData)</p>
                  {backups.slice(0, 8).map((b) => (
                    <div key={b.backupId} className="flex justify-between items-center p-3 bg-slate-900 rounded-lg border border-slate-700">
                      <div>
                        <p className="text-slate-100 font-medium text-sm">{b.fileName}</p>
                        <p className="text-xs text-slate-400">{b.createdAt} — {b.size}</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded ${b.status === 'completed' ? 'bg-green-900/30 text-green-400' : 'bg-amber-900/30 text-amber-400'}`}>
                        {b.status}
                      </span>
                    </div>
                  ))}
                  {backups.length > 8 && (
                    <p className="text-slate-500 text-xs text-center">… and {backups.length - 8} more</p>
                  )}
                </div>
              ) : (
                <p className="text-slate-400 text-sm">No backups yet. Click "Create Backup Now" to start.</p>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ── Cloud Sync ── */}
      {activeTab === 'sync' && (
        <div className="space-y-6">
          <Card>
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-slate-100">Cloud Sync</h2>
              {syncStatus && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  {[
                    { label: 'Status',         value: syncStatus.syncStatus || 'idle',             cls: 'text-slate-100 capitalize' },
                    { label: 'Last Sync',       value: syncStatus.lastSync ? new Date(syncStatus.lastSync).toLocaleString() : 'Never', cls: 'text-slate-100 text-xs' },
                    { label: 'Records Synced',  value: syncStatus.recordsSynced  || 0,              cls: 'text-sky-400 font-bold' },
                    { label: 'Pending',         value: syncStatus.pendingChanges || 0,              cls: 'text-amber-400 font-bold' },
                  ].map((s) => (
                    <div key={s.label} className="bg-slate-900 p-3 rounded-lg border border-slate-700">
                      <p className="text-slate-400 text-xs mb-1">{s.label}</p>
                      <p className={s.cls}>{s.value}</p>
                    </div>
                  ))}
                </div>
              )}
              <Button variant="primary" onClick={handleSync} isLoading={syncing}>
                {syncing ? 'Syncing...' : 'Sync to Cloud Now'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

// ─── Employee Custom Fields Tab ───────────────────────────────────────────────
const FIELD_TYPES = [
  { value: 'text',     label: 'Text' },
  { value: 'number',   label: 'Number' },
  { value: 'textarea', label: 'Multiline Text' },
  { value: 'date',     label: 'Date' },
]

function EmpFieldsTab() {
  const [fields, setFields] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr]     = useState('')
  const [adding, setAdding]   = useState(false)
  const [editId, setEditId]   = useState(null)
  const [form, setForm]   = useState({ fieldName: '', fieldType: 'text', isRequired: false })
  const [saving, setSaving]   = useState(false)

  const reload = () => {
    setLoading(true)
    getCustomFields().then((r) => { setFields(r.data || []); setLoading(false) }).catch((e) => { setErr(e.message); setLoading(false) })
  }
  useEffect(() => { reload() }, [])

  const resetForm = () => { setForm({ fieldName: '', fieldType: 'text', isRequired: false }); setAdding(false); setEditId(null) }

  const handleSave = async () => {
    if (!form.fieldName.trim()) { setErr('Field name required'); return }
    setSaving(true); setErr('')
    try {
      if (editId) await updateCustomField(editId, form)
      else await createCustomField(form)
      resetForm(); reload()
    } catch (e) { setErr(e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (fieldId) => {
    if (!window.confirm('Delete this custom field? All stored values will be lost.')) return
    try { await deleteCustomField(fieldId); reload() }
    catch (e) { setErr(e.message) }
  }

  const startEdit = (field) => {
    setEditId(field.field_id)
    setForm({ fieldName: field.field_name, fieldType: field.field_type, isRequired: !!field.is_required })
    setAdding(true)
  }

  return (
    <Card>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-slate-100">Employee Custom Fields</h2>
            <p className="text-slate-400 text-sm">HR-defined fields shown in each employee's detail drawer.</p>
          </div>
          <Button size="sm" icon={Plus} variant="primary" onClick={() => { resetForm(); setAdding(true) }}>Add Field</Button>
        </div>

        {err && <Alert variant="danger" message={err} onClose={() => setErr('')} />}

        {adding && (
          <div className="bg-slate-900 border border-sky-700 rounded-lg p-4 space-y-3">
            <p className="text-sm font-semibold text-sky-300">{editId ? 'Edit Field' : 'New Custom Field'}</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Field Name *" placeholder="e.g. Permanent Address, Aadhar No." value={form.fieldName}
                onChange={(e) => setForm((p) => ({ ...p, fieldName: e.target.value }))} />
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Field Type</label>
                <select value={form.fieldType} onChange={(e) => setForm((p) => ({ ...p, fieldType: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:border-sky-500 focus:outline-none">
                  {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input type="checkbox" checked={form.isRequired} onChange={(e) => setForm((p) => ({ ...p, isRequired: e.target.checked }))} />
              Required field
            </label>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={resetForm}>Cancel</Button>
              <Button size="sm" variant="primary" onClick={handleSave} isLoading={saving}>
                {editId ? 'Update' : 'Add'} Field
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-6 text-center text-slate-400">Loading fields...</div>
        ) : fields.length === 0 ? (
          <div className="py-6 text-center text-slate-400 text-sm">No custom fields yet. Add one to get started.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4 text-slate-400">#</th>
                  <th className="text-left py-3 px-4 text-slate-400">Field Name</th>
                  <th className="text-left py-3 px-4 text-slate-400">Type</th>
                  <th className="text-left py-3 px-4 text-slate-400">Required</th>
                  <th className="text-center py-3 px-4 text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field, i) => (
                  <tr key={field.field_id} className={i % 2 === 0 ? 'bg-slate-900/50' : ''}>
                    <td className="py-3 px-4 text-slate-500 font-mono text-xs">{field.display_order}</td>
                    <td className="py-3 px-4 text-slate-100 font-medium">{field.field_name}</td>
                    <td className="py-3 px-4 text-slate-400 capitalize">{field.field_type}</td>
                    <td className="py-3 px-4 text-slate-400">{field.is_required ? '✓' : '—'}</td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex justify-center gap-2">
                        <button onClick={() => startEdit(field)} className="p-1 hover:bg-slate-700 rounded text-blue-400"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(field.field_id)} className="p-1 hover:bg-slate-700 rounded text-red-400"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  )
}

export default SettingsPage
