/**
 * EmployeesPage.jsx - Employee Management CRUD
 * Features: Create, read, update, delete employees with bulk import
 */

import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Upload, Search } from 'lucide-react';
import { Button, Card, Table, Badge, Alert, Modal, Input, Select } from '../components/atomic';
import { mockEmployees } from '../utils/mockData';

export const EmployeesPage = () => {
  const [employees, setEmployees] = useState(mockEmployees);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDept, setFilterDept] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    department: '',
    designation: '',
    salary: '',
    status: 'active'
  });

  const departments = ['HR', 'Production', 'Finance', 'Admin', 'Maintenance'];

  // Filter employees
  const filteredEmployees = employees.filter(emp => {
    const matchSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        emp.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchDept = filterDept === 'all' || emp.department === filterDept;
    return matchSearch && matchDept;
  });

  // Handle form submission
  const handleSaveEmployee = () => {
    if (editingId) {
      setEmployees(employees.map(emp => 
        emp.id === editingId ? { ...emp, ...formData } : emp
      ));
    } else {
      const newEmployee = {
        id: `EMP-${String(employees.length + 1).padStart(3, '0')}`,
        avatar: formData.name.split(' ').map(n => n[0]).join(''),
        ...formData
      };
      setEmployees([...employees, newEmployee]);
    }
    
    handleCloseModal();
  };

  const handleOpenForm = (employee = null) => {
    if (employee) {
      setEditingId(employee.id);
      setFormData(employee);
    } else {
      setEditingId(null);
      setFormData({
        name: '',
        email: '',
        phone: '',
        department: '',
        designation: '',
        salary: '',
        status: 'active'
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };

  const handleDeleteEmployee = (id) => {
    setEmployees(employees.filter(emp => emp.id !== id));
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Employee Directory</h1>
          <p className="text-slate-400 mt-1">Manage employee records, create and update details</p>
        </div>
        <div className="flex gap-2">
          <Button icon={Upload} variant="secondary">
            Bulk Import
          </Button>
          <Button icon={Plus} variant="primary" onClick={() => handleOpenForm()}>
            Add Employee
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="space-y-2">
            <p className="text-slate-400 text-sm font-medium">Total Employees</p>
            <p className="text-3xl font-bold text-sky-400">{employees.length}</p>
            <p className="text-xs text-slate-500">Active workforce</p>
          </div>
        </Card>

        <Card>
          <div className="space-y-2">
            <p className="text-slate-400 text-sm font-medium">Active</p>
            <p className="text-3xl font-bold text-green-400">{employees.filter(e => e.status === 'active').length}</p>
            <p className="text-xs text-slate-500">Working now</p>
          </div>
        </Card>

        <Card>
          <div className="space-y-2">
            <p className="text-slate-400 text-sm font-medium">Departments</p>
            <p className="text-3xl font-bold text-purple-400">{departments.length}</p>
            <p className="text-xs text-slate-500">Different teams</p>
          </div>
        </Card>

        <Card>
          <div className="space-y-2">
            <p className="text-slate-400 text-sm font-medium">Avg Salary</p>
            <p className="text-3xl font-bold text-amber-400">₹{(employees.reduce((sum, e) => sum + e.salary, 0) / employees.length / 1000).toFixed(0)}K</p>
            <p className="text-xs text-slate-500">Monthly average</p>
          </div>
        </Card>
      </div>

      {/* Search & Filter */}
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            icon={Search}
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          
          <Select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            options={[
              { value: 'all', label: 'All Departments' },
              ...departments.map(d => ({ value: d, label: d }))
            ]}
          />

          <Button variant="secondary" isFullWidth onClick={() => {
            setSearchTerm('');
            setFilterDept('all');
          }}>
            Reset Filters
          </Button>
        </div>
      </Card>

      {/* Employees Table */}
      <Card>
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold text-slate-100">Employee List</h2>
            <p className="text-slate-400 text-sm">Showing {filteredEmployees.length} of {employees.length} employees</p>
          </div>

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
                            {emp.avatar}
                          </div>
                          <span className="text-slate-100 font-medium">{emp.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-400">{emp.email}</td>
                      <td className="py-3 px-4 text-slate-300">{emp.department}</td>
                      <td className="py-3 px-4 text-slate-300">{emp.designation}</td>
                      <td className="py-3 px-4 text-center text-slate-300 font-medium">₹{emp.salary.toLocaleString()}</td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant={emp.status === 'active' ? 'success' : 'warning'}>
                          {emp.status.charAt(0).toUpperCase() + emp.status.slice(1)}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => handleOpenForm(emp)}
                            className="p-1 hover:bg-slate-700 rounded transition-colors text-blue-400"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteEmployee(emp.id)}
                            className="p-1 hover:bg-slate-700 rounded transition-colors text-red-400"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="py-8 text-center text-slate-400">
                      No employees found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* Employee Form Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingId ? 'Edit Employee' : 'Add New Employee'}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Full Name"
              placeholder="John Doe"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
            <Input
              label="Email"
              type="email"
              placeholder="john@example.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Phone"
              placeholder="+91-98765-43210"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
            <Input
              label="Salary"
              type="number"
              placeholder="30000"
              value={formData.salary}
              onChange={(e) => setFormData({ ...formData, salary: Number(e.target.value) })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Department"
              value={formData.department}
              onChange={(e) => setFormData({ ...formData, department: e.target.value })}
              options={departments.map(d => ({ value: d, label: d }))}
            />
            <Select
              label="Status"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' }
              ]}
            />
          </div>

          <Input
            label="Designation"
            placeholder="Senior Manager"
            value={formData.designation}
            onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
          />
        </div>

        <div className="flex gap-2 mt-6">
          <Button variant="secondary" onClick={handleCloseModal} isFullWidth>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSaveEmployee} isFullWidth>
            {editingId ? 'Update' : 'Create'} Employee
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default EmployeesPage;
