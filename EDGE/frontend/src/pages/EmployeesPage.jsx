import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { Button, Card, Badge, Alert, Modal, Input, Select } from '../components/atomic';
import { getEmployees, createEmployee, deleteEmployee } from '../services/api';
import { EmployeeDrawer } from '../components/employees/EmployeeDrawer';

const DEPARTMENTS = ['HR', 'Production', 'Finance', 'Admin', 'Maintenance', 'Sales'];
const WORK_TYPE_OPTS = [
  { value: 'office', label: 'Office' },
  { value: 'field', label: 'Field' },
  { value: 'wfh', label: 'WFH' },
];
const ROLE_OPTS = [
  { value: 'user', label: 'User' },
  { value: 'soft_admin', label: 'Soft Admin' },
];

const ALL_COLS = [
  { key: 'empCode',    label: 'EMP Code',   always: true  },
  { key: 'name',       label: 'Name',        always: true  },
  { key: 'department', label: 'Department',  always: false },
  { key: 'designation',label: 'Designation', always: false },
  { key: 'email',      label: 'Email',       always: false },
  { key: 'phone',      label: 'Phone',       always: false },
  { key: 'workType',   label: 'Work Type',   always: false },
  { key: 'appRole',    label: 'Role',        always: false },
  { key: 'salary',     label: 'Salary',      always: false },
  { key: 'status',     label: 'Status',      always: true  },
  { key: 'actions',    label: 'Actions',     always: true  },
];

const DEFAULT_VISIBLE = new Set(['empCode', 'name', 'department', 'designation', 'salary', 'status', 'actions']);

