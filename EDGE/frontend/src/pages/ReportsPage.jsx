/**
 * ReportsPage.jsx - Report Builder & Analytics
 * Features: Generate attendance, payroll, and leave reports
 */

import React, { useState } from 'react';
import { BarChart3, Download, Filter } from 'lucide-react';
import { Button, Card, Table, Badge } from '../components/atomic';
import { mockReports, mockAttendanceReport } from '../utils/mockData';

export const ReportsPage = () => {
  const [reportType, setReportType] = useState('attendance');
  const [month, setMonth] = useState('2026-04');
  const [department, setDepartment] = useState('all');

  const reportTypes = ['attendance', 'payroll', 'leave'];
  const departments = ['all', 'Production', 'HR', 'Finance', 'Admin', 'Maintenance'];

  const handleGenerateReport = () => {
    alert(`Generating ${reportType} report for ${month}...`);
  };

  const handleExport = (format) => {
    alert(`Exporting report as ${format.toUpperCase()}...`);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Reports & Analytics</h1>
          <p className="text-slate-400 mt-1">Generate and analyze business reports</p>
        </div>
      </div>

      {/* Report Builder */}
      <Card>
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-slate-100">Report Builder</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Report Type */}
            <div>
              <label className="text-sm text-slate-400 mb-2 block">Report Type</label>
              <select 
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
              >
                {reportTypes.map(rt => (
                  <option key={rt} value={rt}>
                    {rt.charAt(0).toUpperCase() + rt.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {/* Month */}
            <div>
              <label className="text-sm text-slate-400 mb-2 block">Month</label>
              <input 
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
              />
            </div>

            {/* Department */}
            <div>
              <label className="text-sm text-slate-400 mb-2 block">Department</label>
              <select 
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
              >
                {departments.map(d => (
                  <option key={d} value={d}>{d === 'all' ? 'All' : d}</option>
                ))}
              </select>
            </div>

            {/* Generate Button */}
            <div className="flex items-end">
              <Button variant="primary" isFullWidth onClick={handleGenerateReport}>
                Generate Report
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Export Options */}
      <Card>
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-100">Export Options</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Button 
              icon={Download} 
              variant="secondary" 
              isFullWidth 
              onClick={() => handleExport('excel')}
            >
              Export as Excel
            </Button>
            <Button 
              icon={Download} 
              variant="secondary" 
              isFullWidth 
              onClick={() => handleExport('pdf')}
            >
              Export as PDF
            </Button>
            <Button 
              icon={Download} 
              variant="tertiary" 
              isFullWidth 
              onClick={() => handleExport('csv')}
            >
              Export as CSV
            </Button>
          </div>
        </div>
      </Card>

      {/* Attendance Report */}
      {reportType === 'attendance' && (
        <Card>
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-slate-100">Attendance Report</h2>
              <p className="text-slate-400 text-sm">Attendance summary for April 2026</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
                <p className="text-slate-400 text-sm">Total Days</p>
                <p className="text-2xl font-bold text-slate-100">20</p>
              </div>
              <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
                <p className="text-slate-400 text-sm">Present Days</p>
                <p className="text-2xl font-bold text-green-400">18</p>
              </div>
              <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
                <p className="text-slate-400 text-sm">Absent Days</p>
                <p className="text-2xl font-bold text-red-400">1</p>
              </div>
              <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
                <p className="text-slate-400 text-sm">Avg Attendance</p>
                <p className="text-2xl font-bold text-sky-400">90%</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4 text-slate-400 font-semibold">Employee</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">Department</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">Present</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">Absent</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">Leave</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">%</th>
                  </tr>
                </thead>
                <tbody>
                  {mockAttendanceReport.map((row, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-slate-900/50' : ''}>
                      <td className="py-3 px-4 text-slate-100 font-medium">{row.employee}</td>
                      <td className="py-3 px-4 text-center text-slate-400">{row.dept}</td>
                      <td className="py-3 px-4 text-center text-green-400">{row.present}</td>
                      <td className="py-3 px-4 text-center text-red-400">{row.absent}</td>
                      <td className="py-3 px-4 text-center text-amber-400">{row.leave}</td>
                      <td className="py-3 px-4 text-center font-bold text-sky-400">{row.percentage}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}

      {/* Payroll Report */}
      {reportType === 'payroll' && (
        <Card>
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-100">Payroll Report</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
                <p className="text-slate-400 text-sm">Employees</p>
                <p className="text-2xl font-bold text-slate-100">9</p>
              </div>
              <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
                <p className="text-slate-400 text-sm">Total Amount</p>
                <p className="text-2xl font-bold text-green-400">₹28.5L</p>
              </div>
              <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
                <p className="text-slate-400 text-sm">Average Salary</p>
                <p className="text-2xl font-bold text-sky-400">₹31.6K</p>
              </div>
              <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
                <p className="text-slate-400 text-sm">Status</p>
                <Badge variant="success">Processed</Badge>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Leave Report */}
      {reportType === 'leave' && (
        <Card>
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-100">Leave Report</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
                <p className="text-slate-400 text-sm">Total Requests</p>
                <p className="text-2xl font-bold text-slate-100">5</p>
              </div>
              <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
                <p className="text-slate-400 text-sm">Approved</p>
                <p className="text-2xl font-bold text-green-400">2</p>
              </div>
              <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
                <p className="text-slate-400 text-sm">Pending</p>
                <p className="text-2xl font-bold text-amber-400">2</p>
              </div>
              <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
                <p className="text-slate-400 text-sm">Rejected</p>
                <p className="text-2xl font-bold text-red-400">1</p>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default ReportsPage;
