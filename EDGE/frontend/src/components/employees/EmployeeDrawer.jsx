import React, { useState, useEffect } from 'react';
import { X, Edit2, Save, User, Settings, Landmark } from 'lucide-react';
import { Button, Badge, Input, Select } from '../atomic';
import { updateEmployee, getCustomFields, getEmployeeCustomValues, setEmployeeCustomValues } from '../../services/api';

const DEPARTMENTS = ['HR', 'Production', 'Finance', 'Admin', 'Maintenance', 'Sales'];
const WORK_TYPE_OPTS = [
  { value: 'office', label: 'Office' },
  { value: 'field', label: 'Field Duty' },
  { value: 'wfh', label: 'Work From Home' },
];
const ROLE_OPTS = [
  { value: 'user', label: 'User' },
  { value: 'soft_admin', label: 'Soft Admin' },
];
const PAYMENT_MODE_OPTS = [
  { value: 'NEFT', label: 'NEFT' },
  { value: 'RTGS', label: 'RTGS' },
  { value: 'IMPS', label: 'IMPS' },
  { value: 'UPI', label: 'UPI' },
  { value: 'CASH', label: 'Cash' },
];

export function EmployeeDrawer({ employee, onClose, onUpdated }) {
  const [tab, setTab] = useState('basic');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({});
  const [fields, setFields] = useState([]);
  const [customValues, setCustomValues] = useState({});
  const [savingCustom, setSavingCustom] = useState(false);

  useEffect(() => {
    if (!employee) return;
    setForm({
      name: employee.name || '',
      email: employee.email || '',
      phone: employee.phone || '',
      department: employee.department || '',
      designation: employee.designation || '',
      salary: employee.salary || '',
      status: employee.status || 'active',
      workType: employee.workType || 'office',
      appRole: employee.appRole || 'user',
      bankAccountNumber: employee.bankAccountNumber || '',
      bankIfsc: employee.bankIfsc || '',
      bankName: employee.bankName || '',
      paymentMode: employee.paymentMode || 'NEFT',
    });
    setEditing(false);
    setTab('basic');
    setErr('');
  }, [employee]);

  useEffect(() => {
    if (!employee) return;
    getCustomFields().then((res) => setFields(res.data || [])).catch(() => {});
    getEmployeeCustomValues(employee.id).then((res) => {
      const map = {};
      (res.data || []).forEach((v) => { map[v.field_id] = v.value || ''; });
      setCustomValues(map);
    }).catch(() => {});
  }, [employee]);

  if (!employee) return null;

  const f = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const handleSaveBasic = async () => {
    if (!form.name || !form.department || !form.salary) { setErr('Name, department and salary required'); return; }
    setSaving(true); setErr('');
    try {
      await updateEmployee(employee.id, { ...form, salary: Number(form.salary) });
      setEditing(false);
      onUpdated();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const handleSaveCustom = async () => {
    setSavingCustom(true); setErr('');
    try {
      const values = fields.map((f) => ({ fieldId: f.field_id, value: customValues[f.field_id] || '' }));
      await setEmployeeCustomValues(employee.id, { values });
      onUpdated();
    } catch (e) { setErr(e.message); }
    finally { setSavingCustom(false); }
  };

  const initials = employee.name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-slate-800 border-l border-slate-700 w-full max-w-lg flex flex-col h-full shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-sky-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
              {initials}
            </div>
            <div>
              <p className="text-slate-100 font-semibold">{employee.name}</p>
              <p className="text-slate-400 text-xs">{employee.empCode || '—'} · {employee.department}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 pt-3 pb-1 border-b border-slate-700 flex-shrink-0">
          {[
            { id: 'basic', label: 'Basic Info', icon: User },
            { id: 'bank', label: 'Bank Details', icon: Landmark },
            { id: 'custom', label: 'Custom Fields', icon: Settings },
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === id ? 'bg-sky-600 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {err && (
            <div className="p-3 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">{err}</div>
          )}

          {tab === 'basic' && (
            <>
              {!editing ? (
                <div className="space-y-3">
                  <InfoRow label="EMP Code" value={employee.empCode} mono />
                  <InfoRow label="Full Name" value={employee.name} />
                  <InfoRow label="Email" value={employee.email} />
                  <InfoRow label="Phone" value={employee.phone} />
                  <InfoRow label="Department" value={employee.department} />
                  <InfoRow label="Designation" value={employee.designation} />
                  <InfoRow label="Salary" value={employee.salary ? `₹${Number(employee.salary).toLocaleString()}` : null} />
                  <InfoRow label="Joining Date" value={employee.joiningDate} />
                  <div className="flex gap-4">
                    <InfoRow label="Work Type" value={WORK_TYPE_OPTS.find((o) => o.value === employee.workType)?.label || employee.workType} />
                    <InfoRow label="App Role" value={ROLE_OPTS.find((o) => o.value === employee.appRole)?.label || employee.appRole} />
                  </div>
                  <div className="flex gap-4 items-center">
                    <InfoRow label="Status" value={null}>
                      <Badge variant={employee.status === 'active' ? 'success' : 'warning'}>
                        {(employee.status || '').charAt(0).toUpperCase() + (employee.status || '').slice(1)}
                      </Badge>
                    </InfoRow>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Full Name" value={form.name} onChange={f('name')} />
                    <Input label="Email" type="email" value={form.email} onChange={f('email')} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Phone" value={form.phone} onChange={f('phone')} />
                    <Input label="Salary (₹)" type="number" value={form.salary} onChange={f('salary')} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Select label="Department" value={form.department} onChange={f('department')}
                      options={DEPARTMENTS.map((d) => ({ value: d, label: d }))} />
                    <Input label="Designation" value={form.designation} onChange={f('designation')} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Select label="Work Type" value={form.workType} onChange={f('workType')} options={WORK_TYPE_OPTS} />
                    <Select label="App Role" value={form.appRole} onChange={f('appRole')} options={ROLE_OPTS} />
                  </div>
                  <Select label="Status" value={form.status} onChange={f('status')}
                    options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
                </div>
              )}
            </>
          )}

          {tab === 'bank' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500 bg-slate-900/60 rounded px-3 py-2">
                Bank details are used for generating bank payment advice files from Payroll.
              </p>
              {!editing ? (
                <div className="space-y-3">
                  <InfoRow label="Bank Name" value={employee.bankName} />
                  <InfoRow label="Account Number" value={employee.bankAccountNumber} mono />
                  <InfoRow label="IFSC Code" value={employee.bankIfsc} mono />
                  <InfoRow label="Payment Mode" value={employee.paymentMode || 'NEFT'} />
                </div>
              ) : (
                <div className="space-y-3">
                  <Input label="Bank Name" value={form.bankName} onChange={f('bankName')} placeholder="e.g. HDFC Bank" />
                  <Input label="Account Number" value={form.bankAccountNumber} onChange={f('bankAccountNumber')} placeholder="Enter bank account number" />
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="IFSC Code" value={form.bankIfsc} onChange={f('bankIfsc')} placeholder="e.g. HDFC0001234" />
                    <Select label="Payment Mode" value={form.paymentMode} onChange={f('paymentMode')} options={PAYMENT_MODE_OPTS} />
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'custom' && (
            <div className="space-y-3">
              {fields.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">
                  <p>No custom fields defined yet.</p>
                  <p className="text-xs mt-1">Go to Settings → Employee Fields to add custom fields.</p>
                </div>
              ) : (
                fields.map((field) => (
                  <div key={field.field_id}>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      {field.field_name}
                      {field.is_required ? <span className="text-red-400 ml-1">*</span> : null}
                      <span className="text-slate-500 text-xs ml-2">({field.field_type})</span>
                    </label>
                    {field.field_type === 'textarea' ? (
                      <textarea rows={2}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:border-sky-500 focus:outline-none resize-none"
                        value={customValues[field.field_id] || ''}
                        onChange={(e) => setCustomValues((p) => ({ ...p, [field.field_id]: e.target.value }))}
                      />
                    ) : (
                      <input type={field.field_type === 'number' ? 'number' : 'text'}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:border-sky-500 focus:outline-none"
                        value={customValues[field.field_id] || ''}
                        onChange={(e) => setCustomValues((p) => ({ ...p, [field.field_id]: e.target.value }))}
                      />
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-700 flex gap-2 flex-shrink-0">
          {(tab === 'basic' || tab === 'bank') && (
            editing ? (
              <>
                <Button variant="secondary" onClick={() => setEditing(false)} isFullWidth>Cancel</Button>
                <Button variant="primary" icon={Save} onClick={handleSaveBasic} isLoading={saving} isFullWidth>Save</Button>
              </>
            ) : (
              <Button variant="primary" icon={Edit2} onClick={() => setEditing(true)} isFullWidth>
                {tab === 'bank' ? 'Edit Bank Details' : 'Edit Employee'}
              </Button>
            )
          )}
          {tab === 'custom' && fields.length > 0 && (
            <Button variant="primary" icon={Save} onClick={handleSaveCustom} isLoading={savingCustom} isFullWidth>Save Custom Fields</Button>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono, children }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      {children || (
        <p className={`text-sm ${mono ? 'font-mono text-sky-400' : 'text-slate-200'}`}>
          {value || <span className="text-slate-500">—</span>}
        </p>
      )}
    </div>
  );
}
