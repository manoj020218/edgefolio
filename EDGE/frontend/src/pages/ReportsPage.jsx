import React, { useState } from 'react';
import { BarChart3, Download } from 'lucide-react';
import { Button, Card, Badge, Alert } from '../components/atomic';
import { getAttendanceReport, getSalaryReport, getPaymentBatches, getPaymentBatch } from '../services/api';

const DEPARTMENTS = ['all', 'Production', 'HR', 'Finance', 'Admin', 'Maintenance'];

function csvEscapeRpt(v) {
  const s = String(v ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCSV(rows, headers, filename) {
  const content = [headers.map(csvEscapeRpt).join(','), ...rows.map((r) => r.map(csvEscapeRpt).join(','))].join('\n');
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export const ReportsPage = () => {
  const [reportType, setReportType] = useState('attendance');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [department, setDepartment] = useState('all');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paymentBatches, setPaymentBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [paymentReport, setPaymentReport] = useState(null);

  const handleGenerateReport = async () => {
    setLoading(true);
    setError('');
    setReportData(null);
    setPaymentReport(null);
    try {
      const params = { department: department !== 'all' ? department : undefined };
      if (reportType === 'attendance') {
        const [year, mon] = month.split('-');
        const from = `${year}-${mon}-01`;
        const lastDay = new Date(year, parseInt(mon), 0).getDate();
        const to = `${year}-${mon}-${String(lastDay).padStart(2, '0')}`;
        const res = await getAttendanceReport({ ...params, from, to });
        setReportData(res?.data ?? null);
      } else if (reportType === 'payroll') {
        const res = await getSalaryReport({ ...params, month });
        setReportData(res?.data ?? null);
      } else if (reportType === 'payment') {
        const batchesRes = await getPaymentBatches();
        const batches = batchesRes?.data || [];
        setPaymentBatches(batches);
        if (selectedBatchId) {
          const batchRes = await getPaymentBatch(selectedBatchId);
          setPaymentReport(batchRes?.data || null);
        } else {
          setPaymentReport({ batches });
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPaymentCSV = (records, batchLabel) => {
    const headers = ['Emp Code', 'Employee Name', 'Bank Name', 'Account Number', 'IFSC', 'Amount', 'Mode', 'Status', 'Txn ID', 'Payment Date', 'Error Reason'];
    const rows = records.map((r) => [r.empCode || '', r.employeeName, r.bankName || '', r.accountNumber || '', r.ifsc || '', r.amount, r.mode, r.status, r.bankTransactionId || '', r.paymentDate || '', r.errorReason || '']);
    downloadCSV(rows, headers, `payment_report_${batchLabel}.csv`);
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
                onChange={(e) => { setReportType(e.target.value); setReportData(null); setPaymentReport(null); }}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
              >
                <option value="attendance">Attendance</option>
                <option value="payroll">Payroll / Salary</option>
                <option value="payment">Bank Payment Status</option>
              </select>
            </div>
            {reportType !== 'payment' && (
              <div>
                <label className="text-sm text-slate-400 mb-2 block">Month</label>
                <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100" />
              </div>
            )}
            {reportType === 'payment' && (
              <div>
                <label className="text-sm text-slate-400 mb-2 block">Payment Batch (optional)</label>
                <select value={selectedBatchId} onChange={(e) => setSelectedBatchId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm">
                  <option value="">— All batches —</option>
                  {paymentBatches.map((b) => <option key={b.batchId} value={b.batchId}>{b.monthLabel} ({b.status})</option>)}
                </select>
              </div>
            )}
            {reportType !== 'payment' && (
              <div>
                <label className="text-sm text-slate-400 mb-2 block">Department</label>
                <select value={department} onChange={(e) => setDepartment(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100">
                  {DEPARTMENTS.map((d) => <option key={d} value={d}>{d === 'all' ? 'All' : d}</option>)}
                </select>
              </div>
            )}
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

      {/* Payment Report — batch list */}
      {reportType === 'payment' && paymentReport && !paymentReport.batch && paymentReport.batches && (
        <Card>
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-100">Bank Payment Batches</h2>
            {paymentReport.batches.length === 0 ? (
              <p className="text-slate-400 text-sm py-4">No payment batches found. Use Payroll → Bank Payment to create one.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-3 px-4 text-slate-400 font-semibold">Month</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-semibold">Bank Template</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-semibold">Employees</th>
                      <th className="text-right py-3 px-4 text-slate-400 font-semibold">Total Amount</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-semibold">Paid</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-semibold">Failed</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentReport.batches.map((b, i) => (
                      <tr key={b.batchId} className={i % 2 === 0 ? 'bg-slate-900/50' : ''}>
                        <td className="py-3 px-4 text-slate-100 font-medium">{b.monthLabel}</td>
                        <td className="py-3 px-4 text-slate-400">{b.templateName || '—'} {b.bankName ? `(${b.bankName})` : ''}</td>
                        <td className="py-3 px-4 text-center text-slate-300">{b.totalEmployees}</td>
                        <td className="py-3 px-4 text-right text-green-400 font-bold">₹{Number(b.totalAmount).toLocaleString()}</td>
                        <td className="py-3 px-4 text-center text-green-400">{b.paidCount}</td>
                        <td className="py-3 px-4 text-center text-red-400">{b.failedCount}</td>
                        <td className="py-3 px-4 text-center">
                          <Badge variant={b.status === 'ready' ? 'warning' : b.status === 'completed' ? 'success' : 'default'}>{b.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Payment Report — single batch detail */}
      {reportType === 'payment' && paymentReport && paymentReport.batch && (
        <Card>
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold text-slate-100">{paymentReport.batch.monthLabel} — Payment Report</h2>
                <p className="text-slate-400 text-sm mt-1">{paymentReport.batch.templateName || 'No template'} · {paymentReport.records?.length || 0} employees</p>
              </div>
              <Button icon={Download} variant="secondary" size="sm"
                onClick={() => handleDownloadPaymentCSV(paymentReport.records || [], paymentReport.batch.monthKey)}>
                Download CSV
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Total Amount', value: `₹${Number(paymentReport.batch.totalAmount).toLocaleString()}`, cls: 'text-green-400' },
                { label: 'Employees', value: paymentReport.batch.totalEmployees, cls: 'text-sky-400' },
                { label: 'Paid', value: paymentReport.batch.paidCount, cls: 'text-green-400' },
                { label: 'Failed / Pending', value: `${paymentReport.batch.failedCount} / ${(paymentReport.batch.totalEmployees - paymentReport.batch.paidCount - paymentReport.batch.failedCount)}`, cls: 'text-amber-400' },
              ].map((s) => (
                <div key={s.label} className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-center">
                  <p className="text-slate-400 text-xs mb-1">{s.label}</p>
                  <p className={`text-xl font-bold ${s.cls}`}>{s.value}</p>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4 text-slate-400 font-semibold">Emp Code</th>
                    <th className="text-left py-3 px-4 text-slate-400 font-semibold">Name</th>
                    <th className="text-left py-3 px-4 text-slate-400 font-semibold">Account No</th>
                    <th className="text-right py-3 px-4 text-slate-400 font-semibold">Amount</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">Mode</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">Status</th>
                    <th className="text-left py-3 px-4 text-slate-400 font-semibold">Txn ID</th>
                    <th className="text-left py-3 px-4 text-slate-400 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(paymentReport.records || []).map((r, i) => (
                    <tr key={r.recordId} className={i % 2 === 0 ? 'bg-slate-900/50' : ''}>
                      <td className="py-3 px-4 font-mono text-slate-400 text-xs">{r.empCode || '—'}</td>
                      <td className="py-3 px-4 text-slate-100">{r.employeeName}</td>
                      <td className="py-3 px-4 font-mono text-slate-300 text-xs">{r.accountNumber || '—'}</td>
                      <td className="py-3 px-4 text-right text-green-400 font-bold">₹{Number(r.amount).toLocaleString()}</td>
                      <td className="py-3 px-4 text-center text-slate-300">{r.mode}</td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant={r.status === 'paid' ? 'success' : r.status === 'failed' ? 'danger' : 'warning'}>{r.status}</Badge>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-400 text-xs">{r.bankTransactionId || '—'}</td>
                      <td className="py-3 px-4 text-slate-400 text-xs">{r.paymentDate || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}

      {!reportData && !paymentReport && !loading && (
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
