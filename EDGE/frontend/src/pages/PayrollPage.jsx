/**
 * PayrollPage.jsx - Salary Computation & Payslip Generation
 * Features: Run payroll, view payslips, bulk processing
 */

import React, { useState } from 'react';
import { Play, Eye, Download, CheckCircle, Clock } from 'lucide-react';
import { Button, Card, Table, Badge, Alert, Modal } from '../components/atomic';
import { mockPayroll, mockPayslips, mockEmployees } from '../utils/mockData';

export const PayrollPage = () => {
  const [payrolls, setPayrolls] = useState(mockPayroll);
  const [payslips, setPayslips] = useState(mockPayslips);
  const [selectedMonth, setSelectedMonth] = useState('2026-04');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSlipModalOpen, setIsSlipModalOpen] = useState(false);
  const [selectedSlip, setSelectedSlip] = useState(null);

  const currentPayroll = payrolls.find(p => p.runId === `PAY-${selectedMonth}`);
  const monthPayslips = payslips.filter(s => s.month === getMonthName(selectedMonth));

  function getMonthName(monthStr) {
    const [year, month] = monthStr.split('-');
    const date = new Date(year, parseInt(month) - 1);
    return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }

  const handleRunPayroll = async () => {
    setIsProcessing(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Simulate payroll processing
    alert('Payroll processed successfully! 9 employees paid.');
    setIsProcessing(false);
  };

  const handleViewPayslip = (slip) => {
    setSelectedSlip(slip);
    setIsSlipModalOpen(true);
  };

  const handleDownloadPayslip = (slip) => {
    alert(`Downloading payslip for ${slip.employeeName}...`);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Payroll Management</h1>
          <p className="text-slate-400 mt-1">Process salaries and manage payslips</p>
        </div>
        <Button icon={Play} variant="primary" isLoading={isProcessing} onClick={handleRunPayroll}>
          {isProcessing ? 'Processing...' : 'Run Payroll'}
        </Button>
      </div>

      {/* Payroll Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="space-y-2">
            <p className="text-slate-400 text-sm font-medium">Total Employees</p>
            <p className="text-3xl font-bold text-sky-400">{currentPayroll?.totalEmployees || 0}</p>
            <p className="text-xs text-slate-500">To be paid</p>
          </div>
        </Card>

        <Card>
          <div className="space-y-2">
            <p className="text-slate-400 text-sm font-medium">Total Payroll</p>
            <p className="text-3xl font-bold text-green-400">₹{(currentPayroll?.totalAmount / 100000).toFixed(1)}L</p>
            <p className="text-xs text-slate-500">Monthly budget</p>
          </div>
        </Card>

        <Card>
          <div className="space-y-2">
            <p className="text-slate-400 text-sm font-medium">Avg Salary</p>
            <p className="text-3xl font-bold text-purple-400">₹{(currentPayroll?.totalAmount / currentPayroll?.totalEmployees / 1000).toFixed(0)}K</p>
            <p className="text-xs text-slate-500">Per employee</p>
          </div>
        </Card>

        <Card>
          <div className="space-y-2">
            <p className="text-slate-400 text-sm font-medium">Status</p>
            <div className="flex items-center space-x-2">
              {currentPayroll?.status === 'completed' ? (
                <CheckCircle className="w-6 h-6 text-green-400" />
              ) : (
                <Clock className="w-6 h-6 text-amber-400" />
              )}
              <p className="text-2xl font-bold capitalize">{currentPayroll?.status}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Month & Payroll Selection */}
      <Card>
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-100">Select Payroll Period</h2>
            <p className="text-slate-400 text-sm">Choose month to view/process payroll</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {payrolls.map(payroll => (
              <button
                key={payroll.runId}
                onClick={() => setSelectedMonth(payroll.runId.split('-').slice(1).join('-'))}
                className={`p-4 rounded-lg border transition-all ${
                  selectedMonth === payroll.runId.split('-').slice(1).join('-')
                    ? 'border-sky-500 bg-sky-500/10'
                    : 'border-slate-700 bg-slate-900 hover:border-slate-600'
                }`}
              >
                <p className="font-semibold text-slate-100">{payroll.month}</p>
                <p className="text-sm text-slate-400">₹{(payroll.totalAmount / 100000).toFixed(1)}L</p>
                <Badge variant={payroll.status === 'completed' ? 'success' : 'warning'} className="mt-2">
                  {payroll.status.charAt(0).toUpperCase() + payroll.status.slice(1)}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Payroll Summary */}
      {currentPayroll && (
        <Card className="bg-gradient-to-r from-slate-800 to-slate-700">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-slate-400 text-sm">Month</p>
              <p className="text-lg font-bold text-slate-100">{currentPayroll.month}</p>
            </div>
            <div>
              <p className="text-slate-400 text-sm">Employees</p>
              <p className="text-lg font-bold text-slate-100">{currentPayroll.totalEmployees}</p>
            </div>
            <div>
              <p className="text-slate-400 text-sm">Processed</p>
              <p className="text-lg font-bold text-green-400">{currentPayroll.processed}</p>
            </div>
            <div>
              <p className="text-slate-400 text-sm">Total Amount</p>
              <p className="text-lg font-bold text-sky-400">₹{(currentPayroll.totalAmount / 100000).toFixed(1)}L</p>
            </div>
          </div>
        </Card>
      )}

      {/* Payslips Table */}
      <Card>
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold text-slate-100">Payslips</h2>
            <p className="text-slate-400 text-sm">View and download payslips for {getMonthName(selectedMonth)}</p>
          </div>

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
                {monthPayslips.length > 0 ? (
                  monthPayslips.map((slip, idx) => {
                    const totalDeductions = Object.values(slip.deductions).reduce((a, b) => a + b, 0);
                    return (
                      <tr key={slip.payslipId} className={idx % 2 === 0 ? 'bg-slate-900/50' : ''}>
                        <td className="py-3 px-4 text-slate-100 font-medium">{slip.employeeName}</td>
                        <td className="py-3 px-4 text-center text-slate-300">₹{slip.basicSalary.toLocaleString()}</td>
                        <td className="py-3 px-4 text-center text-slate-300">₹{slip.gross.toLocaleString()}</td>
                        <td className="py-3 px-4 text-center text-red-400">₹{totalDeductions.toLocaleString()}</td>
                        <td className="py-3 px-4 text-center text-green-400 font-bold">₹{slip.netSalary.toLocaleString()}</td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => handleViewPayslip(slip)}
                              className="p-1 hover:bg-slate-700 rounded transition-colors text-blue-400"
                              title="View Payslip"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDownloadPayslip(slip)}
                              className="p-1 hover:bg-slate-700 rounded transition-colors text-green-400"
                              title="Download"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-slate-400">
                      No payslips generated for this period
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* Payslip Details Modal */}
      <Modal
        isOpen={isSlipModalOpen}
        onClose={() => setIsSlipModalOpen(false)}
        title="Payslip Details"
        size="lg"
      >
        {selectedSlip && (
          <div className="space-y-6">
            {/* Employee Info */}
            <div className="border-b border-slate-700 pb-4">
              <p className="text-slate-400 text-xs uppercase font-semibold">Employee Information</p>
              <p className="text-2xl font-bold text-slate-100">{selectedSlip.employeeName}</p>
              <p className="text-slate-400">{selectedSlip.month}</p>
            </div>

            {/* Earnings */}
            <div>
              <h3 className="text-lg font-bold text-green-400 mb-3">Earnings</h3>
              <div className="space-y-2 bg-slate-900 p-4 rounded-lg">
                {Object.entries(selectedSlip.earnings).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-slate-300">
                    <span className="capitalize">{key}:</span>
                    <span>₹{value.toLocaleString()}</span>
                  </div>
                ))}
                <div className="border-t border-slate-700 pt-2 mt-2 font-bold text-sky-400 flex justify-between">
                  <span>Gross Earnings:</span>
                  <span>₹{selectedSlip.gross.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Deductions */}
            <div>
              <h3 className="text-lg font-bold text-red-400 mb-3">Deductions</h3>
              <div className="space-y-2 bg-slate-900 p-4 rounded-lg">
                {Object.entries(selectedSlip.deductions).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-slate-300">
                    <span className="capitalize">{key}:</span>
                    <span>₹{value.toLocaleString()}</span>
                  </div>
                ))}
                <div className="border-t border-slate-700 pt-2 mt-2 font-bold text-red-400 flex justify-between">
                  <span>Total Deductions:</span>
                  <span>₹{Object.values(selectedSlip.deductions).reduce((a, b) => a + b, 0).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Net Salary */}
            <div className="bg-gradient-to-r from-green-900/20 to-green-800/20 border border-green-700 p-4 rounded-lg">
              <p className="text-slate-400 text-sm mb-2">Net Salary (Payable)</p>
              <p className="text-3xl font-bold text-green-400">₹{selectedSlip.netSalary.toLocaleString()}</p>
              <p className="text-slate-400 text-sm mt-2">Account: {selectedSlip.bankAccount}</p>
            </div>

            {/* Download Button */}
            <Button 
              icon={Download} 
              variant="primary" 
              isFullWidth
              onClick={() => handleDownloadPayslip(selectedSlip)}
            >
              Download Payslip
            </Button>
          </div>
        )}
      </Modal>

      {/* Processing Alert */}
      {currentPayroll?.status === 'processing' && (
        <Alert 
          variant="info" 
          title="Processing in Progress"
          message="Payroll for this month is currently being processed. Please check back later."
        />
      )}
    </div>
  );
};

export default PayrollPage;
