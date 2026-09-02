import React, { useState, useEffect } from 'react'
import {
  Settings, RefreshCw, Plus, Trash2, Edit2, Moon,
  FolderOpen, Shield, RotateCcw, HardDrive, Info, Landmark, X,
  Cpu, Wifi, Server,
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
  getEarnings, createEarning, updateEarning, deleteEarning,
  getCustomFields, createCustomField, updateCustomField, deleteCustomField,
  getBankTemplates, createBankTemplate, updateBankTemplate, deleteBankTemplate,
  getU5Devices, createU5Device, updateU5Device, deleteU5Device,
  getU5Status, getU5Preferences, updateU5Preferences,
  getM68Devices, createM68Device, updateM68Device, deleteM68Device,
  getM68DeviceUsers, getM68Status, sendM68Command, getM68Events,
  getLicenseStatus, refreshLicense,
} from '../services/api'

const hasElectron = () => typeof window !== 'undefined' && !!window.electronAPI

const TABS = [
  { id: 'company',        label: 'Company' },
  { id: 'working-hours',  label: 'Working Hours' },
  { id: 'departments',    label: 'Departments' },
  { id: 'shifts',         label: 'Shifts' },
  { id: 'holidays',       label: 'Holidays' },
  { id: 'earnings',       label: 'Earnings' },
  { id: 'deductions',     label: 'Deductions' },
  { id: 'bank-templates', label: 'Bank Templates' },
  { id: 'u5-machines',   label: 'U5 Machines' },
  { id: 'm68-machines',  label: 'M68 (WitEasy)' },
  { id: 'emp-fields',    label: 'Employee Fields' },
  { id: 'data',           label: 'Data & Backup' },
  { id: 'sync',           label: 'Cloud Sync' },
  { id: 'license',        label: 'License' },
]

// ── Payment fields for bank template mapping ───────────────────────────────────
const PAYMENT_FIELDS = [
  { key: 'account_name',   label: 'Beneficiary Name',    defaultHeader: 'Beneficiary Name' },
  { key: 'account_number', label: 'Account Number',      defaultHeader: 'Account Number' },
  { key: 'ifsc',           label: 'IFSC Code',           defaultHeader: 'IFSC Code' },
  { key: 'amount',         label: 'Amount',              defaultHeader: 'Amount' },
  { key: 'mode',           label: 'Payment Mode',        defaultHeader: 'Payment Type' },
  { key: 'emp_code',       label: 'Employee Code',       defaultHeader: 'Employee Code' },
  { key: 'mobile',         label: 'Mobile Number',       defaultHeader: 'Mobile' },
  { key: 'email',          label: 'Email',               defaultHeader: 'Email' },
  { key: 'purpose_code',   label: 'Purpose Code',        defaultHeader: 'Purpose Code' },
  { key: 'remarks',        label: 'Remarks / Narration', defaultHeader: 'Narration' },
  { key: 'currency',       label: 'Currency',            defaultHeader: 'Currency' },
]

function buildDefaultMappingState(fieldMappings) {
  const state = {}
  PAYMENT_FIELDS.forEach(({ key, defaultHeader }) => {
    if (fieldMappings && fieldMappings[key] !== undefined) {
      state[key] = { included: true, header: fieldMappings[key] }
    } else {
      state[key] = { included: key === 'account_name' || key === 'account_number' || key === 'ifsc' || key === 'amount' || key === 'mode', header: defaultHeader }
    }
  })
  return state
}

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

