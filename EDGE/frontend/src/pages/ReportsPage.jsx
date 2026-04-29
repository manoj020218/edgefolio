import React, { useState } from 'react';
import { BarChart3, Download } from 'lucide-react';
import { Button, Card, Badge, Alert } from '../components/atomic';
import { getAttendanceReport, getSalaryReport } from '../services/api';

const DEPARTMENTS = ['all', 'Production', 'HR', 'Finance', 'Admin', 'Maintenance'];

export const ReportsPage = () => {
  const [reportType, setReportType] = useState('attendance');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [department, setDepartment] = useState('all');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGenerateReport = async () => {
    setLoading(true);
    setError('');
    setReportData(null);
    try {
      let res;
      const params = {
        department: department !== 'all' ? department : undefined,
      };
      if (reportType === 'attendance') {
        const [year, mon] = month.split('-');
        const from = `${year}-${mon}-01`;
        const lastDay = new Date(year, parseInt(mon), 0).getDate();
        const to = `${year}-${mon}-${String(lastDay).padStart(2, '0')}`;
        res = await getAttendanceReport({ ...params, from, to });
      } else if (reportType === 'payroll') {
        res = await getSalaryReport({ ...params, month });
      }
      setReportData(res?.data ?? null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Reports & Analytics</h1>
          <p className="text-slate-400 mt-1">Generate and analyze business reports</p>
        </div>
      </div>

      {error && <Alert variant="danger" message={error} onClose={() => setError('')} />}

      <Card>
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-slate-100">Report Builder</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm text-slate-400 mb-2 block">Report Type</label>
              <select
                value={reportType}
                onChange={(e) => { setReportType(e.target.value); setReportData(null); }}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
              >
                <option value="attendance">Attendance</option>
                <option value="payroll">Payroll / Salary</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-400 mb-2 block">Month</label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
              />
            </div>
            <div>
              <label className="text-sm text-slate-400 mb-2 block">Department</label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
              >
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d === 'all' ? 'All' : d}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <Button variant="primary" isFullWidth isLoading={loading} onClick={handleGenerateReport}>
                Generate Report
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Attendance Report */}
      {reportType === 'attendance' && reportData && Array.isArray(reportData) && (
        <Card>
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-slate-100">Attendance Report</h2>
              <p className="text-slate-400 text-sm">{reportData.length} records found</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4 text-slate-400 font-semibold">Employee</th>
                    <th className="text-left py-3 px-4 text-slate-400 font-semibold">Department</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">Date</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">Check-In</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">Check-Out</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">Hours</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.slice(0, 50).map((row, idx) => (
                    <tr key={row.eventId || idx} className={idx % 2 === 0 ? 'bg-slate-900/50' : ''}>
                      <td className="py-3 px-4 text-slate-100">{row.employeeName}</td>
                      <td className="py-3 px-4 text-slate-400">{row.department}</td>
                      <td className="py-3 px-4 text-center text-slate-400">{row.date}</td>
                      <td className="py-3 px-4 text-center text-green-400">{row.checkIn || '—'}</td>
                      <td className="py-3 px-4 text-center text-blue-400">{row.checkOut || '—'}</td>
                      <td className="py-3 px-4 text-center text-slate-300">{row.hoursWorked > 0 ? `${Number(row.hoursWorked).toFixed(1)}h` : '—'}</td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant={row.status === 'present' ? 'success' : 'danger'}>{row.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {reportData.length > 50 && <p className="text-xs text-slate-500 mt-2 text-center">Showing 50 of {reportData.length} records</p>}
            </div>
          </div>
        </Card>
      )}

      {/* Payroll Report */}
      {reportType === 'payroll' && reportData && !Array.isArray(reportData) && (
        <Card>
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-100">Salary Report — {reportData.month}</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
                <p className="text-slate-400 text-sm">Employees</p>
                <p className="text-2xl font-bold text-slate-100">{reportData.totalEmployees}</p>
              </div>
              <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
                <p className="text-slate-400 text-sm">Total Gross</p>
                <p className="text-2xl font-bold text-green-400">₹{Number(reportData.totalGross).toLocaleString()}</p>
              </div>
              <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
                <p className="text-slate-400 text-sm">Total Net</p>
                <p className="text-2xl font-bold text-sky-400">₹{Number(reportData.totalNet).toLocaleString()}</p>
              </div>
              <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
                <p className="text-slate-400 text-sm">Avg Net</p>
                <p className="text-2xl font-bold text-purple-400">
                  ₹{reportData.totalEmployees > 0 ? (reportData.totalNet / reportData.totalEmployees).toFixed(0) : 0}
                </p>
              </div>
            </div>

            {reportData.rows && reportData.rows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-3 px-4 text-slate-400 font-semibold">Employee</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-semibold">Basic</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-semibold">Gross</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-semibold">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.rows.map((row, idx) => (
                      <tr key={row.payslipId || idx} className={idx % 2 === 0 ? 'bg-slate-900/50' : ''}>
                        <td className="py-3 px-4 text-slate-100">{row.employeeName}</td>
                        <td className="py-3 px-4 text-center text-slate-300">₹{Number(row.basicSalary).toLocaleString()}</td>
                        <td className="py-3 px-4 text-center text-slate-300">₹{Number(row.gross).toLocaleString()}</td>
                        <td className="py-3 px-4 text-center text-green-400 font-bold">₹{Number(row.netSalary).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      )}

      {!reportData && !loading && (
        <Card>
          <div className="h-48 flex flex-col items-center justify-center">
            <BarChart3 className="w-12 h-12 text-slate-600 mb-3" />
            <p className="text-slate-400">Select report type and click Generate Report</p>
          </div>
        </Card>
      )}
    </div>
  );
};

export default ReportsPage;
