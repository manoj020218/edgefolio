/**
 * LeaveManagementPage.jsx - Leave Request Management
 * Features: Request leaves, view balance, approve requests
 */

import React, { useState } from 'react';
import { Plus, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Button, Card, Table, Badge, Alert, Modal, Input, Select } from '../components/atomic';
import { mockLeaves, mockLeaveBalance, mockEmployees } from '../utils/mockData';

export const LeaveManagementPage = () => {
  const [leaves, setLeaves] = useState(mockLeaves);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    employeeId: '',
    leaveType: 'casual',
    fromDate: '',
    toDate: '',
    reason: ''
  });

  const leaveTypes = ['casual', 'sick', 'annual', 'unpaid'];
  const employees = mockEmployees;

  // Calculate days between dates
  const calculateDays = (from, to) => {
    if (!from || !to) return 0;
    const start = new Date(from);
    const end = new Date(to);
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  };

  const handleRequestLeave = () => {
    if (!formData.employeeId || !formData.fromDate || !formData.toDate) {
      alert('Please fill all fields');
      return;
    }

    const employee = employees.find(e => e.id === formData.employeeId);
    const newLeave = {
      leaveId: `LEAVE-${leaves.length + 1}`,
      employeeId: formData.employeeId,
      employeeName: employee?.name || 'Unknown',
      leaveType: formData.leaveType,
      fromDate: formData.fromDate,
      toDate: formData.toDate,
      days: calculateDays(formData.fromDate, formData.toDate),
      reason: formData.reason,
      status: 'pending',
      requestDate: new Date().toISOString().split('T')[0],
      approvedBy: null
    };

    setLeaves([...leaves, newLeave]);
    setIsModalOpen(false);
    setFormData({
      employeeId: '',
      leaveType: 'casual',
      fromDate: '',
      toDate: '',
      reason: ''
    });
  };

  const handleApproveLeave = (leaveId) => {
    setLeaves(leaves.map(leave => 
      leave.leaveId === leaveId 
        ? { ...leave, status: 'approved', approvedBy: 'Admin' }
        : leave
    ));
  };

  const handleRejectLeave = (leaveId) => {
    setLeaves(leaves.map(leave => 
      leave.leaveId === leaveId 
        ? { ...leave, status: 'rejected', approvedBy: 'Admin' }
        : leave
    ));
  };

  const stats = {
    total: leaves.length,
    pending: leaves.filter(l => l.status === 'pending').length,
    approved: leaves.filter(l => l.status === 'approved').length,
    rejected: leaves.filter(l => l.status === 'rejected').length
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Leave Management</h1>
          <p className="text-slate-400 mt-1">Request and manage employee leaves</p>
        </div>
        <Button icon={Plus} variant="primary" onClick={() => setIsModalOpen(true)}>
          Request Leave
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="space-y-2">
            <p className="text-slate-400 text-sm font-medium">Total Requests</p>
            <p className="text-3xl font-bold text-sky-400">{stats.total}</p>
          </div>
        </Card>

        <Card>
          <div className="space-y-2">
            <p className="text-slate-400 text-sm font-medium">Pending</p>
            <p className="text-3xl font-bold text-amber-400">{stats.pending}</p>
          </div>
        </Card>

        <Card>
          <div className="space-y-2">
            <p className="text-slate-400 text-sm font-medium">Approved</p>
            <p className="text-3xl font-bold text-green-400">{stats.approved}</p>
          </div>
        </Card>

        <Card>
          <div className="space-y-2">
            <p className="text-slate-400 text-sm font-medium">Rejected</p>
            <p className="text-3xl font-bold text-red-400">{stats.rejected}</p>
          </div>
        </Card>
      </div>

      {/* Leave Requests */}
      <Card>
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold text-slate-100">Leave Requests</h2>
            <p className="text-slate-400 text-sm">All leave requests and approvals</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4 text-slate-400 font-semibold">Employee</th>
                  <th className="text-center py-3 px-4 text-slate-400 font-semibold">Type</th>
                  <th className="text-center py-3 px-4 text-slate-400 font-semibold">From Date</th>
                  <th className="text-center py-3 px-4 text-slate-400 font-semibold">To Date</th>
                  <th className="text-center py-3 px-4 text-slate-400 font-semibold">Days</th>
                  <th className="text-center py-3 px-4 text-slate-400 font-semibold">Status</th>
                  <th className="text-center py-3 px-4 text-slate-400 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {leaves.map((leave, idx) => (
                  <tr key={leave.leaveId} className={idx % 2 === 0 ? 'bg-slate-900/50' : ''}>
                    <td className="py-3 px-4 text-slate-100 font-medium">{leave.employeeName}</td>
                    <td className="py-3 px-4 text-center">
                      <Badge variant="info">{leave.leaveType}</Badge>
                    </td>
                    <td className="py-3 px-4 text-center text-slate-400">{leave.fromDate}</td>
                    <td className="py-3 px-4 text-center text-slate-400">{leave.toDate}</td>
                    <td className="py-3 px-4 text-center text-slate-300 font-medium">{leave.days}</td>
                    <td className="py-3 px-4 text-center">
                      <Badge variant={
                        leave.status === 'approved' ? 'success' :
                        leave.status === 'rejected' ? 'danger' :
                        'warning'
                      }>
                        {leave.status.charAt(0).toUpperCase() + leave.status.slice(1)}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {leave.status === 'pending' && (
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => handleApproveLeave(leave.leaveId)}
                            className="p-1 hover:bg-slate-700 rounded transition-colors text-green-400"
                            title="Approve"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleRejectLeave(leave.leaveId)}
                            className="p-1 hover:bg-slate-700 rounded transition-colors text-red-400"
                            title="Reject"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* Leave Balance */}
      <Card>
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-slate-100">Leave Balance</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {employees.slice(0, 6).map(emp => {
              const balance = mockLeaveBalance[emp.id];
              const total = Object.values(balance).reduce((a, b) => a + b, 0);
              return (
                <div key={emp.id} className="bg-slate-900 p-4 rounded-lg border border-slate-700">
                  <p className="font-semibold text-slate-100 mb-3">{emp.name}</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Annual:</span>
                      <span className="text-slate-200">{balance.annual} days</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Sick:</span>
                      <span className="text-slate-200">{balance.sick} days</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Casual:</span>
                      <span className="text-slate-200">{balance.casual} days</span>
                    </div>
                    <div className="border-t border-slate-700 pt-2 flex justify-between font-semibold">
                      <span className="text-slate-300">Total:</span>
                      <span className="text-sky-400">{total} days</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Leave Request Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Request Leave"
        size="lg"
      >
        <div className="space-y-4">
          <Select
            label="Employee"
            value={formData.employeeId}
            onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
            options={employees.map(e => ({ value: e.id, label: e.name }))}
          />

          <Select
            label="Leave Type"
            value={formData.leaveType}
            onChange={(e) => setFormData({ ...formData, leaveType: e.target.value })}
            options={leaveTypes.map(t => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="From Date"
              type="date"
              value={formData.fromDate}
              onChange={(e) => setFormData({ ...formData, fromDate: e.target.value })}
            />
            <Input
              label="To Date"
              type="date"
              value={formData.toDate}
              onChange={(e) => setFormData({ ...formData, toDate: e.target.value })}
            />
          </div>

          {formData.fromDate && formData.toDate && (
            <div className="bg-slate-900 p-3 rounded-lg border border-slate-700">
              <p className="text-slate-400 text-sm">Days:</p>
              <p className="text-2xl font-bold text-sky-400">{calculateDays(formData.fromDate, formData.toDate)} days</p>
            </div>
          )}

          <Input
            label="Reason"
            placeholder="Reason for leave..."
            value={formData.reason}
            onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
          />
        </div>

        <div className="flex gap-2 mt-6">
          <Button variant="secondary" onClick={() => setIsModalOpen(false)} isFullWidth>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleRequestLeave} isFullWidth>
            Request Leave
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default LeaveManagementPage;