// ─── Earning form ─────────────────────────────────────────────────────────────
function EarningForm({ item, onDone, onSaved }) {
  const [form, setForm] = useState({
    name: item?.name ?? '', percentage: item?.percentage ?? 0, type: item?.type ?? 'fixed',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const handleSave = async () => {
    setSaving(true); setErr('')
    try {
      if (item) await updateEarning(item.earning_id, form)
      else await createEarning(form)
      onSaved(); onDone()
    } catch (e) { setErr(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-3">
      {err && <p className="text-red-400 text-sm">{err}</p>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Input label="Component Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. DA, HRA, Conveyance" />
        <Input label="% of Basic" type="number" step="0.01" value={form.percentage} onChange={(e) => setForm({ ...form, percentage: Number(e.target.value) })} />
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
          {item ? 'Update' : 'Add Earning'}
        </Button>
      </div>
    </div>
  )
}

// ─── Bank Template form ───────────────────────────────────────────────────────
function BankTemplateForm({ item, onDone, onSaved }) {
  const [form, setForm] = useState({
    templateName: item?.templateName ?? '',
    bankName: item?.bankName ?? '',
    exportFormat: item?.exportFormat ?? 'csv',
    payerName: item?.payerName ?? '',
    payerAccount: item?.payerAccount ?? '',
    payerIfsc: item?.payerIfsc ?? '',
  })
  const [mappingState, setMappingState] = useState(() => buildDefaultMappingState(item?.fieldMappings))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const setM = (key, field, value) => setMappingState((p) => ({ ...p, [key]: { ...p[key], [field]: value } }))

  const handleSave = async () => {
    if (!form.templateName.trim() || !form.bankName.trim()) { setErr('Template name and bank name required'); return }
    setSaving(true); setErr('')
    try {
      const fieldMappings = Object.fromEntries(
        Object.entries(mappingState).filter(([, v]) => v.included).map(([k, v]) => [k, v.header || k])
      )
      const payload = { ...form, fieldMappings }
      if (item) await updateBankTemplate(item.templateId, payload)
      else await createBankTemplate(payload)
      onSaved(); onDone()
    } catch (e) { setErr(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      {err && <p className="text-red-400 text-sm">{err}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input label="Template Name" value={form.templateName} onChange={(e) => setForm({ ...form, templateName: e.target.value })} placeholder="e.g. HDFC Salary Upload" />
        <Input label="Bank Name" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="e.g. HDFC Bank" />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Export Format</label>
        <select value={form.exportFormat} onChange={(e) => setForm({ ...form, exportFormat: e.target.value })}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none text-sm">
          <option value="csv">CSV</option>
          <option value="json">JSON</option>
          <option value="xml">XML</option>
          <option value="txt">TXT (Pipe-separated)</option>
        </select>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Input label="Payer / Company Name" value={form.payerName} onChange={(e) => setForm({ ...form, payerName: e.target.value })} placeholder="Company name for debit account" />
        <Input label="Payer Account No" value={form.payerAccount} onChange={(e) => setForm({ ...form, payerAccount: e.target.value })} placeholder="Company bank account" />
        <Input label="Payer IFSC" value={form.payerIfsc} onChange={(e) => setForm({ ...form, payerIfsc: e.target.value })} placeholder="Company IFSC code" />
      </div>

      <div>
        <p className="text-sm font-medium text-slate-300 mb-2">Field Mapping</p>
        <p className="text-xs text-slate-500 mb-3">Check the fields to include in the export file and enter the column header name your bank expects.</p>
        <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
          <div className="grid grid-cols-[auto_1fr_1fr] text-xs text-slate-400 border-b border-slate-700 px-3 py-2">
            <span className="w-8">Inc.</span>
            <span>EDGEFOLIO Field</span>
            <span>Bank Column Header</span>
          </div>
          {PAYMENT_FIELDS.map(({ key, label }) => (
            <div key={key} className="grid grid-cols-[auto_1fr_1fr] items-center border-b border-slate-800 last:border-0 px-3 py-1.5 gap-2">
              <input type="checkbox" className="w-4 h-4 accent-sky-500"
                checked={mappingState[key]?.included || false}
                onChange={(e) => setM(key, 'included', e.target.checked)}
              />
              <span className={`text-sm ${mappingState[key]?.included ? 'text-slate-200' : 'text-slate-500'}`}>{label}</span>
              <input
                type="text"
                disabled={!mappingState[key]?.included}
                value={mappingState[key]?.header || ''}
                onChange={(e) => setM(key, 'header', e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 focus:border-sky-500 focus:outline-none disabled:opacity-40"
                placeholder="Bank header name"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="secondary" onClick={onDone}>Cancel</Button>
        <Button size="sm" variant="primary" isLoading={saving} onClick={handleSave}>
          {item ? 'Update Template' : 'Create Template'}
        </Button>
      </div>
    </div>
  )
}

// ─── Bank Templates panel (custom because form is complex) ────────────────────
function BankTemplatesCrudPanel({ templates, onDelete, onSaved }) {
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState(null)

  if (showAdd || editItem) {
    return (
      <div className="bg-slate-900 border border-sky-700 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-slate-200 font-semibold">{editItem ? `Edit: ${editItem.templateName}` : 'New Bank Template'}</p>
          <button onClick={() => { setShowAdd(false); setEditItem(null) }} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <BankTemplateForm
          item={editItem}
          onDone={() => { setShowAdd(false); setEditItem(null) }}
          onSaved={onSaved}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" icon={Plus} variant="primary" onClick={() => setShowAdd(true)}>
          Add Bank Template
        </Button>
      </div>
      {templates.length === 0 ? (
        <p className="py-6 text-center text-slate-500 text-sm">No bank templates yet. Create one to enable bank payment exports.</p>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.templateId} className="flex items-center justify-between p-4 bg-slate-900 border border-slate-700 rounded-lg">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <Landmark className="w-4 h-4 text-sky-400 flex-shrink-0" />
                  <div>
                    <p className="text-slate-100 font-medium">{t.templateName}</p>
                    <div className="flex gap-3 mt-0.5">
                      <span className="text-slate-400 text-xs">{t.bankName}</span>
                      <span className="text-xs px-1.5 py-0.5 bg-slate-700 text-slate-300 rounded">{(t.exportFormat || 'csv').toUpperCase()}</span>
                      <span className="text-slate-500 text-xs">{Object.keys(t.fieldMappings || {}).length} mapped fields</span>
                    </div>
                    {t.payerName && <p className="text-slate-500 text-xs mt-0.5">Payer: {t.payerName}</p>}
                  </div>
                </div>
              </div>
              <div className="flex gap-1.5 ml-4">
                <button onClick={() => setEditItem(t)} className="p-1.5 text-sky-400 hover:bg-sky-900/30 rounded">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => onDelete(t.templateId)} className="p-1.5 text-red-400 hover:bg-red-900/30 rounded">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
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

// ── Timezone offset options for U5 device clock + local timezone ─────────────
const TZ_OPTIONS = [
  { label: 'UTC+5:30  — India (IST)',              value: '330'  },
  { label: 'UTC+8:00  — China / Singapore (CST)',  value: '480'  },
  { label: 'UTC+0:00  — UTC / GMT',                value: '0'    },
  { label: 'UTC+3:00  — Moscow (MSK)',              value: '180'  },
  { label: 'UTC+3:30  — Iran (IRST)',               value: '210'  },
  { label: 'UTC+4:00  — Dubai (GST)',               value: '240'  },
  { label: 'UTC+4:30  — Kabul (AFT)',               value: '270'  },
  { label: 'UTC+6:00  — Bangladesh (BST)',          value: '360'  },
  { label: 'UTC+6:30  — Myanmar (MMT)',             value: '390'  },
  { label: 'UTC+7:00  — Bangkok / Jakarta (WIB)',   value: '420'  },
  { label: 'UTC+9:00  — Japan / Korea (JST)',       value: '540'  },
  { label: 'UTC+9:30  — Adelaide (ACST)',           value: '570'  },
  { label: 'UTC+10:00 — Sydney (AEST)',             value: '600'  },
]

// ─── U5 Face Recognition Machines tab ────────────────────────────────────────
function U5MachinesTab() {
  const blankDevice = {
    deviceName: '', deviceSn: '', connectionMode: 'embedded',
    mqttToken: 'edge', embeddedPort: 1883,
    vpsHost: '', vpsPort: 1883, vpsUsername: '', vpsPassword: '',
    deviceIp: '', devicePort: 80, devicePassword: '',
  }

  const [devices, setDevices]         = useState([])
  const [liveStatus, setLiveStatus]   = useState(null)
  const [prefs, setPrefs]             = useState({})
  const [loading, setLoading]         = useState(true)
  const [err, setErr]                 = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [editId, setEditId]           = useState(null)
  const [deviceForm, setDeviceForm]   = useState(blankDevice)
  const [deviceSaving, setDeviceSaving] = useState(false)
  const [vpsForm, setVpsForm]         = useState({ u5_vps_host: '', u5_vps_port: '1883', u5_vps_username: '', u5_vps_password: '', u5_vps_token: 'edge' })
  const [tzForm, setTzForm]           = useState({ u5_device_utc_offset: '480', u5_local_utc_offset: '330', u5_http_poll_interval_sec: '30' })
  const [prefSaving, setPrefSaving]   = useState(false)
  const [tzSaving, setTzSaving]       = useState(false)

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const [devRes, statusRes, prefsRes] = await Promise.all([
        getU5Devices(), getU5Status(), getU5Preferences(),
      ])
      setDevices(devRes.data || [])
      setLiveStatus(statusRes.data || null)
      const p = prefsRes.data || {}
      setPrefs(p)
      setVpsForm(f => ({
        u5_vps_host:     p.u5_vps_host     || f.u5_vps_host,
        u5_vps_port:     p.u5_vps_port     || f.u5_vps_port,
        u5_vps_username: p.u5_vps_username || f.u5_vps_username,
        u5_vps_password: '',
        u5_vps_token:    p.u5_vps_token    || f.u5_vps_token,
      }))
      setTzForm(f => ({
        u5_device_utc_offset:      p.u5_device_utc_offset      || f.u5_device_utc_offset,
        u5_local_utc_offset:       p.u5_local_utc_offset        || f.u5_local_utc_offset,
        u5_http_poll_interval_sec: p.u5_http_poll_interval_sec  || f.u5_http_poll_interval_sec,
      }))
    } catch (e) { if (!quiet) setErr(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    const t = setInterval(() => {
      getU5Status().then(r => setLiveStatus(r.data || null)).catch(() => {})
    }, 8000)
    return () => clearInterval(t)
  }, [])

  const handleSaveDevice = async () => {
    if (!deviceForm.deviceName.trim()) { setErr('Device name is required'); return }
    if (!deviceForm.deviceSn.trim())   { setErr('Device serial number is required'); return }
    if (deviceForm.connectionMode === 'http' && !deviceForm.deviceIp.trim()) { setErr('Device IP is required for HTTP mode'); return }
    setDeviceSaving(true); setErr('')
    try {
      if (editId) await updateU5Device(editId, deviceForm)
      else        await createU5Device(deviceForm)
      setShowAddForm(false); setEditId(null); setDeviceForm(blankDevice)
      load(true)
    } catch (e) { setErr(e.message) }
    finally { setDeviceSaving(false) }
  }

  const handleDeleteDevice = async (id) => {
    if (!window.confirm('Remove this U5 device?')) return
    try { await deleteU5Device(id); load(true) }
    catch (e) { setErr(e.message) }
  }

  const startEdit = (d) => {
    setEditId(d.id)
    setDeviceForm({
      deviceName: d.deviceName, deviceSn: d.deviceSn, connectionMode: d.connectionMode,
      mqttToken: d.mqttToken || 'edge', embeddedPort: d.embeddedPort || 1883,
      vpsHost: d.vpsHost || '', vpsPort: d.vpsPort || 1883, vpsUsername: d.vpsUsername || '', vpsPassword: '',
      deviceIp: d.deviceIp || '', devicePort: d.devicePort || 80, devicePassword: '',
    })
    setShowAddForm(true)
  }

  const handleSaveVpsPrefs = async () => {
    setPrefSaving(true); setErr('')
    try { await updateU5Preferences(vpsForm); load(true) }
    catch (e) { setErr(e.message) }
    finally { setPrefSaving(false) }
  }

  const handleSaveTzPrefs = async () => {
    setTzSaving(true); setErr('')
    try { await updateU5Preferences(tzForm); load(true) }
    catch (e) { setErr(e.message) }
    finally { setTzSaving(false) }
  }

  const handleFacePhotoToggle = async (val) => {
    try {
      await updateU5Preferences({ u5_store_face_photos: val ? '1' : '0' })
      setPrefs(p => ({ ...p, u5_store_face_photos: val ? '1' : '0' }))
    } catch (e) { setErr(e.message) }
  }

  if (loading) return <div className="py-8 text-center text-slate-400">Loading U5 settings…</div>

  return (
    <div className="space-y-5">
      {err && <Alert variant="danger" message={err} onClose={() => setErr('')} />}

      {/* Status overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`bg-slate-900 border rounded-lg p-4 ${liveStatus?.embeddedBrokerRunning ? 'border-green-700/50' : 'border-slate-700'}`}>
          <div className="flex items-center gap-2 mb-1">
            <Server className="w-4 h-4 text-sky-400" />
            <span className="text-slate-400 text-xs font-semibold uppercase tracking-wide">Embedded Broker</span>
          </div>
          <p className={`text-sm font-semibold ${liveStatus?.embeddedBrokerRunning ? 'text-green-400' : 'text-slate-500'}`}>
            {liveStatus?.embeddedBrokerRunning ? `Running · port ${liveStatus.embeddedBrokerPort}` : 'Not running'}
          </p>
          {!liveStatus?.embeddedBrokerRunning && (
            <p className="text-slate-600 text-xs mt-1">npm install aedes mqtt — then restart</p>
          )}
        </div>

        <div className={`bg-slate-900 border rounded-lg p-4 ${liveStatus?.vpsConnected ? 'border-green-700/50' : 'border-slate-700'}`}>
          <div className="flex items-center gap-2 mb-1">
            <Wifi className="w-4 h-4 text-sky-400" />
            <span className="text-slate-400 text-xs font-semibold uppercase tracking-wide">VPS Broker</span>
          </div>
          <p className={`text-sm font-semibold ${liveStatus?.vpsConnected ? 'text-green-400' : 'text-slate-500'}`}>
            {liveStatus?.vpsConnected ? 'Connected' : 'Not connected'}
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Cpu className="w-4 h-4 text-sky-400" />
            <span className="text-slate-400 text-xs font-semibold uppercase tracking-wide">Devices</span>
          </div>
          <p className="text-slate-100 text-sm font-semibold">{devices.length} registered</p>
          <p className="text-green-400 text-xs">
            {liveStatus?.devices?.filter(d => d.online).length || 0} online now
          </p>
        </div>
      </div>

      {/* Device list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-200">Registered U5 Devices</h3>
          <Button size="sm" icon={Plus} variant="primary"
            onClick={() => { setDeviceForm(blankDevice); setEditId(null); setShowAddForm(true) }}>
            Add Device
          </Button>
        </div>

        {showAddForm && (
          <div className="bg-slate-900 border border-sky-700 rounded-lg p-4 space-y-3">
            <p className="text-sm font-semibold text-sky-300">{editId ? 'Edit Device' : 'Add U5 Device'}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input label="Device Name *" placeholder="e.g. Main Entrance" value={deviceForm.deviceName}
                onChange={(e) => setDeviceForm(p => ({ ...p, deviceName: e.target.value }))} />
              <Input label="Device Serial (SN) *" placeholder="e.g. ZY20240703003" value={deviceForm.deviceSn}
                onChange={(e) => setDeviceForm(p => ({ ...p, deviceSn: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Connection Mode</label>
              <div className="flex flex-wrap gap-6">
                {[
                  ['http',     'Direct HTTP (LAN polling)'],
                  ['embedded', 'LAN — Embedded MQTT Broker'],
                  ['vps',      'VPS / Cloud MQTT'],
                ].map(([val, lbl]) => (
                  <label key={val} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                    <input type="radio" name={`connMode-${editId || 'new'}`} value={val}
                      checked={deviceForm.connectionMode === val}
                      onChange={() => setDeviceForm(p => ({ ...p, connectionMode: val }))} />
                    {lbl}
                  </label>
                ))}
              </div>
            </div>

            {/* HTTP mode fields */}
            {deviceForm.connectionMode === 'http' && (
              <div className="bg-sky-900/10 border border-sky-700/40 rounded-lg p-3 space-y-3">
                <p className="text-sky-300 text-xs font-semibold">HTTP Direct — edge polls the device every 30 s via its built-in HTTP API</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <Input label="Device IP *" placeholder="192.168.1.224" value={deviceForm.deviceIp}
                      onChange={(e) => setDeviceForm(p => ({ ...p, deviceIp: e.target.value }))} />
                  </div>
                  <Input label="HTTP Port" type="number" placeholder="80" value={deviceForm.devicePort}
                    onChange={(e) => setDeviceForm(p => ({ ...p, devicePort: Number(e.target.value) }))} />
                </div>
                <Input label="Device Password" type="password" placeholder="123456 (default)" value={deviceForm.devicePassword}
                  onChange={(e) => setDeviceForm(p => ({ ...p, devicePassword: e.target.value }))} />
              </div>
            )}

            {/* MQTT token + embedded / VPS fields */}
            {deviceForm.connectionMode !== 'http' && (
              <Input label="MQTT Token" placeholder="edge" value={deviceForm.mqttToken}
                onChange={(e) => setDeviceForm(p => ({ ...p, mqttToken: e.target.value }))} />
            )}
            {deviceForm.connectionMode === 'embedded' && (
              <div className="grid grid-cols-2 gap-3">
                <Input label="Broker Port" type="number" placeholder="1883" value={deviceForm.embeddedPort}
                  onChange={(e) => setDeviceForm(p => ({ ...p, embeddedPort: Number(e.target.value) }))} />
              </div>
            )}
            {deviceForm.connectionMode === 'vps' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input label="VPS Host" placeholder="154.61.69.200" value={deviceForm.vpsHost}
                  onChange={(e) => setDeviceForm(p => ({ ...p, vpsHost: e.target.value }))} />
                <Input label="VPS Port" type="number" placeholder="1883" value={deviceForm.vpsPort}
                  onChange={(e) => setDeviceForm(p => ({ ...p, vpsPort: Number(e.target.value) }))} />
                <Input label="Username" placeholder="MQTT username" value={deviceForm.vpsUsername}
                  onChange={(e) => setDeviceForm(p => ({ ...p, vpsUsername: e.target.value }))} />
                <Input label="Password" type="password" placeholder="MQTT password" value={deviceForm.vpsPassword}
                  onChange={(e) => setDeviceForm(p => ({ ...p, vpsPassword: e.target.value }))} />
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="secondary" onClick={() => { setShowAddForm(false); setEditId(null) }}>Cancel</Button>
              <Button size="sm" variant="primary" isLoading={deviceSaving} onClick={handleSaveDevice}>
                {editId ? 'Update' : 'Add'} Device
              </Button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-2 px-3 text-slate-400">Name</th>
                <th className="text-left py-2 px-3 text-slate-400">Serial (SN)</th>
                <th className="text-left py-2 px-3 text-slate-400">Mode</th>
                <th className="text-left py-2 px-3 text-slate-400">IP / Host</th>
                <th className="text-left py-2 px-3 text-slate-400">Status</th>
                <th className="text-left py-2 px-3 text-slate-400">Last Seen</th>
                <th className="text-right py-2 px-3 text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {devices.length === 0 && (
                <tr>
                  <td colSpan="6" className="py-10 text-center text-slate-500 text-sm">
                    No devices yet. Click "Add Device" to register your U5 face recognition machine.
                  </td>
                </tr>
              )}
              {devices.map(d => {
                const live = liveStatus?.devices?.find(x => x.deviceSn === d.deviceSn)
                const online = live?.online ?? (d.status === 'online')
                return (
                  <tr key={d.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                    <td className="py-2 px-3 text-slate-200 font-medium">{d.deviceName}</td>
                    <td className="py-2 px-3 text-slate-400 font-mono text-xs">{d.deviceSn}</td>
                    <td className="py-2 px-3 text-slate-400 capitalize">{d.connectionMode}</td>
                    <td className="py-2 px-3 text-slate-500 font-mono text-xs">
                      {d.connectionMode === 'http' ? (d.deviceIp || '—') : (d.vpsHost || '—')}
                    </td>
                    <td className="py-2 px-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${online ? 'bg-green-900/30 text-green-400' : 'bg-slate-800 text-slate-500'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-green-400' : 'bg-slate-600'}`} />
                        {online ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-500 text-xs">
                      {(live?.lastSeen || d.lastSeen)?.slice(0, 16).replace('T', ' ') || '—'}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => startEdit(d)} className="p-1.5 text-sky-400 hover:bg-sky-900/30 rounded">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDeleteDevice(d.id)} className="p-1.5 text-red-400 hover:bg-red-900/30 rounded">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* VPS broker settings */}
      <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 space-y-3">
        <div>
          <h3 className="text-base font-semibold text-slate-200 flex items-center gap-2">
            <Wifi className="w-4 h-4 text-sky-400" /> VPS MQTT Broker (shared credentials)
          </h3>
          <p className="text-slate-500 text-xs mt-0.5">
            Used by all VPS-mode devices. Points to your existing broker at 154.61.69.200:1883.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <Input label="VPS Host / IP" placeholder="154.61.69.200" value={vpsForm.u5_vps_host}
              onChange={(e) => setVpsForm(p => ({ ...p, u5_vps_host: e.target.value }))} />
          </div>
          <Input label="Port" type="number" placeholder="1883" value={vpsForm.u5_vps_port}
            onChange={(e) => setVpsForm(p => ({ ...p, u5_vps_port: e.target.value }))} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input label="Username" placeholder="MQTT username" value={vpsForm.u5_vps_username}
            onChange={(e) => setVpsForm(p => ({ ...p, u5_vps_username: e.target.value }))} />
          <Input label="Password" type="password" placeholder="MQTT password" value={vpsForm.u5_vps_password}
            onChange={(e) => setVpsForm(p => ({ ...p, u5_vps_password: e.target.value }))} />
          <Input label="Default Token" placeholder="edge" value={vpsForm.u5_vps_token}
            onChange={(e) => setVpsForm(p => ({ ...p, u5_vps_token: e.target.value }))} />
        </div>
        <Button size="sm" variant="primary" isLoading={prefSaving} onClick={handleSaveVpsPrefs}>
          Save VPS Settings
        </Button>
      </div>

      {/* Face photo setting */}
      <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 space-y-3">
        <h3 className="text-base font-semibold text-slate-200">Data Settings</h3>
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input type="checkbox"
            checked={prefs.u5_store_face_photos === '1'}
            onChange={(e) => handleFacePhotoToggle(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-slate-600 bg-slate-800 text-sky-500 cursor-pointer"
          />
          <div>
            <p className="text-slate-200 text-sm font-medium">Store face capture photos in database</p>
            <p className="text-slate-500 text-xs mt-0.5">
              When enabled, the face image from each attendance record is saved alongside the record.
              This increases database size. Most installations keep this OFF. Default: OFF.
            </p>
          </div>
        </label>
      </div>

      {/* Timezone settings */}
      <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-slate-200 flex items-center gap-2">
            Timezone Settings (HTTP mode)
          </h3>
          <p className="text-slate-500 text-xs mt-0.5">
            U5 devices manufactured in China ship with their clock set to CST (UTC+8).
            Set the device timezone so attendance times are stored in your local time.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Device Clock Timezone</label>
            <select
              value={tzForm.u5_device_utc_offset}
              onChange={(e) => setTzForm(p => ({ ...p, u5_device_utc_offset: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none text-sm"
            >
              {TZ_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <p className="text-slate-600 text-xs mt-1">Timezone the device's internal clock is set to</p>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Store Records In (Local Timezone)</label>
            <select
              value={tzForm.u5_local_utc_offset}
              onChange={(e) => setTzForm(p => ({ ...p, u5_local_utc_offset: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none text-sm"
            >
              {TZ_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <p className="text-slate-600 text-xs mt-1">Attendance records will be stored in this timezone</p>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Poll Interval (seconds)</label>
            <input
              type="number" min="10" max="300"
              value={tzForm.u5_http_poll_interval_sec}
              onChange={(e) => setTzForm(p => ({ ...p, u5_http_poll_interval_sec: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none text-sm"
            />
            <p className="text-slate-600 text-xs mt-1">How often to fetch new punches from HTTP devices</p>
          </div>
        </div>
        {tzForm.u5_device_utc_offset !== tzForm.u5_local_utc_offset && (
          <div className="text-xs text-sky-300 bg-sky-900/20 border border-sky-700/40 rounded px-3 py-2">
            Offset applied: {((Number(tzForm.u5_local_utc_offset) - Number(tzForm.u5_device_utc_offset)) / 60).toFixed(1)} h
            &nbsp;(device time → local time)
          </div>
        )}
        <Button size="sm" variant="primary" isLoading={tzSaving} onClick={handleSaveTzPrefs}>
          Save Timezone Settings
        </Button>
      </div>
    </div>
  )
}

// ─── M68 (WitEasy FK BS-protocol) Machines tab ───────────────────────────────
function M68MachinesTab() {
  const blankForm = { devId: '', name: '', location: '' }

  const [devices, setDevices]             = useState([])
  const [status, setStatus]               = useState(null)
  const [events, setEvents]               = useState([])
  const [loading, setLoading]             = useState(true)
  const [err, setErr]                     = useState('')
  const [toast, setToast]                 = useState('')
  const [showAddForm, setShowAddForm]     = useState(false)
  const [editId, setEditId]               = useState(null)
  const [form, setForm]                   = useState(blankForm)
  const [saving, setSaving]               = useState(false)
  const [cmdBusy, setCmdBusy]             = useState({})
  const [expandedUsers, setExpandedUsers] = useState({})  // devId → { loading, users, error }
  const [usersBusy, setUsersBusy]         = useState({})

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3500) }

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const [devRes, statusRes, evtRes] = await Promise.all([
        getM68Devices(), getM68Status(), getM68Events(20),
      ])
      setDevices(devRes.data || [])
      setStatus(statusRes.data || null)
      setEvents(evtRes.data || [])
    } catch (e) { if (!quiet) setErr(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    const t = setInterval(() => {
      getM68Status().then(r => setStatus(r.data || null)).catch(() => {})
    }, 10000)
    return () => clearInterval(t)
  }, [])

  const handleSave = async () => {
    if (!form.devId.trim()) { setErr('Device ID is required'); return }
    if (!form.name.trim())  { setErr('Device name is required'); return }
    setSaving(true); setErr('')
    try {
      if (editId) {
        await updateM68Device(editId, { name: form.name, location: form.location })
      } else {
        await createM68Device({ devId: form.devId.trim(), name: form.name.trim(), location: form.location.trim() || undefined })
      }
      setShowAddForm(false); setEditId(null); setForm(blankForm)
      load(true)
      showToast(editId ? 'Device updated.' : 'Device registered.')
    } catch (e) { setErr(e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (id, devId) => {
    if (!window.confirm(`Remove device "${devId}"? Pending commands will be deleted.`)) return
    try { await deleteM68Device(id); load(true); showToast('Device removed.') }
    catch (e) { setErr(e.message) }
  }

  const startEdit = (d) => {
    setEditId(d.id)
    setForm({ devId: d.devId, name: d.name, location: d.location || '' })
    setShowAddForm(true)
  }

  const prefillFromEvent = (devId) => {
    setForm({ devId, name: '', location: '' })
    setEditId(null)
    setShowAddForm(true)
    setErr('')
  }

  const sendCmd = async (devId, cmdCode, label) => {
    setCmdBusy(p => ({ ...p, [`${devId}_${cmdCode}`]: true }))
    setErr('')
    try {
      await sendM68Command({ devId, cmdCode })
      showToast(`${label} queued for ${devId} — will be sent on next device poll.`)
    } catch (e) { setErr(e.message) }
    finally { setCmdBusy(p => ({ ...p, [`${devId}_${cmdCode}`]: false })) }
  }

  const loadDeviceUsers = async (deviceId, devId) => {
    setExpandedUsers(p => ({ ...p, [devId]: { loading: true, users: [], error: '' } }))
    try {
      const r = await getM68DeviceUsers(deviceId)
      setExpandedUsers(p => ({ ...p, [devId]: { loading: false, users: r.data?.users || [], error: '', lastSyncAt: r.data?.lastSyncAt, lastSyncSummary: r.data?.lastSyncSummary } }))
    } catch (e) {
      setExpandedUsers(p => ({ ...p, [devId]: { loading: false, users: [], error: e.message } }))
    }
  }

  const toggleDeviceUsers = (deviceId, devId) => {
    if (expandedUsers[devId]) {
      setExpandedUsers(p => { const n = { ...p }; delete n[devId]; return n })
    } else {
      loadDeviceUsers(deviceId, devId)
    }
  }

  const refreshUsers = async (devId, cmdCode) => {
    setUsersBusy(p => ({ ...p, [devId]: true }))
    setErr('')
    try {
      await sendM68Command({ devId, cmdCode: 'GET_USER_ID_LIST' })
      showToast(`Refresh Users queued for ${devId} — will execute on next device poll.`)
    } catch (e) { setErr(e.message) }
    finally { setUsersBusy(p => ({ ...p, [devId]: false })) }
  }

  const listenerPort = status?.listener?.port || 5005
  const listenerRunning = status?.listener?.running || false
  const lanIps = status?.lanIps || []

  if (loading) return <div className="py-8 text-center text-slate-400">Loading M68 settings…</div>

  // Unregistered device events (kind === 'unregistered') not yet in the device list
  const registeredIds = new Set(devices.map(d => d.devId))
  const unregisteredSeen = events
    .filter(e => e.kind === 'unregistered' && !registeredIds.has(e.devId))
    .reduce((acc, e) => {
      if (!acc.some(x => x.devId === e.devId)) acc.push(e)
      return acc
    }, [])

  return (
    <div className="space-y-5">
      {err   && <Alert variant="danger"  message={err}   onClose={() => setErr('')} />}
      {toast && <Alert variant="success" message={toast} onClose={() => setToast('')} />}

      {/* Status overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`bg-slate-900 border rounded-lg p-4 ${listenerRunning ? 'border-green-700/50' : 'border-slate-700'}`}>
          <div className="flex items-center gap-2 mb-1">
            <Server className="w-4 h-4 text-sky-400" />
            <span className="text-slate-400 text-xs font-semibold uppercase tracking-wide">M68 Listener</span>
          </div>
          <p className={`text-sm font-semibold ${listenerRunning ? 'text-green-400' : 'text-slate-500'}`}>
            {listenerRunning ? `Running · port ${listenerPort}` : `Not running · port ${listenerPort}`}
          </p>
          {!listenerRunning && (
            <p className="text-slate-600 text-xs mt-1">Check EDGE_M68_PORT env and restart app</p>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Wifi className="w-4 h-4 text-sky-400" />
            <span className="text-slate-400 text-xs font-semibold uppercase tracking-wide">LAN IP (for device config)</span>
          </div>
          {lanIps.length > 0
            ? lanIps.map(ip => <p key={ip} className="text-sky-300 text-sm font-mono font-semibold">{ip}</p>)
            : <p className="text-slate-500 text-sm">Could not detect LAN IP</p>
          }
        </div>

        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Cpu className="w-4 h-4 text-sky-400" />
            <span className="text-slate-400 text-xs font-semibold uppercase tracking-wide">Devices</span>
          </div>
          <p className="text-slate-100 text-sm font-semibold">{devices.length} registered</p>
          <p className="text-green-400 text-xs">
            {devices.filter(d => d.online).length} online now
          </p>
        </div>
      </div>

      {/* Device setup instructions */}
      <div className="bg-sky-900/10 border border-sky-700/40 rounded-lg p-4 text-xs text-slate-300 space-y-1">
        <p className="font-semibold text-sky-300 mb-2">M68 Device Setup (on machine screen)</p>
        <p>1. <span className="font-medium text-slate-200">Network → Net Mode:</span> set to <span className="font-mono text-sky-200">Internet</span></p>
        <p>2. <span className="font-medium text-slate-200">Network → Server Set → DNS:</span> <span className="font-mono text-sky-200">No</span></p>
        <p>3. <span className="font-medium text-slate-200">Network → Server Set → Server IP:</span> <span className="font-mono text-sky-200">{lanIps[0] || '<this PC LAN IP>'}</span></p>
        <p>4. <span className="font-medium text-slate-200">Network → Server Set → SerPortNo:</span> <span className="font-mono text-sky-200">{listenerPort}</span></p>
        <p>5. <span className="font-medium text-slate-200">Network → Server Set → Server Req:</span> <span className="font-mono text-sky-200">Yes</span></p>
        <p className="text-slate-500 mt-2">The device will poll every 5–20 s. Ensure Windows Firewall allows inbound TCP on port {listenerPort}.</p>
      </div>

      {/* Unregistered devices seen */}
      {unregisteredSeen.length > 0 && (
        <div className="bg-amber-900/10 border border-amber-700/40 rounded-lg p-4">
          <p className="text-amber-300 text-sm font-semibold mb-2">Recently seen unregistered devices</p>
          <div className="space-y-1">
            {unregisteredSeen.map(e => (
              <div key={e.devId} className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-mono">{e.devId}</span>
                <button
                  onClick={() => prefillFromEvent(e.devId)}
                  className="text-sky-400 hover:text-sky-300 underline ml-4"
                >
                  Register this device
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Device list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-200">Registered M68 Devices</h3>
          <Button size="sm" icon={Plus} variant="primary"
            onClick={() => { setForm(blankForm); setEditId(null); setShowAddForm(true) }}>
            Add Device
          </Button>
        </div>

        {showAddForm && (
          <div className="bg-slate-900 border border-sky-700 rounded-lg p-4 space-y-3">
            <p className="text-sm font-semibold text-sky-300">{editId ? 'Edit Device' : 'Add M68 Device'}</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input
                label="Device ID *"
                placeholder="e.g. M68001 (from machine sticker)"
                value={form.devId}
                disabled={!!editId}
                onChange={(e) => setForm(p => ({ ...p, devId: e.target.value }))}
              />
              <Input
                label="Name *"
                placeholder="e.g. Main Entrance"
                value={form.name}
                onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
              />
              <Input
                label="Location"
                placeholder="e.g. Ground Floor"
                value={form.location}
                onChange={(e) => setForm(p => ({ ...p, location: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="secondary" onClick={() => { setShowAddForm(false); setEditId(null) }}>Cancel</Button>
              <Button size="sm" variant="primary" isLoading={saving} onClick={handleSave}>
                {editId ? 'Update' : 'Register'} Device
              </Button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-2 px-3 text-slate-400">Name</th>
                <th className="text-left py-2 px-3 text-slate-400">Dev ID</th>
                <th className="text-left py-2 px-3 text-slate-400">Location</th>
                <th className="text-left py-2 px-3 text-slate-400">Status</th>
                <th className="text-left py-2 px-3 text-slate-400">Last Seen</th>
                <th className="text-left py-2 px-3 text-slate-400">Pending</th>
                <th className="text-left py-2 px-3 text-slate-400">Unmapped</th>
                <th className="text-right py-2 px-3 text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {devices.length === 0 && (
                <tr>
                  <td colSpan="8" className="py-10 text-center text-slate-500 text-sm">
                    No M68 devices registered yet. Click "Add Device" to register your WitEasy machine.
                  </td>
                </tr>
              )}
              {devices.map(d => (
                <React.Fragment key={d.id}>
                <tr className="border-b border-slate-800 hover:bg-slate-800/30">
                  <td className="py-2 px-3 text-slate-200 font-medium">{d.name}</td>
                  <td className="py-2 px-3 text-slate-400 font-mono text-xs">{d.devId}</td>
                  <td className="py-2 px-3 text-slate-500 text-xs">{d.location || '—'}</td>
                  <td className="py-2 px-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${d.online ? 'bg-green-900/30 text-green-400' : 'bg-slate-800 text-slate-500'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${d.online ? 'bg-green-400' : 'bg-slate-600'}`} />
                      {d.online ? 'Online' : 'Offline'}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-slate-500 text-xs">
                    {d.lastSeenAt?.slice(0, 16).replace('T', ' ') || '—'}
                  </td>
                  <td className="py-2 px-3 text-xs">
                    <span className={d.pendingCommands > 0 ? 'text-amber-400' : 'text-slate-600'}>
                      {d.pendingCommands} cmd{d.pendingCommands !== 1 ? 's' : ''}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-xs">
                    <span className={d.unmappedPunches > 0 ? 'text-sky-400' : 'text-slate-600'}>
                      {d.unmappedPunches} punch{d.unmappedPunches !== 1 ? 'es' : ''}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right">
                    <div className="flex justify-end gap-1 flex-wrap">
                      <button
                        disabled={cmdBusy[`${d.devId}_SET_TIME`]}
                        onClick={() => sendCmd(d.devId, 'SET_TIME', 'Sync Time')}
                        title="Sync device clock to server time"
                        className="px-2 py-1 text-xs text-sky-300 hover:bg-sky-900/30 rounded border border-sky-800/40 disabled:opacity-40"
                      >
                        {cmdBusy[`${d.devId}_SET_TIME`] ? '…' : 'Sync Time'}
                      </button>
                      <button
                        disabled={cmdBusy[`${d.devId}_GET_LOG_DATA`]}
                        onClick={() => sendCmd(d.devId, 'GET_LOG_DATA', 'Pull Logs')}
                        title="Pull all attendance logs from device (results staged after device delivers them)"
                        className="px-2 py-1 text-xs text-sky-300 hover:bg-sky-900/30 rounded border border-sky-800/40 disabled:opacity-40"
                      >
                        {cmdBusy[`${d.devId}_GET_LOG_DATA`] ? '…' : 'Pull Logs'}
                      </button>
                      <button
                        disabled={cmdBusy[`${d.devId}_GET_DEVICE_STATUS`]}
                        onClick={() => sendCmd(d.devId, 'GET_DEVICE_STATUS', 'Device Status')}
                        title="Query device status"
                        className="px-2 py-1 text-xs text-sky-300 hover:bg-sky-900/30 rounded border border-sky-800/40 disabled:opacity-40"
                      >
                        {cmdBusy[`${d.devId}_GET_DEVICE_STATUS`] ? '…' : 'Device Status'}
                      </button>
                      <button
                        disabled={usersBusy[d.devId]}
                        onClick={() => refreshUsers(d.devId)}
                        title="Queue GET_USER_ID_LIST to refresh enrolled users"
                        className="px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-900/30 rounded border border-emerald-800/40 disabled:opacity-40"
                      >
                        {usersBusy[d.devId] ? '…' : 'Refresh Users'}
                      </button>
                      <button
                        onClick={() => toggleDeviceUsers(d.id, d.devId)}
                        title="View enrolled users on this device"
                        className={`px-2 py-1 text-xs rounded border disabled:opacity-40 ${expandedUsers[d.devId] ? 'text-emerald-300 border-emerald-700 bg-emerald-900/20' : 'text-slate-400 border-slate-700 hover:bg-slate-800/50'}`}
                      >
                        {expandedUsers[d.devId] ? 'Hide Users' : `Users${d.deviceUserCount > 0 ? ` (${d.deviceUserCount})` : ''}`}
                      </button>
                      <button onClick={() => startEdit(d)} className="p-1.5 text-sky-400 hover:bg-sky-900/30 rounded">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(d.id, d.devId)} className="p-1.5 text-red-400 hover:bg-red-900/30 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {d.lastBackfill && (
                      <div className="text-xs text-slate-500 mt-1 text-right">
                        Last pull: <span className="text-slate-400">{d.lastBackfill.summary}</span>
                      </div>
                    )}
                  </td>
                </tr>
                {expandedUsers[d.devId] && (
                  <tr>
                    <td colSpan="8" className="px-3 pb-3 bg-slate-900/40">
                      <div className="border border-slate-700 rounded-lg p-3 mt-1">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-emerald-300">Device Users — {d.devId}</span>
                          {expandedUsers[d.devId]?.lastSyncAt && (
                            <span className="text-xs text-slate-500">
                              Last sync: {expandedUsers[d.devId].lastSyncAt?.slice(0, 16).replace('T', ' ')}
                              {expandedUsers[d.devId].lastSyncSummary && (
                                <span className="ml-2 text-slate-600">({expandedUsers[d.devId].lastSyncSummary})</span>
                              )}
                            </span>
                          )}
                        </div>
                        {expandedUsers[d.devId].loading && (
                          <p className="text-xs text-slate-400 py-2">Loading users…</p>
                        )}
                        {expandedUsers[d.devId].error && (
                          <p className="text-xs text-red-400 py-2">{expandedUsers[d.devId].error}</p>
                        )}
                        {!expandedUsers[d.devId].loading && !expandedUsers[d.devId].error && (
                          expandedUsers[d.devId].users.length === 0
                            ? <p className="text-xs text-slate-500 py-2">No users found. Click "Refresh Users" to pull the user list from the device.</p>
                            : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-slate-700">
                                    <th className="text-left py-1.5 px-2 text-slate-400">User ID</th>
                                    <th className="text-left py-1.5 px-2 text-slate-400">Name</th>
                                    <th className="text-left py-1.5 px-2 text-slate-400">Privilege</th>
                                    <th className="text-left py-1.5 px-2 text-slate-400">Enabled</th>
                                    <th className="text-left py-1.5 px-2 text-slate-400">Mapped Employee</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {expandedUsers[d.devId].users.map(u => (
                                    <tr key={u.userId} className="border-b border-slate-800/50">
                                      <td className="py-1 px-2 text-slate-300 font-mono">{u.userId}</td>
                                      <td className="py-1 px-2 text-slate-400">{u.userName || <span className="text-slate-600 italic">—</span>}</td>
                                      <td className="py-1 px-2 text-slate-500">{u.privilege === 0 ? 'Staff' : u.privilege === 1 ? 'Admin' : u.privilege}</td>
                                      <td className="py-1 px-2">
                                        <span className={`px-1.5 py-0.5 rounded text-xs ${u.enabled ? 'bg-green-900/30 text-green-400' : 'bg-slate-800 text-slate-500'}`}>
                                          {u.enabled ? 'Yes' : 'No'}
                                        </span>
                                      </td>
                                      <td className="py-1 px-2">
                                        {u.mappedEmployeeName
                                          ? <span className="text-green-400">{u.mappedEmployeeName} <span className="text-slate-500">({u.mappedEmpCode})</span></span>
                                          : <span className="px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-400 text-xs">unmapped — use Import Mapping to link</span>
                                        }
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )
                        )}
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

      {/* Recent events */}
      {events.length > 0 && (
        <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-2">Recent Device Events</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-1.5 px-2 text-slate-400">Time</th>
                  <th className="text-left py-1.5 px-2 text-slate-400">Dev ID</th>
                  <th className="text-left py-1.5 px-2 text-slate-400">Kind</th>
                </tr>
              </thead>
              <tbody>
                {events.map(e => (
                  <tr key={e.id} className="border-b border-slate-800/50">
                    <td className="py-1 px-2 text-slate-500">{e.receivedAt?.slice(0, 16).replace('T', ' ')}</td>
                    <td className="py-1 px-2 text-slate-300 font-mono">{e.devId}</td>
                    <td className="py-1 px-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                        e.kind === 'unregistered' ? 'bg-red-900/30 text-red-400' :
                        e.kind === 'enroll'       ? 'bg-purple-900/30 text-purple-400' :
                        'bg-slate-800 text-slate-400'
                      }`}>{e.kind}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
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
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateInfo, setUpdateInfo]   = useState(null)
  const [updateError, setUpdateError] = useState('')

  const [shifts, setShifts]         = useState([])
  const [departments, setDepartments] = useState([])
  const [holidays, setHolidays]     = useState([])
  const [deductions, setDeductions] = useState([])
  const [earnings, setEarnings]     = useState([])
  const [bankTemplates, setBankTemplates] = useState([])

  const showSuccess = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000) }

  const fetchAll = () => {
    setLoading(true)
    Promise.all([
      getCompanySettings(), getWorkingHours(), getSyncStatus(), getBackups(),
      getShifts(), getDepartments(), getHolidays(), getDeductions(), getDataInfo(), getEarnings(),
      getBankTemplates(),
    ]).then(([cs, wh, ss, bk, sh, dp, hol, ded, di, ear, bt]) => {
      if (cs.data)  setCompany(cs.data)
      if (wh.data)  setHours(wh.data)
      setSyncStatus(ss.data)
      setBackups(bk.data || [])
      setShifts(sh.data || [])
      setDepartments(dp.data || [])
      setHolidays(hol.data || [])
      setDeductions(ded.data || [])
      setEarnings(ear.data || [])
      setBankTemplates(bt.data || [])
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

  const handleCheckForUpdate = async () => {
    if (!hasElectron()) { setUpdateError('Update check requires the desktop app.'); return }
    setCheckingUpdate(true); setUpdateError(''); setUpdateInfo(null)
    try {
      const res = await window.electronAPI.checkForUpdate()
      if (!res.ok) { setUpdateError(res.error || 'Could not check for updates.'); return }
      setUpdateInfo(res)
    } catch (e) { setUpdateError(e.message) }
    finally { setCheckingUpdate(false) }
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

  const handleDeleteEarning = async (id) => {
    if (!window.confirm('Delete this earning component?')) return
    try { await deleteEarning(id); setEarnings((p) => p.filter((e) => e.earning_id !== id)) }
    catch (e) { setError(e.message) }
  }

  const handleDeleteBankTemplate = async (id) => {
    if (!window.confirm('Delete this bank template?')) return
    try { await deleteBankTemplate(id); setBankTemplates((p) => p.filter((t) => t.templateId !== id)) }
    catch (e) { setError(e.message) }
  }

  const reloadShifts        = () => getShifts().then((r) => setShifts(r.data || [])).catch(() => {})
  const reloadDepts         = () => getDepartments().then((r) => setDepartments(r.data || [])).catch(() => {})
  const reloadHolidays      = () => getHolidays().then((r) => setHolidays(r.data || [])).catch(() => {})
  const reloadDeductions    = () => getDeductions().then((r) => setDeductions(r.data || [])).catch(() => {})
  const reloadEarnings      = () => getEarnings().then((r) => setEarnings(r.data || [])).catch(() => {})
  const reloadBankTemplates = () => getBankTemplates().then((r) => setBankTemplates(r.data || [])).catch(() => {})

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

      {/* ── Earnings ── */}
      {activeTab === 'earnings' && (
        <Card>
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-slate-100">Payroll Earnings</h2>
              <p className="text-slate-400 text-sm mt-1">
                Allowances added on top of Basic salary (DA, HRA, Conveyance, etc.). Each is a configurable
                percentage of Basic. <span className="text-sky-400">Basic salary is always 100% of the employee's salary.</span>
              </p>
            </div>
            {loading ? <div className="py-4 text-center text-slate-400">Loading...</div> : (
              <CrudTable
                idKey="earning_id"
                addLabel="Add Earning"
                columns={[
                  { key: 'name',       label: 'Component Name' },
                  { key: 'percentage', label: '% of Basic', render: (r) => `${r.percentage}%` },
                  { key: 'type',       label: 'Type', render: (r) => (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      r.type === 'fixed' ? 'bg-green-900/40 text-green-300' : 'bg-amber-900/40 text-amber-300'
                    }`}>{r.type}</span>
                  )},
                ]}
                rows={earnings}
                onDelete={handleDeleteEarning}
                renderForm={({ item, onDone }) => (
                  <EarningForm item={item} onDone={onDone} onSaved={reloadEarnings} />
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

      {/* ── Bank Templates ── */}
      {activeTab === 'bank-templates' && (
        <Card>
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <Landmark className="w-5 h-5 text-sky-400" /> Bank Payment Templates
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                Create templates that map EDGEFOLIO payment fields to bank-specific column headers.
                Each bank (HDFC, ICICI, SBI etc.) has different CSV/XML format requirements.
              </p>
            </div>
            {loading ? <div className="py-4 text-center text-slate-400">Loading...</div> : (
              <BankTemplatesCrudPanel
                templates={bankTemplates}
                onDelete={handleDeleteBankTemplate}
                onSaved={reloadBankTemplates}
              />
            )}
          </div>
        </Card>
      )}

      {/* ── U5 Face Recognition Machines ── */}
      {activeTab === 'u5-machines' && (
        <Card>
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <Cpu className="w-5 h-5 text-sky-400" /> U5 Face Recognition Machines
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                Connect U5-Zhongyan biometric machines via Direct HTTP (LAN polling), embedded MQTT broker, or VPS cloud broker.
                Attendance records are fetched automatically and staged for import.
              </p>
            </div>
            <U5MachinesTab />
          </div>
        </Card>
      )}

      {/* ── M68 (WitEasy) Machines ── */}
      {activeTab === 'm68-machines' && (
        <Card>
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <Cpu className="w-5 h-5 text-sky-400" /> M68 (WitEasy) Face Machines
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                WitEasy M68 devices use the FK BS-protocol: the <span className="font-medium text-slate-200">device connects to us</span>.
                Register each device by its Dev ID, configure the machine to point at this PC, and punches arrive in real-time.
                Unmapped punches appear in the Machine Import screen for ID mapping.
              </p>
            </div>
            <M68MachinesTab />
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

          {/* Check for Updates */}
          <Card>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-sky-400" />
                  <h2 className="text-xl font-bold text-slate-100">Check for Updates</h2>
                </div>
                <Button size="sm" variant="primary" isLoading={checkingUpdate} onClick={handleCheckForUpdate}>
                  Check for Updates
                </Button>
              </div>

              {updateError && (
                <p className="text-red-400 text-sm bg-red-900/20 border border-red-700/40 rounded px-3 py-2">{updateError}</p>
              )}

              {updateInfo && !updateInfo.updateAvailable && (
                <p className="text-green-400 text-sm bg-green-900/20 border border-green-700/40 rounded px-3 py-2">
                  You're on the latest version (v{updateInfo.currentVersion}).
                </p>
              )}

              {updateInfo && updateInfo.updateAvailable && (
                <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg p-4 space-y-3">
                  <p className="text-amber-300 font-semibold text-sm">
                    Version {updateInfo.latestVersion} is available (you have {updateInfo.currentVersion}).
                  </p>
                  {updateInfo.notes && <p className="text-slate-300 text-xs whitespace-pre-line">{updateInfo.notes}</p>}
                  <div className="bg-slate-900 border border-slate-700 rounded p-3 text-xs text-slate-300 space-y-1">
                    <p className="font-semibold text-slate-200">Before you update:</p>
                    <p>1. Take a backup below (or from &ldquo;Backup &amp; Restore&rdquo;) — keep the file somewhere safe.</p>
                    <p>2. Uninstall the current EDGEFOLIO version from this PC.</p>
                    <p>3. Install the new version, then restore your backup if needed.</p>
                  </div>
                  <a href={updateInfo.downloadUrl} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="primary">Download New Version</Button>
                  </a>
                </div>
              )}

              {!hasElectron() && (
                <p className="text-amber-400 text-xs bg-amber-900/20 border border-amber-700/40 rounded px-3 py-2">
                  Update check requires the EDGEFOLIO desktop app (.exe). Not available in browser mode.
                </p>
              )}
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

      {/* ── License ── */}
      {activeTab === 'license' && (
        <LicenseTab />
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

// ─── License Tab ─────────────────────────────────────────────────────────────
function LicenseTab() {
  const [info, setInfo]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [err, setErr]         = useState('')
  const [msg, setMsg]         = useState('')

  const load = () => {
    setLoading(true)
    getLicenseStatus()
      .then((res) => setInfo(res.data || null))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleRefresh = async () => {
    setRefreshing(true); setErr(''); setMsg('')
    try {
      await refreshLicense()
      load()
      setMsg('License refreshed successfully.')
    } catch (e) {
      setErr(e.message || 'Refresh failed — check your internet connection.')
    } finally {
      setRefreshing(false)
    }
  }

  const STATE_COLORS = {
    valid:     'bg-green-900/30 text-green-300 border-green-700',
    expiring:  'bg-amber-900/30 text-amber-300 border-amber-700',
    grace:     'bg-orange-900/30 text-orange-300 border-orange-700',
    readonly:  'bg-red-900/30 text-red-300 border-red-700',
    blocked:   'bg-red-900/40 text-red-200 border-red-600',
    unlicensed:'bg-slate-700 text-slate-300 border-slate-600',
  }

  if (loading) return <div className="py-8 text-center text-slate-400">Loading license info...</div>

  return (
    <Card>
      <div className="space-y-5">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Shield className="w-5 h-5 text-sky-400" /> License
          </h2>
          <p className="text-slate-400 text-sm mt-1">Your EDGEFOLIO license status and plan details.</p>
        </div>

        {err && <Alert variant="danger" message={err} onClose={() => setErr('')} />}
        {msg && <Alert variant="success" message={msg} onClose={() => setMsg('')} />}

        {info && (
          <div className="space-y-4">
            {/* State badge */}
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-semibold ${STATE_COLORS[info.state] || STATE_COLORS.unlicensed}`}>
              <span className="w-2 h-2 rounded-full bg-current opacity-70" />
              {(info.state || 'unknown').toUpperCase()}
            </div>

            {/* Details grid */}
            <div className="bg-slate-900 border border-slate-700 rounded-lg divide-y divide-slate-800">
              {info.licenseKey && (
                <FieldRow label="License Key">
                  <span className="font-mono text-slate-300 text-sm">{info.licenseKey}</span>
                </FieldRow>
              )}
              {info.plan?.name && (
                <FieldRow label="Plan">
                  <span className="text-slate-200 text-sm">{info.plan.name}</span>
                </FieldRow>
              )}
              <FieldRow label="Employee Limit">
                <span className="text-slate-200 text-sm">
                  {info.plan?.maxEmployees ? `${info.plan.maxEmployees} active employees` : 'Unlimited'}
                </span>
              </FieldRow>
              {info.expiresAt && (
                <FieldRow label="Expires">
                  <span className="text-slate-200 text-sm">
                    {info.daysLeft != null && info.daysLeft > 3650 ? 'Never' : (
                      <>
                        {new Date(info.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                        {info.daysLeft != null && (
                          <span className={`ml-2 text-xs ${info.daysLeft <= 15 ? 'text-amber-400' : 'text-slate-500'}`}>
                            ({info.daysLeft > 0 ? `${info.daysLeft} days left` : 'expired'})
                          </span>
                        )}
                      </>
                    )}
                  </span>
                </FieldRow>
              )}
            </div>

            {(info.state === 'grace' || info.state === 'readonly' || info.state === 'expiring') && (
              <div className="bg-slate-900 border border-amber-700/40 rounded-lg p-4 text-sm text-amber-300">
                To renew your license, contact support on WhatsApp: +91 72402 26566
              </div>
            )}
          </div>
        )}

        <div className="pt-2">
          <Button variant="secondary" icon={RefreshCw} isLoading={refreshing} onClick={handleRefresh}>
            {refreshing ? 'Checking...' : 'Refresh License'}
          </Button>
        </div>
      </div>
    </Card>
  )
}

export default SettingsPage