export const EmployeesPage = () => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDept, setFilterDept] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drawerEmp, setDrawerEmp] = useState(null);
  const [visibleCols, setVisibleCols] = useState(DEFAULT_VISIBLE);
  const [showColPicker, setShowColPicker] = useState(false);
  const colPickerRef = useRef(null);
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', department: '', designation: '',
    salary: '', status: 'active', workType: 'office', appRole: 'user',
  });

  const fetchEmployees = () => {
    setLoading(true);
    getEmployees()
      .then((res) => setEmployees(res.data || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchEmployees(); }, []);

  useEffect(() => {
    const handler = (e) => {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target)) setShowColPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = employees.filter((emp) => {
    const q = searchTerm.toLowerCase();
    const matchSearch = !q ||
      emp.name?.toLowerCase().includes(q) ||
      (emp.empCode || '').toLowerCase().includes(q) ||
      (emp.email || '').toLowerCase().includes(q);
    const matchDept = filterDept === 'all' || emp.department === filterDept;
    return matchSearch && matchDept;
  });

  const handleOpenAdd = () => {
    setFormData({ name: '', email: '', phone: '', department: '', designation: '', salary: '', status: 'active', workType: 'office', appRole: 'user' });
    setIsModalOpen(true);
  };

  const handleCreateEmployee = async () => {
    if (!formData.name || !formData.department || !formData.salary) {
      setError('Name, department and salary are required'); return;
    }
    setSaving(true);
    try {
      await createEmployee({ ...formData, salary: Number(formData.salary) });
      setIsModalOpen(false);
      fetchEmployees();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Delete this employee? This cannot be undone.')) return;
    try { await deleteEmployee(id); fetchEmployees(); }
    catch (err) { setError(err.message); }
  };

  const toggleCol = (key) => {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const visibleColDefs = ALL_COLS.filter((c) => visibleCols.has(c.key));
  const f = (k) => (e) => setFormData((p) => ({ ...p, [k]: e.target.value }));

  const avgSalary = employees.length > 0
    ? employees.reduce((s, e) => s + Number(e.salary || 0), 0) / employees.length
    : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Employee Directory</h1>
          <p className="text-slate-400 mt-1">Manage employee records and custom fields</p>
        </div>
        <div className="flex gap-2">
          <Button icon={RefreshCw} variant="secondary" onClick={fetchEmployees}>Refresh</Button>
          <Button icon={Plus} variant="primary" onClick={handleOpenAdd}>Add Employee</Button>
        </div>
      </div>

      {error && <Alert variant="danger" message={error} onClose={() => setError('')} />}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><div className="space-y-1">
          <p className="text-slate-400 text-sm font-medium">Total</p>
          <p className="text-3xl font-bold text-sky-400">{employees.length}</p>
        </div></Card>
        <Card><div className="space-y-1">
          <p className="text-slate-400 text-sm font-medium">Active</p>
          <p className="text-3xl font-bold text-green-400">{employees.filter((e) => e.status === 'active').length}</p>
        </div></Card>
        <Card><div className="space-y-1">
          <p className="text-slate-400 text-sm font-medium">Departments</p>
          <p className="text-3xl font-bold text-purple-400">{new Set(employees.map((e) => e.department).filter(Boolean)).size}</p>
        </div></Card>
        <Card><div className="space-y-1">
          <p className="text-slate-400 text-sm font-medium">Avg Salary</p>
          <p className="text-3xl font-bold text-amber-400">₹{(avgSalary / 1000).toFixed(0)}K</p>
        </div></Card>
      </div>

      <Card>
        <div className="flex gap-3 flex-wrap items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-slate-100 text-sm focus:border-sky-500 focus:outline-none"
              placeholder="Search name, EMP code, email…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:border-sky-500 focus:outline-none"
          >
            <option value="all">All Departments</option>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <div className="relative" ref={colPickerRef}>
            <button
              onClick={() => setShowColPicker((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 text-sm hover:bg-slate-700 transition-colors"
            >
              <SlidersHorizontal className="w-4 h-4" /> Columns
            </button>
            {showColPicker && (
              <div className="absolute right-0 top-10 z-20 bg-slate-800 border border-slate-700 rounded-xl shadow-xl p-3 space-y-1 min-w-44">
                <p className="text-xs text-slate-400 font-semibold mb-2">Toggle Columns</p>
                {ALL_COLS.filter((c) => !c.always).map((col) => (
                  <label key={col.key} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-white">
                    <input
                      type="checkbox"
                      checked={visibleCols.has(col.key)}
                      onChange={() => toggleCol(col.key)}
                      className="rounded"
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-slate-100">Employee List</h2>
            <p className="text-slate-400 text-sm">Showing {filtered.length} of {employees.length}</p>
          </div>

          {loading ? (
            <div className="py-8 text-center text-slate-400">Loading employees...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    {visibleColDefs.map((col) => (
                      <th key={col.key}
                        className={`py-3 px-4 text-slate-400 font-semibold ${col.key === 'actions' ? 'text-center' : 'text-left'}`}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length > 0 ? (
                    filtered.map((emp, idx) => (
                      <tr
                        key={emp.id}
                        onClick={() => setDrawerEmp(emp)}
                        className={`cursor-pointer hover:bg-slate-700/40 transition-colors ${idx % 2 === 0 ? 'bg-slate-900/50' : ''}`}
                      >
                        {visibleColDefs.map((col) => (
                          <td key={col.key} className="py-3 px-4">
                            {col.key === 'name' && (
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 bg-sky-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                  {emp.name?.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                                </div>
                                <span className="text-slate-100 font-medium">{emp.name}</span>
                              </div>
                            )}
                            {col.key === 'empCode' && (
                              <span className="font-mono text-sky-400 text-xs">{emp.empCode || '—'}</span>
                            )}
                            {col.key === 'department' && <span className="text-slate-300">{emp.department}</span>}
                            {col.key === 'designation' && <span className="text-slate-400">{emp.designation || '—'}</span>}
                            {col.key === 'email' && <span className="text-slate-400">{emp.email || '—'}</span>}
                            {col.key === 'phone' && <span className="text-slate-400">{emp.phone || '—'}</span>}
                            {col.key === 'workType' && (
                              <Badge variant={emp.workType === 'office' ? 'info' : emp.workType === 'field' ? 'warning' : 'default'}>
                                {WORK_TYPE_OPTS.find((o) => o.value === emp.workType)?.label || emp.workType}
                              </Badge>
                            )}
                            {col.key === 'appRole' && (
                              <Badge variant={emp.appRole === 'soft_admin' ? 'warning' : 'default'}>
                                {ROLE_OPTS.find((o) => o.value === emp.appRole)?.label || emp.appRole}
                              </Badge>
                            )}
                            {col.key === 'salary' && (
                              <span className="text-slate-300 font-medium">₹{Number(emp.salary).toLocaleString()}</span>
                            )}
                            {col.key === 'status' && (
                              <Badge variant={emp.status === 'active' ? 'success' : 'warning'}>
                                {(emp.status || '').charAt(0).toUpperCase() + (emp.status || '').slice(1)}
                              </Badge>
                            )}
                            {col.key === 'actions' && (
                              <div className="flex justify-center">
                                <button
                                  onClick={(e) => handleDelete(e, emp.id)}
                                  className="p-1 hover:bg-slate-600 rounded text-red-400 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={visibleColDefs.length} className="py-8 text-center text-slate-400">No employees found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-slate-500">Click any row to view or edit employee details.</p>
        </div>
      </Card>

      {/* Add Employee Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add New Employee" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Full Name *" placeholder="John Doe" value={formData.name} onChange={f('name')} />
            <Input label="Email" type="email" placeholder="john@example.com" value={formData.email} onChange={f('email')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Phone" placeholder="+91-98765-43210" value={formData.phone} onChange={f('phone')} />
            <Input label="Salary (₹) *" type="number" min="0" placeholder="30000" value={formData.salary} onChange={f('salary')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Department *" value={formData.department} onChange={f('department')}
              options={DEPARTMENTS.map((d) => ({ value: d, label: d }))} />
            <Input label="Designation" placeholder="Senior Manager" value={formData.designation} onChange={f('designation')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Work Type" value={formData.workType} onChange={f('workType')} options={WORK_TYPE_OPTS} />
            <Select label="App Role" value={formData.appRole} onChange={f('appRole')} options={ROLE_OPTS} />
          </div>
          <Select label="Status" value={formData.status} onChange={f('status')}
            options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
        </div>
        <div className="flex gap-2 mt-6">
          <Button variant="secondary" onClick={() => setIsModalOpen(false)} isFullWidth>Cancel</Button>
          <Button variant="primary" onClick={handleCreateEmployee} isLoading={saving} isFullWidth>Create Employee</Button>
        </div>
      </Modal>

      {/* Employee Detail Drawer */}
      {drawerEmp && (
        <EmployeeDrawer
          employee={drawerEmp}
          onClose={() => setDrawerEmp(null)}
          onUpdated={() => { fetchEmployees(); setDrawerEmp(null); }}
        />
      )}
    </div>
  );
};

export default EmployeesPage;
