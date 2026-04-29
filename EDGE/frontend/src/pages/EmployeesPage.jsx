import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Upload, Search, RefreshCw } from 'lucide-react';
import { Button, Card, Badge, Alert, Modal, Input, Select } from '../components/atomic';
import { getEmployees, createEmployee, updateEmployee, deleteEmployee } from '../services/api';

const DEPARTMENTS = ['HR', 'Production', 'Finance', 'Admin', 'Maintenance', 'Sales'];

export const EmployeesPage = () => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDept, setFilterDept] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', department: '', designation: '', salary: '', status: 'active',
  });

  const fetchEmployees = () => {
    setLoading(true);
    getEmployees()
      .then((res) => setEmployees(res.data || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchEmployees(); }, []);

  const filteredEmployees = employees.filter((emp) => {
    const matchSearch =
      emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (emp.email || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchDept = filterDept === 'all' || emp.department === filterDept;
    return matchSearch && matchDept;
  });

  const handleOpenForm = (employee = null) => {
    if (employee) {
      setEditingId(employee.id);
      setFormData({
        name: employee.name || '',
        email: employee.email || '',
        phone: employee.phone || '',
        department: employee.department || '',
        designation: employee.designation || '',
        salary: employee.salary || '',
        status: employee.status || 'active',
      });
    } else {
      setEditingId(null);
      setFormData({ name: '', email: '', phone: '', department: '', designation: '', salary: '', status: 'active' });
    }
    setIsModalOpen(true);
  };

  const handleSaveEmployee = async () => {
    if (!formData.name || !formData.department || !formData.salary) {
      setError('Name, department and salary are required');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...formData, salary: Number(formData.salary) };
      if (editingId) {
        await updateEmployee(editingId, payload);
      } else {
        await createEmployee(payload);
      }
      setIsModalOpen(false);
      fetchEmployees();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEmployee = async (id) => {
    if (!window.confirm('Delete this employee? This cannot be undone.')) return;
    try {
      await deleteEmployee(id);
      fetchEmployees();
    } catch (err) {
      setError(err.message);
    }
  };

  const avgSalary = employees.length > 0
    ? employees.reduce((s, e) => s + Number(e.salary || 0), 0) / employees.length
    : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Employee Directory</h1>
          <p className="text-slate-400 mt-1">Manage employee records, create and update details</p>
        </div>
        <div className="flex gap-2">
          <Button icon={RefreshCw} variant="secondary" onClick={fetchEmployees}>Refresh</Button>
          <Button icon={Plus} variant="primary" onClick={() => handleOpenForm()}>Add Employee</Button>
        </div>
      </div>

      {error && <Alert variant="danger" message={error} onClose={() => setError('')} />}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><div className="space-y-2">
          <p className="text-slate-400 text-sm font-medium">Total Employees</p>
          <p className="text-3xl font-bold text-sky-400">{employees.length}</p>
        </div></Card>
        <Card><div className="space-y-2">
          <p className="text-slate-400 text-sm font-medium">Active</p>
          <p className="text-3xl font-bold text-green-400">{employees.filter(e => e.status === 'active').length}</p>
        </div></Card>
        <Card><div className="space-y-2">
          <p className="text-slate-400 text-sm font-medium">Departments</p>
          <p className="text-3xl font-bold text-purple-400">{DEPARTMENTS.length}</p>
        </div></Card>
        <Card><div className="space-y-2">
          <p className="text-slate-400 text-sm font-medium">Avg Salary</p>
          <p className="text-3xl font-bold text-amber-400">₹{(avgSalary / 1000).toFixed(0)}K</p>
        </div></Card>
      </div>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-slate-100 text-sm focus:border-sky-500 focus:outline-none"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            options={[{ value: 'all', label: 'All Departments' }, ...DEPARTMENTS.map(d => ({ value: d, label: d }))]}
          />
          <Button variant="secondary" isFullWidth onClick={() => { setSearchTerm(''); setFilterDept('all'); }}>
            Reset Filters
          </Button>
        </div>
      </Card>

      <Card>
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold text-slate-100">Employee List</h2>
            <p className="text-slate-400 text-sm">Showing {filteredEmployees.length} of {employees.length} employees</p>
          </div>

          {loading ? (
            <div className="py-8 text-center text-slate-400">Loading employees...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4 text-slate-400 font-semibold">Name</th>
                    <th className="text-left py-3 px-4 text-slate-400 font-semibold">Email</th>
                    <th className="text-left py-3 px-4 text-slate-400 font-semibold">Department</th>
                    <th className="text-left py-3 px-4 text-slate-400 font-semibold">Designation</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">Salary</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">Status</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.length > 0 ? (
                    filteredEmployees.map((emp, idx) => (
                      <tr key={emp.id} className={idx % 2 === 0 ? 'bg-slate-900/50' : ''}>
                        <td className="py-3 px-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-sky-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                              {emp.avatar || emp.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </div>
                            <span className="text-slate-100 font-medium">{emp.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-400">{emp.email}</td>
                        <td className="py-3 px-4 text-slate-300">{emp.department}</td>
                        <td className="py-3 px-4 text-slate-300">{emp.designation}</td>
                        <td className="py-3 px-4 text-center text-slate-300 font-medium">
                          ₹{Number(emp.salary).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Badge variant={emp.status === 'active' ? 'success' : 'warning'}>
                            {(emp.status || '').charAt(0).toUpperCase() + (emp.status || '').slice(1)}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex justify-center gap-2">
                            <button onClick={() => handleOpenForm(emp)} className="p-1 hover:bg-slate-700 rounded transition-colors text-blue-400">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDeleteEmployee(emp.id)} className="p-1 hover:bg-slate-700 rounded transition-colors text-red-400">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="7" className="py-8 text-center text-slate-400">No employees found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? 'Edit Employee' : 'Add New Employee'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Full Name" placeholder="John Doe" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
            <Input label="Email" type="email" placeholder="john@example.com" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Phone" placeholder="+91-98765-43210" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
            <Input label="Salary" type="number" placeholder="30000" value={formData.salary} onChange={(e) => setFormData({ ...formData, salary: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Department" value={formData.department} onChange={(e) => setFormData({ ...formData, department: e.target.value })} options={DEPARTMENTS.map(d => ({ value: d, label: d }))} />
            <Select label="Status" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
          </div>
          <Input label="Designation" placeholder="Senior Manager" value={formData.designation} onChange={(e) => setFormData({ ...formData, designation: e.target.value })} />
        </div>
        <div className="flex gap-2 mt-6">
          <Button variant="secondary" onClick={() => setIsModalOpen(false)} isFullWidth>Cancel</Button>
          <Button variant="primary" onClick={handleSaveEmployee} isLoading={saving} isFullWidth>
            {editingId ? 'Update' : 'Create'} Employee
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default EmployeesPage;
