import React, { useState, useEffect } from 'react';
import { Play, Eye, Download, CheckCircle, Clock, RefreshCw } from 'lucide-react';
import { Button, Card, Badge, Alert, Modal } from '../components/atomic';
import { getPayrollRuns, runPayroll, approvePayrollRun, getPayslips } from '../services/api';

function formatMonth(monthKey) {
  if (!monthKey) return '';
  const [year, month] = monthKey.split('-');
  return new Date(year, parseInt(month) - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

export const PayrollPage = () => {
  const [runs, setRuns] = useState([]);
  const [payslips, setPayslips] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [slipsLoading, setSlipsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSlipModalOpen, setIsSlipModalOpen] = useState(false);
  const [selectedSlip, setSelectedSlip] = useState(null);

  const currentRun = runs.find((r) => r.runId === selectedRunId) || runs[0] || null;

  const fetchRuns = () => {
    setLoading(true);
    getPayrollRuns()
      .then((res) => {
        const data = res.data || [];
        setRuns(data);
        if (data.length > 0 && !selectedRunId) setSelectedRunId(data[0].runId);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  const fetchPayslips = (monthKey) => {
    if (!monthKey) return;
    setSlipsLoading(true);
    getPayslips(monthKey)
      .then((res) => setPayslips(res.data || []))
      .catch(() => setPayslips([]))
      .finally(() => setSlipsLoading(false));
  };

  useEffect(() => { fetchRuns(); }, []);

  useEffect(() => {
    if (currentRun?.monthKey) fetchPayslips(currentRun.monthKey);
  }, [currentRun?.monthKey]);

  const handleRunPayroll = async () => {
    const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
    setIsProcessing(true);
    setError('');
    try {
      const res = await runPayroll(monthKey);
      setSuccess(`Payroll processed! ${res.data?.totalEmployees || 0} employees.`);
      fetchRuns();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApproveRun = async () => {
    if (!selectedRunId) return;
    setIsApproving(true);
    try {
      await approvePayrollRun(selectedRunId);
      setSuccess('Payroll run approved!');
      fetchRuns();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Payroll Management</h1>
          <p className="text-slate-400 mt-1">Process salaries and manage payslips</p>
        </div>
        <div className="flex gap-2">
          <Button icon={RefreshCw} variant="secondary" onClick={fetchRuns}>Refresh</Button>
          <Button icon={Play} variant="primary" isLoading={isProcessing} onClick={handleRunPayroll}>
            {isProcessing ? 'Processing...' : 'Run Payroll'}
          </Button>
        </div>
      </div>

      {error && <Alert variant="danger" message={error} onClose={() => setError('')} />}
      {success && <Alert variant="success" message={success} onClose={() => setSuccess('')} />}

      {currentRun && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card><div className="space-y-2">
            <p className="text-slate-400 text-sm font-medium">Total Employees</p>
            <p className="text-3xl font-bold text-sky-400">{currentRun.totalEmployees}</p>
          </div></Card>
          <Card><div className="space-y-2">
            <p className="text-slate-400 text-sm font-medium">Total Payroll</p>
            <p className="text-3xl font-bold text-green-400">₹{(currentRun.totalAmount / 100000).toFixed(1)}L</p>
          </div></Card>
          <Card><div className="space-y-2">
            <p className="text-slate-400 text-sm font-medium">Avg Salary</p>
            <p className="text-3xl font-bold text-purple-400">
              ₹{currentRun.totalEmployees > 0 ? (currentRun.totalAmount / currentRun.totalEmployees / 1000).toFixed(0) : 0}K
            </p>
          </div></Card>
          <Card><div className="space-y-2">
            <p className="text-slate-400 text-sm font-medium">Status</p>
            <div className="flex items-center space-x-2">
              {currentRun.status === 'completed' ? <CheckCircle className="w-6 h-6 text-green-400" /> : <Clock className="w-6 h-6 text-amber-400" />}
              <p className="text-2xl font-bold capitalize text-slate-100">{currentRun.status}</p>
            </div>
          </div></Card>
        </div>
      )}

      {runs.length > 0 && (
        <Card>
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-100">Payroll History</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {runs.map((run) => (
                <button
                  key={run.runId}
                  onClick={() => setSelectedRunId(run.runId)}
                  className={`p-4 rounded-lg border transition-all text-left ${
                    selectedRunId === run.runId
                      ? 'border-sky-500 bg-sky-500/10'
                      : 'border-slate-700 bg-slate-900 hover:border-slate-600'
                  }`}
                >
                  <p className="font-semibold text-slate-100">{run.monthLabel || formatMonth(run.monthKey)}</p>
                  <p className="text-sm text-slate-400">₹{(run.totalAmount / 100000).toFixed(1)}L</p>
                  <Badge variant={run.status === 'completed' ? 'success' : 'warning'} className="mt-2">
                    {run.status}
                  </Badge>
                </button>
              ))}
            </div>

            {currentRun?.status === 'processing' && (
              <Button variant="primary" onClick={handleApproveRun} isLoading={isApproving}>
                Approve This Run
              </Button>
            )}
          </div>
        </Card>
      )}

      <Card>
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-slate-100">Payslips</h2>
          <p className="text-slate-400 text-sm">
            {currentRun ? `Payslips for ${currentRun.monthLabel || formatMonth(currentRun.monthKey)}` : 'Select a payroll run'}
          </p>

          {slipsLoading ? (
            <div className="py-6 text-center text-slate-400">Loading payslips...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4 text-slate-400 font-semibold">Employee</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">Basic</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">Gross</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">Deductions</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">Net Salary</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payslips.length > 0 ? (
                    payslips.map((slip, idx) => {
                      const totalDeductions = Object.values(slip.deductions || {}).reduce((a, b) => a + b, 0);
                      return (
                        <tr key={slip.payslipId} className={idx % 2 === 0 ? 'bg-slate-900/50' : ''}>
                          <td className="py-3 px-4 text-slate-100 font-medium">{slip.employeeName}</td>
                          <td className="py-3 px-4 text-center text-slate-300">₹{Number(slip.basicSalary).toLocaleString()}</td>
                          <td className="py-3 px-4 text-center text-slate-300">₹{Number(slip.gross).toLocaleString()}</td>
                          <td className="py-3 px-4 text-center text-red-400">₹{totalDeductions.toLocaleString()}</td>
                          <td className="py-3 px-4 text-center text-green-400 font-bold">₹{Number(slip.netSalary).toLocaleString()}</td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => { setSelectedSlip(slip); setIsSlipModalOpen(true); }}
                              className="p-1 hover:bg-slate-700 rounded transition-colors text-blue-400"
                              title="View Payslip"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="6" className="py-8 text-center text-slate-400">
                        {loading ? 'Loading...' : 'No payslips for this period. Run payroll first.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <Modal isOpen={isSlipModalOpen} onClose={() => setIsSlipModalOpen(false)} title="Payslip Details" size="2xl">
        {selectedSlip && (
          <div className="space-y-6">
            <div className="border-b border-slate-700 pb-4">
              <p className="text-2xl font-bold text-slate-100">{selectedSlip.employeeName}</p>
              <p className="text-slate-400">{selectedSlip.month}</p>
            </div>
            <div>
              <h3 className="text-lg font-bold text-green-400 mb-3">Earnings</h3>
              <div className="space-y-2 bg-slate-900 p-4 rounded-lg">
                {Object.entries(selectedSlip.earnings || {}).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-slate-300">
                    <span className="capitalize">{k}:</span><span>₹{Number(v).toLocaleString()}</span>
                  </div>
                ))}
                <div className="border-t border-slate-700 pt-2 font-bold text-sky-400 flex justify-between">
                  <span>Gross:</span><span>₹{Number(selectedSlip.gross).toLocaleString()}</span>
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-lg font-bold text-red-400 mb-3">Deductions</h3>
              <div className="space-y-2 bg-slate-900 p-4 rounded-lg">
                {Object.entries(selectedSlip.deductions || {}).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-slate-300">
                    <span className="capitalize">{k}:</span><span>₹{Number(v).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-gradient-to-r from-green-900/20 to-green-800/20 border border-green-700 p-4 rounded-lg">
              <p className="text-slate-400 text-sm mb-2">Net Salary (Payable)</p>
              <p className="text-3xl font-bold text-green-400">₹{Number(selectedSlip.netSalary).toLocaleString()}</p>
              {selectedSlip.bankAccount && <p className="text-slate-400 text-sm mt-2">Account: {selectedSlip.bankAccount}</p>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default PayrollPage;
