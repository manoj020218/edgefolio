import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Play, Eye, CheckCircle, Clock, RefreshCw,
  Printer, Mail, MessageCircle,
  AlertTriangle, XCircle, CheckSquare, ChevronDown, ChevronUp,
  Landmark, FileDown, Upload, X,
} from 'lucide-react';
import { Button, Card, Badge, Alert, Modal } from '../components/atomic';
import {
  getPayrollRuns, runPayroll, approvePayrollRun, getPayslips,
  getDisputes, resolveDispute,
  getBankTemplates, createPaymentBatch, getPaymentBatch, importBankResponse,
  previewPayrollRun, getPayrollAdjustments, createPayrollAdjustment, deletePayrollAdjustment,
} from '../services/api';

function formatMonth(monthKey) {
  if (!monthKey) return '';
  const [year, month] = monthKey.split('-');
  return new Date(year, parseInt(month) - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

// ─── Payslip print/PDF view ───────────────────────────────────────────────────
function printPayslip(slip, companyName = 'EDGEFOLIO') {
  const earnings = Object.entries(slip.earnings || {});
  const deductions = Object.entries(slip.deductions || {});
  const totalDed = deductions.reduce((s, [, v]) => s + Number(v || 0), 0);

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Payslip – ${slip.employeeName} – ${slip.month}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; color: #222; margin: 24px; }
  h2 { margin: 0 0 2px; font-size: 18px; }
  .sub { color: #555; font-size: 12px; margin-bottom: 12px; }
  .header { border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 12px; }
  .meta { display: flex; gap: 32px; margin-bottom: 16px; font-size: 12px; }
  .meta div { display: flex; flex-direction: column; gap: 2px; }
  .meta strong { font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th { background: #f0f0f0; text-align: left; padding: 5px 8px; font-size: 12px; }
  td { padding: 4px 8px; border-bottom: 1px solid #eee; }
  .total-row td { font-weight: bold; border-top: 2px solid #333; }
  .net { background: #e8f5e9; border-radius: 6px; padding: 10px 16px; margin-top: 8px; font-size: 15px; font-weight: bold; }
  .note { color: #777; font-size: 10px; margin-top: 20px; text-align: center; }
  @media print { body { margin: 0; } }
</style></head><body>
<div class="header">
  <h2>${companyName}</h2>
  <div class="sub">Payslip for ${slip.month}</div>
</div>
<div class="meta">
  <div><span>Employee</span><strong>${slip.employeeName}</strong></div>
  ${slip.empCode ? `<div><span>Emp Code</span><strong>${slip.empCode}</strong></div>` : ''}
  ${slip.employeeEmail ? `<div><span>Email</span><strong>${slip.employeeEmail}</strong></div>` : ''}
  ${slip.bankAccount ? `<div><span>Bank Account</span><strong>${slip.bankAccount}</strong></div>` : ''}
</div>
<table>
  <tr><th colspan="2">Earnings</th></tr>
  ${earnings.map(([k, v]) => `<tr><td>${k}</td><td>₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>`).join('')}
  <tr class="total-row"><td>Gross Earnings</td><td>₹${Number(slip.gross).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
</table>
<table>
  <tr><th colspan="2">Deductions</th></tr>
  ${deductions.map(([k, v]) => `<tr><td>${k}</td><td>₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>`).join('')}
  <tr class="total-row"><td>Total Deductions</td><td>₹${totalDed.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
</table>
<div class="net">Net Salary Payable: ₹${Number(slip.netSalary).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
<div class="note">This is a system-generated payslip. For queries, contact HR.</div>
</body></html>`;

  const win = window.open('', '_blank', 'width=700,height=900');
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

function shareViaWhatsApp(slip) {
  const ded = Object.values(slip.deductions || {}).reduce((s, v) => s + Number(v || 0), 0);
  const text = `*Payslip – ${slip.month}*\nEmployee: ${slip.employeeName}${slip.empCode ? ` (${slip.empCode})` : ''}\nGross: ₹${Number(slip.gross).toLocaleString('en-IN')}\nDeductions: ₹${ded.toLocaleString('en-IN')}\n*Net Salary: ₹${Number(slip.netSalary).toLocaleString('en-IN')}*\n\n_For queries contact HR._`;
  const encoded = encodeURIComponent(text);
  const phone = (slip.employeePhone || '').replace(/\D/g, '');
  const url = phone
    ? `https://wa.me/${phone.startsWith('91') ? phone : '91' + phone}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
  window.open(url, '_blank');
}

function shareViaEmail(slip) {
  const ded = Object.values(slip.deductions || {}).reduce((s, v) => s + Number(v || 0), 0);
  const subject = encodeURIComponent(`Payslip for ${slip.month} – ${slip.employeeName}`);
  const body = encodeURIComponent(
    `Dear ${slip.employeeName},\n\nPlease find your payslip details for ${slip.month}:\n\n` +
    `Gross Earnings: ₹${Number(slip.gross).toLocaleString('en-IN')}\n` +
    `Total Deductions: ₹${ded.toLocaleString('en-IN')}\n` +
    `Net Salary: ₹${Number(slip.netSalary).toLocaleString('en-IN')}\n\n` +
    `For detailed breakdown, please login to the EDGEFOLIO app.\n\nRegards,\nHR Department`
  );
  const to = slip.employeeEmail || '';
  window.open(`mailto:${to}?subject=${subject}&body=${body}`);
}

// ─── Bank Payment helpers ─────────────────────────────────────────────────────
const PAYMENT_FIELD_KEYS = {
  account_name:   (r) => r.accountName || r.employeeName || '',
  account_number: (r) => r.accountNumber || '',
  ifsc:           (r) => r.ifsc || '',
  amount:         (r) => r.amount ?? 0,
  mode:           (r) => r.mode || 'NEFT',
  emp_code:       (r) => r.empCode || '',
  mobile:         (r) => r.employeePhone || '',
  email:          (r) => r.employeeEmail || '',
  purpose_code:   (r) => r.purposeCode || 'SALARY',
  remarks:        (r) => r.remarks || '',
  currency:       (r) => r.currency || 'INR',
};

const DEFAULT_MAPPING = {
  account_name: 'Beneficiary Name', account_number: 'Account Number',
  ifsc: 'IFSC Code', amount: 'Amount', mode: 'Payment Type',
};

function buildExportData(records, fieldMappings) {
  const mapping = Object.keys(fieldMappings || {}).length > 0 ? fieldMappings : DEFAULT_MAPPING;
  const keys = Object.keys(mapping);
  const headers = keys.map((k) => mapping[k] || k);
  const rows = records.map((r) => keys.map((k) => PAYMENT_FIELD_KEYS[k] ? PAYMENT_FIELD_KEYS[k](r) : ''));
  return { keys, headers, rows };
}

function csvEscape(v) {
  const s = String(v ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

function triggerDownload(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function doExport(records, template, format, monthKey) {
  const { headers, rows } = buildExportData(records, template?.fieldMappings);
  const fname = `payment_${monthKey}_${template?.bankName || 'EDGEFOLIO'}`.replace(/\s+/g, '_');
  if (format === 'json') {
    const payer = template ? { name: template.payerName, account: template.payerAccount, ifsc: template.payerIfsc } : {};
    const data = { payer, payments: rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]]))) };
    triggerDownload(JSON.stringify(data, null, 2), `${fname}.json`, 'application/json');
  } else if (format === 'xml') {
    const xmlEsc = (v) => String(v ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
    const hk = (h) => h.replace(/[^a-zA-Z0-9_]/g, '_');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<PaymentAdvice>\n` +
      rows.map((r) => `  <Payment>\n${headers.map((h, i) => `    <${hk(h)}>${xmlEsc(r[i])}</${hk(h)}>`).join('\n')}\n  </Payment>`).join('\n') +
      `\n</PaymentAdvice>`;
    triggerDownload(xml, `${fname}.xml`, 'application/xml');
  } else if (format === 'txt') {
    triggerDownload([headers.join('|'), ...rows.map((r) => r.join('|'))].join('\n'), `${fname}.txt`, 'text/plain');
  } else {
    triggerDownload([headers.map(csvEscape).join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n'), `${fname}.csv`, 'text/csv');
  }
}

function parseCSVText(text) {
  const lines = text.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return null;
  const parseRow = (line) => {
    const result = []; let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else { inQ = !inQ; } }
      else if (line[i] === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
      else { cur += line[i]; }
    }
    result.push(cur.trim());
    return result;
  };
  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(parseRow);
  return { headers, rows };
}

// ─── PayrollPage ──────────────────────────────────────────────────────────────
export const PayrollPage = () => {
  const [runs, setRuns]               = useState([]);
  const [payslips, setPayslips]       = useState([]);
  const [disputes, setDisputes]       = useState([]);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [slipsLoading, setSlipsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState('');
  const [isSlipModalOpen, setIsSlipModalOpen] = useState(false);
  const [selectedSlip, setSelectedSlip] = useState(null);
  const [showDisputes, setShowDisputes] = useState(false);

  // Run Payroll modal state — was previously always "today's month" with no
  // way to choose, which is wrong for the normal real-world workflow (run
  // payroll for the month that JUST ENDED, at the start of the next month —
  // e.g. running this on Sep 3 should default to processing August, not the
  // three days of September that have happened so far).
  const lastMonthKey = (() => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  })();
  const thisMonthKey = new Date().toISOString().slice(0, 7);
  // step: 'month' (pick which month) | 'preview' (review before finalizing)
  const [runModal, setRunModal] = useState({ open: false, monthKey: lastMonthKey, step: 'month' });
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [adjustmentsList, setAdjustmentsList] = useState([]); // raw rows (with ids) for the current preview month, for delete buttons
  const [adjustForEmp, setAdjustForEmp] = useState(null); // employeeId currently showing the add-adjustment form
  const [adjustForm, setAdjustForm] = useState({ kind: 'bonus', label: '', amount: '' });
  const [adjustSaving, setAdjustSaving] = useState(false);

  // Bank Payment modal state
  const [bankModal, setBankModal]     = useState({ open: false, step: 'setup', batch: null, records: [], loading: false, error: '' });
  const [bankTemplates, setBankTemplates] = useState([]);
  const [bankSelectedTemplate, setBankSelectedTemplate] = useState('');
  const [bankSelectedMonth, setBankSelectedMonth] = useState('');
  const [bankExportFormat, setBankExportFormat] = useState('csv');

  // Import response state
  const [respModal, setRespModal]     = useState({ open: false, batchId: '', loading: false, error: '', step: 'upload', csvText: '', parsedHeaders: [], parsedRows: [], mappings: { accountCol: '', statusCol: '', txnCol: '', dateCol: '' }, preview: [] });
  const fileInputRef = useRef(null);

  const currentRun = runs.find((r) => r.runId === selectedRunId) || runs[0] || null;
  const openDisputes = disputes.filter((d) => d.status === 'open');

  const fetchRuns = useCallback(() => {
    setLoading(true);
    getPayrollRuns()
      .then((res) => {
        const data = res.data || [];
        setRuns(data);
        if (data.length > 0 && !selectedRunId) setSelectedRunId(data[0].runId);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedRunId]);

  const fetchPayslips = (monthKey) => {
    if (!monthKey) return;
    setSlipsLoading(true);
    getPayslips(monthKey)
      .then((res) => setPayslips(res.data || []))
      .catch(() => setPayslips([]))
      .finally(() => setSlipsLoading(false));
  };

  const fetchDisputes = () => {
    getDisputes().then((res) => setDisputes(res.data || [])).catch(() => {});
  };

  const openBankModal = () => {
    const defaultMonth = currentRun?.monthKey || new Date().toISOString().slice(0, 7);
    setBankSelectedMonth(defaultMonth);
    setBankSelectedTemplate('');
    setBankExportFormat('csv');
    setBankModal({ open: true, step: 'setup', batch: null, records: [], loading: false, error: '' });
    getBankTemplates().then((r) => setBankTemplates(r.data || [])).catch(() => {});
  };

  const handleCreatePaymentBatch = async () => {
    if (!bankSelectedMonth) return;
    setBankModal((p) => ({ ...p, loading: true, error: '' }));
    try {
      const res = await createPaymentBatch({ monthKey: bankSelectedMonth, templateId: bankSelectedTemplate || undefined });
      setBankModal((p) => ({ ...p, loading: false, step: 'review', batch: res.data?.batch, records: res.data?.records || [] }));
    } catch (e) {
      setBankModal((p) => ({ ...p, loading: false, error: e.message }));
    }
  };

  const handleExport = () => {
    const tpl = bankTemplates.find((t) => t.templateId === bankSelectedTemplate) || null;
    doExport(bankModal.records, tpl, bankExportFormat, bankSelectedMonth);
  };

  const openRespModal = (batchId) => {
    setRespModal({ open: true, batchId, loading: false, error: '', step: 'upload', csvText: '', parsedHeaders: [], parsedRows: [], mappings: { accountCol: '', statusCol: '', txnCol: '', dateCol: '' }, preview: [] });
  };

  const handleRespFileRead = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setRespModal((p) => ({ ...p, csvText: ev.target.result || '' }));
    reader.readAsText(file);
  };

  const handleParseRespCSV = () => {
    const parsed = parseCSVText(respModal.csvText);
    if (!parsed) { setRespModal((p) => ({ ...p, error: 'Could not parse CSV. Check file format.' })); return; }
    setRespModal((p) => ({ ...p, parsedHeaders: parsed.headers, parsedRows: parsed.rows, step: 'map', error: '' }));
  };

  const handlePreviewImport = () => {
    const { parsedHeaders, parsedRows, mappings } = respModal;
    const { accountCol, statusCol, txnCol, dateCol } = mappings;
    if (!statusCol) { setRespModal((p) => ({ ...p, error: 'Status column is required.' })); return; }
    const accIdx = parsedHeaders.indexOf(accountCol);
    const statIdx = parsedHeaders.indexOf(statusCol);
    const txnIdx = parsedHeaders.indexOf(txnCol);
    const dateIdx = parsedHeaders.indexOf(dateCol);
    const batchRecords = bankModal.batch?.batchId === respModal.batchId ? bankModal.records : [];
    const preview = parsedRows.map((row) => {
      const acct = accIdx >= 0 ? row[accIdx] : '';
      const matched = batchRecords.find((r) => r.accountNumber === acct || r.empCode === acct) || null;
      const rawStatus = statIdx >= 0 ? (row[statIdx] || '').toLowerCase() : '';
      const status = rawStatus.includes('success') || rawStatus.includes('paid') || rawStatus === 'y' ? 'paid'
        : rawStatus.includes('fail') || rawStatus.includes('reject') ? 'failed' : 'pending';
      return {
        accountCol: acct,
        recordId: matched?.recordId || null,
        employeeName: matched?.employeeName || '(no match)',
        amount: matched?.amount,
        status,
        txnId: txnIdx >= 0 ? row[txnIdx] : '',
        paymentDate: dateIdx >= 0 ? row[dateIdx] : '',
      };
    });
    setRespModal((p) => ({ ...p, preview, step: 'preview', error: '' }));
  };

  const handleConfirmImport = async () => {
    const updates = respModal.preview
      .filter((p) => p.recordId)
      .map((p) => ({ recordId: p.recordId, status: p.status, bankTransactionId: p.txnId, paymentDate: p.paymentDate }));
    if (updates.length === 0) { setRespModal((p) => ({ ...p, error: 'No matching records found to update.' })); return; }
    setRespModal((p) => ({ ...p, loading: true, error: '' }));
    try {
      const res = await importBankResponse(respModal.batchId, { updates });
      setBankModal((p) => ({ ...p, batch: res.data?.batch, records: res.data?.records || [] }));
      setRespModal((p) => ({ ...p, open: false, loading: false }));
      setSuccess(`Bank response imported: ${updates.length} records updated.`);
    } catch (e) {
      setRespModal((p) => ({ ...p, loading: false, error: e.message }));
    }
  };

  useEffect(() => { fetchRuns(); fetchDisputes(); }, []);
  useEffect(() => {
    if (currentRun?.monthKey) fetchPayslips(currentRun.monthKey);
  }, [currentRun?.monthKey]);

  const loadPreview = async (monthKey) => {
    setPreviewLoading(true); setError('');
    try {
      const [previewRes, adjustRes] = await Promise.all([
        previewPayrollRun(monthKey),
        getPayrollAdjustments(monthKey),
      ]);
      setPreviewData(previewRes.data);
      setAdjustmentsList(adjustRes.data || []);
    } catch (err) { setError(err.message); }
    finally { setPreviewLoading(false); }
  };

  const handleOpenPreview = () => {
    setRunModal((p) => ({ ...p, step: 'preview' }));
    loadPreview(runModal.monthKey);
  };

  const handleAddAdjustment = async (employeeId) => {
    if (!adjustForm.label.trim() || !Number(adjustForm.amount) || Number(adjustForm.amount) <= 0) {
      setError('Enter a label and a positive amount for the adjustment.');
      return;
    }
    setAdjustSaving(true); setError('');
    try {
      await createPayrollAdjustment({
        employeeId, monthKey: runModal.monthKey,
        kind: adjustForm.kind, label: adjustForm.label.trim(), amount: Number(adjustForm.amount),
      });
      setAdjustForEmp(null);
      setAdjustForm({ kind: 'bonus', label: '', amount: '' });
      await loadPreview(runModal.monthKey);
    } catch (err) { setError(err.message); }
    finally { setAdjustSaving(false); }
  };

  const handleRemoveAdjustment = async (id) => {
    try {
      await deletePayrollAdjustment(id);
      await loadPreview(runModal.monthKey);
    } catch (err) { setError(err.message); }
  };

  const handleRunPayroll = async () => {
    const monthKey = runModal.monthKey;
    setIsProcessing(true); setError('');
    try {
      const res = await runPayroll(monthKey);
      setSuccess(`Payroll processed for ${formatMonth(monthKey)}! ${res.data?.totalEmployees || 0} employees.`);
      setRunModal({ open: false, monthKey: lastMonthKey, step: 'month' });
      setPreviewData(null);
      fetchRuns();
    } catch (err) { setError(err.message); }
    finally { setIsProcessing(false); }
  };

  const handleApproveRun = async () => {
    if (!selectedRunId) return;
    setIsApproving(true);
    try {
      await approvePayrollRun(selectedRunId);
      setSuccess('Payroll run approved!');
      fetchRuns();
    } catch (err) { setError(err.message); }
    finally { setIsApproving(false); }
  };

  const handleResolveDispute = async (disputeId, status) => {
    try {
      await resolveDispute(disputeId, { status });
      setSuccess(`Dispute ${status}.`);
      fetchDisputes();
      // Refresh payslips to update dispute badge
      if (currentRun?.monthKey) fetchPayslips(currentRun.monthKey);
      if (selectedSlip) {
        const updated = payslips.find((p) => p.payslipId === selectedSlip.payslipId);
        if (updated) setSelectedSlip(updated);
      }
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Payroll Management</h1>
          <p className="text-slate-400 mt-1">Process salaries and manage payslips</p>
        </div>
        <div className="flex gap-2 items-center">
          {openDisputes.length > 0 && (
            <button
              onClick={() => setShowDisputes((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-900/30 border border-red-700 text-red-400 text-sm hover:bg-red-900/50 transition-colors"
            >
              <AlertTriangle className="w-4 h-4" />
              {openDisputes.length} Dispute{openDisputes.length > 1 ? 's' : ''}
              {showDisputes ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
          <Button icon={RefreshCw} variant="secondary" onClick={() => { fetchRuns(); fetchDisputes(); }}>Refresh</Button>
          <Button icon={Landmark} variant="secondary" onClick={openBankModal}>Bank Payment</Button>
          <Button icon={Play} variant="primary" onClick={() => { setRunModal({ open: true, monthKey: lastMonthKey, step: 'month' }); setPreviewData(null); }}>
            Run Payroll
          </Button>
        </div>
      </div>

      {error   && <Alert variant="danger"  message={error}   onClose={() => setError('')}   />}
      {success && <Alert variant="success" message={success} onClose={() => setSuccess('')} />}

      {/* ── Disputes panel ── */}
      {showDisputes && openDisputes.length > 0 && (
        <Card>
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> Open Payslip Disputes
            </h2>
            <div className="divide-y divide-slate-700">
              {openDisputes.map((d) => (
                <div key={d.dispute_id} className="py-3 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-100 font-medium">{d.employee_name}
                      <span className="text-slate-400 text-xs ml-2">{d.month}</span>
                    </p>
                    <p className="text-slate-300 text-sm mt-0.5">{d.reason}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{new Date(d.raised_at).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleResolveDispute(d.dispute_id, 'resolved')}
                      className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-green-900/30 border border-green-700 text-green-400 hover:bg-green-900/50"
                    >
                      <CheckSquare className="w-3.5 h-3.5" /> Resolve
                    </button>
                    <button
                      onClick={() => handleResolveDispute(d.dispute_id, 'dismissed')}
                      className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-slate-800 border border-slate-600 text-slate-400 hover:bg-slate-700"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

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
                <button key={run.runId} onClick={() => setSelectedRunId(run.runId)}
                  className={`p-4 rounded-lg border transition-all text-left ${
                    selectedRunId === run.runId ? 'border-sky-500 bg-sky-500/10' : 'border-slate-700 bg-slate-900 hover:border-slate-600'
                  }`}
                >
                  <p className="font-semibold text-slate-100">{run.monthLabel || formatMonth(run.monthKey)}</p>
                  <p className="text-sm text-slate-400">₹{(run.totalAmount / 100000).toFixed(1)}L</p>
                  <Badge variant={run.status === 'completed' ? 'success' : 'warning'} className="mt-2">{run.status}</Badge>
                </button>
              ))}
            </div>
            {currentRun?.status === 'processing' && (
              <Button variant="primary" onClick={handleApproveRun} isLoading={isApproving}>Approve This Run</Button>
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
                    <th className="text-left py-3 px-4 text-slate-400 font-semibold">Emp Code</th>
                    <th className="text-left py-3 px-4 text-slate-400 font-semibold">Employee</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">Basic</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">Gross</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">Deductions</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">Net Salary</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payslips.length > 0 ? payslips.map((slip, idx) => {
                    const totalDeductions = Object.values(slip.deductions || {}).reduce((a, b) => a + b, 0);
                    const hasDispute = slip.dispute && slip.dispute.status === 'open';
                    return (
                      <tr key={slip.payslipId} className={idx % 2 === 0 ? 'bg-slate-900/50' : ''}>
                        <td className="py-3 px-4 text-slate-400 font-mono text-xs">{slip.empCode || '—'}</td>
                        <td className="py-3 px-4 text-slate-100 font-medium">
                          <div className="flex items-center gap-2">
                            {hasDispute && (
                              <span title="Payslip dispute raised" className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                            )}
                            {slip.employeeName}
                          </div>
                        </td>
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
                  }) : (
                    <tr><td colSpan="7" className="py-8 text-center text-slate-400">
                      {loading ? 'Loading...' : 'No payslips for this period. Run payroll first.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* ── Run Payroll Modal ── */}
      <Modal
        isOpen={runModal.open}
        onClose={() => { setRunModal({ open: false, monthKey: lastMonthKey, step: 'month' }); setPreviewData(null); }}
        title={runModal.step === 'preview' ? `Preview — ${formatMonth(runModal.monthKey)}` : 'Run Payroll'}
        size={runModal.step === 'preview' ? '2xl' : 'md'}
      >
        {runModal.step === 'month' && (
          <div className="space-y-4">
            <p className="text-slate-400 text-sm">
              Choose the month to process. This should normally be the month that just
              <strong className="text-slate-200"> ended</strong> — run it once attendance for that
              month is fully entered/corrected, not while it's still in progress.
            </p>

            <div>
              <label className="text-sm text-slate-400 mb-1 block">Month</label>
              <input
                type="month"
                value={runModal.monthKey}
                max={thisMonthKey}
                onChange={(e) => setRunModal((p) => ({ ...p, monthKey: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
              />
            </div>

            {runModal.monthKey === thisMonthKey && (
              <div className="p-3 bg-amber-900/20 border border-amber-700/40 rounded-lg text-amber-300 text-sm">
                {formatMonth(thisMonthKey)} is still in progress — attendance for the rest of the
                month isn't in yet, so Loss-of-Pay days will be wrong if you run it now. Usually
                you want last month ({formatMonth(lastMonthKey)}) instead.
              </div>
            )}

            {runs.some((r) => r.monthKey === runModal.monthKey) && (
              <div className="p-3 bg-sky-900/20 border border-sky-700/40 rounded-lg text-sky-300 text-sm">
                Payroll for {formatMonth(runModal.monthKey)} was already run. Finalizing again
                won't reprocess or pick up any attendance corrections made since — it returns the
                existing run as-is.
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="secondary" onClick={() => setRunModal((p) => ({ ...p, open: false }))} isFullWidth>Cancel</Button>
              <Button variant="primary" icon={Eye} onClick={handleOpenPreview} isFullWidth>
                Preview {formatMonth(runModal.monthKey)}
              </Button>
            </div>
          </div>
        )}

        {runModal.step === 'preview' && (
          <div className="space-y-4">
            {previewLoading ? (
              <div className="py-10 text-center text-slate-400">Calculating...</div>
            ) : previewData ? (
              <>
                <div className="flex items-center justify-between text-sm bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3">
                  <span className="text-slate-400">{previewData.totalEmployees} employees</span>
                  <span className="text-slate-100 font-semibold">
                    Total Net Payable: ₹{previewData.totalNetPayable.toLocaleString('en-IN')}
                  </span>
                </div>

                <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-800">
                      <tr className="border-b border-slate-700">
                        <th className="text-left py-2 px-2 text-slate-400 font-semibold">Employee</th>
                        <th className="text-right py-2 px-2 text-slate-400 font-semibold">Basic</th>
                        <th className="text-right py-2 px-2 text-slate-400 font-semibold">LOP</th>
                        <th className="text-right py-2 px-2 text-slate-400 font-semibold">Overtime</th>
                        <th className="text-right py-2 px-2 text-slate-400 font-semibold">Gross</th>
                        <th className="text-right py-2 px-2 text-slate-400 font-semibold">Deductions</th>
                        <th className="text-right py-2 px-2 text-slate-400 font-semibold">Net Pay</th>
                        <th className="text-center py-2 px-2 text-slate-400 font-semibold">Adjustments</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.employees.map((emp) => {
                        const empAdjustments = adjustmentsList.filter((a) => a.employee_id === emp.employeeId);
                        const totalDeductions = Object.values(emp.deductions).reduce((s, v) => s + Number(v || 0), 0);
                        return (
                          <React.Fragment key={emp.employeeId}>
                            <tr className="border-b border-slate-800">
                              <td className="py-2 px-2 text-slate-100 font-medium">{emp.employeeName}</td>
                              <td className="py-2 px-2 text-right text-slate-300">₹{emp.basic.toLocaleString('en-IN')}</td>
                              <td className="py-2 px-2 text-right">
                                {emp.lopDays > 0 ? <span className="text-red-400">{emp.lopDays}d</span> : <span className="text-slate-600">—</span>}
                              </td>
                              <td className="py-2 px-2 text-right">
                                {emp.overtimeHours > 0 ? <span className="text-green-400">{emp.overtimeHours}h</span> : <span className="text-slate-600">—</span>}
                              </td>
                              <td className="py-2 px-2 text-right text-slate-300">₹{emp.gross.toLocaleString('en-IN')}</td>
                              <td className="py-2 px-2 text-right text-red-400">₹{totalDeductions.toLocaleString('en-IN')}</td>
                              <td className="py-2 px-2 text-right text-slate-100 font-semibold">₹{emp.netSalary.toLocaleString('en-IN')}</td>
                              <td className="py-2 px-2 text-center">
                                <button
                                  onClick={() => { setAdjustForEmp(adjustForEmp === emp.employeeId ? null : emp.employeeId); setAdjustForm({ kind: 'bonus', label: '', amount: '' }); }}
                                  className="text-xs px-2 py-1 rounded border border-slate-600 text-slate-300 hover:bg-slate-700"
                                >
                                  + Add
                                </button>
                              </td>
                            </tr>
                            {empAdjustments.length > 0 && (
                              <tr className="border-b border-slate-800 bg-slate-900/30">
                                <td colSpan="8" className="py-1.5 px-2">
                                  <div className="flex flex-wrap gap-1.5">
                                    {empAdjustments.map((adj) => (
                                      <span key={adj.id} className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-slate-800 text-slate-300">
                                        {adj.label}: ₹{Number(adj.amount).toLocaleString('en-IN')}
                                        <button onClick={() => handleRemoveAdjustment(adj.id)} className="text-slate-500 hover:text-red-400">
                                          <X className="w-3 h-3" />
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                            {adjustForEmp === emp.employeeId && (
                              <tr className="border-b border-slate-800 bg-slate-900/50">
                                <td colSpan="8" className="py-2 px-2">
                                  <div className="flex gap-2 items-center flex-wrap">
                                    <select
                                      value={adjustForm.kind}
                                      onChange={(e) => setAdjustForm((f) => ({ ...f, kind: e.target.value }))}
                                      className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 text-xs"
                                    >
                                      <option value="bonus">Bonus</option>
                                      <option value="reimbursement">Reimbursement</option>
                                      <option value="other_earning">Other Earning</option>
                                      <option value="other_deduction">Other Deduction</option>
                                    </select>
                                    <input
                                      placeholder="Label (e.g. Diwali Bonus)"
                                      value={adjustForm.label}
                                      onChange={(e) => setAdjustForm((f) => ({ ...f, label: e.target.value }))}
                                      className="flex-1 min-w-[140px] bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 text-xs"
                                    />
                                    <input
                                      type="number" min="0" placeholder="Amount"
                                      value={adjustForm.amount}
                                      onChange={(e) => setAdjustForm((f) => ({ ...f, amount: e.target.value }))}
                                      className="w-24 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 text-xs"
                                    />
                                    <Button size="sm" variant="primary" isLoading={adjustSaving} onClick={() => handleAddAdjustment(emp.employeeId)}>
                                      Save
                                    </Button>
                                    <button onClick={() => setAdjustForEmp(null)} className="text-xs text-slate-400 hover:text-slate-200">Cancel</button>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="secondary" onClick={() => setRunModal((p) => ({ ...p, step: 'month' }))} isFullWidth>← Back</Button>
                  <Button variant="primary" icon={Play} isLoading={isProcessing} onClick={handleRunPayroll} isFullWidth>
                    Finalize Payroll
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        )}
      </Modal>

      {/* ── Bank Payment Modal ── */}
      <Modal isOpen={bankModal.open} onClose={() => setBankModal((p) => ({ ...p, open: false }))} title="Bank Payment Advice" size="2xl">
        {bankModal.error && <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">{bankModal.error}</div>}

        {bankModal.step === 'setup' && (
          <div className="space-y-4">
            <p className="text-slate-400 text-sm">Generate a bank payment file for employee salary disbursement.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Payroll Month</label>
                <input type="month" value={bankSelectedMonth} onChange={(e) => setBankSelectedMonth(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Bank Template (optional)</label>
                <select value={bankSelectedTemplate} onChange={(e) => setBankSelectedTemplate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none text-sm">
                  <option value="">— No template (default fields) —</option>
                  {bankTemplates.map((t) => (
                    <option key={t.templateId} value={t.templateId}>{t.templateName} ({t.bankName})</option>
                  ))}
                </select>
                {bankTemplates.length === 0 && (
                  <p className="text-xs text-slate-500 mt-1">Create bank templates in Settings → Bank Templates.</p>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Export Format</label>
              <div className="flex gap-2">
                {['csv', 'json', 'xml', 'txt'].map((f) => (
                  <button key={f} onClick={() => setBankExportFormat(f)}
                    className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${bankExportFormat === f ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="pt-2 flex gap-2">
              <Button variant="secondary" onClick={() => setBankModal((p) => ({ ...p, open: false }))}>Cancel</Button>
              <Button variant="primary" icon={FileDown} isLoading={bankModal.loading} onClick={handleCreatePaymentBatch}>
                Generate Payment Records
              </Button>
            </div>
          </div>
        )}

        {bankModal.step === 'review' && bankModal.batch && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-center">
                <p className="text-slate-400 text-xs">Employees</p>
                <p className="text-2xl font-bold text-sky-400">{bankModal.batch.totalEmployees}</p>
              </div>
              <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-center">
                <p className="text-slate-400 text-xs">Total Amount</p>
                <p className="text-2xl font-bold text-green-400">₹{Number(bankModal.batch.totalAmount).toLocaleString()}</p>
              </div>
              <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-center">
                <p className="text-slate-400 text-xs">Paid / Failed</p>
                <p className="text-2xl font-bold">
                  <span className="text-green-400">{bankModal.batch.paidCount}</span>
                  <span className="text-slate-500 text-lg"> / </span>
                  <span className="text-red-400">{bankModal.batch.failedCount}</span>
                </p>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Export Format</label>
                <div className="flex gap-1">
                  {['csv', 'json', 'xml', 'txt'].map((f) => (
                    <button key={f} onClick={() => setBankExportFormat(f)}
                      className={`px-2 py-1 rounded text-xs font-medium ${bankExportFormat === f ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                      {f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-end gap-2">
                <Button icon={FileDown} variant="primary" onClick={handleExport}>
                  Download {bankExportFormat.toUpperCase()} File
                </Button>
                <Button icon={Upload} variant="secondary" onClick={() => openRespModal(bankModal.batch.batchId)}>
                  Import Bank Response
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto max-h-72">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-800">
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-2 px-3 text-slate-400">Emp Code</th>
                    <th className="text-left py-2 px-3 text-slate-400">Name</th>
                    <th className="text-left py-2 px-3 text-slate-400">Account</th>
                    <th className="text-left py-2 px-3 text-slate-400">IFSC</th>
                    <th className="text-right py-2 px-3 text-slate-400">Amount</th>
                    <th className="text-center py-2 px-3 text-slate-400">Mode</th>
                    <th className="text-center py-2 px-3 text-slate-400">Status</th>
                    <th className="text-left py-2 px-3 text-slate-400">Txn ID</th>
                  </tr>
                </thead>
                <tbody>
                  {bankModal.records.map((r, i) => (
                    <tr key={r.recordId} className={i % 2 === 0 ? 'bg-slate-900/40' : ''}>
                      <td className="py-1.5 px-3 font-mono text-slate-400">{r.empCode || '—'}</td>
                      <td className="py-1.5 px-3 text-slate-200">{r.employeeName}</td>
                      <td className="py-1.5 px-3 font-mono text-slate-300">{r.accountNumber || <span className="text-amber-400">No account</span>}</td>
                      <td className="py-1.5 px-3 font-mono text-slate-400">{r.ifsc || '—'}</td>
                      <td className="py-1.5 px-3 text-right text-green-400 font-medium">₹{Number(r.amount).toLocaleString()}</td>
                      <td className="py-1.5 px-3 text-center text-slate-300">{r.mode}</td>
                      <td className="py-1.5 px-3 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          r.status === 'paid' ? 'bg-green-900/40 text-green-300' :
                          r.status === 'failed' ? 'bg-red-900/40 text-red-300' :
                          'bg-slate-700 text-slate-400'}`}>{r.status}</span>
                      </td>
                      <td className="py-1.5 px-3 text-slate-500 font-mono text-xs">{r.bankTransactionId || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {bankModal.records.some((r) => !r.accountNumber) && (
              <p className="text-amber-400 text-xs bg-amber-900/10 border border-amber-700/40 rounded px-3 py-2">
                Some employees have no bank account number. Add bank details in Employees → Bank Details tab.
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* ── Import Bank Response Modal ── */}
      <Modal isOpen={respModal.open} onClose={() => setRespModal((p) => ({ ...p, open: false }))} title="Import Bank Response" size="2xl">
        <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleRespFileRead} />
        {respModal.error && <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">{respModal.error}</div>}

        {respModal.step === 'upload' && (
          <div className="space-y-4">
            <p className="text-slate-400 text-sm">Upload the CSV/TXT response file from your bank after processing salary payments.</p>
            <div className="border-2 border-dashed border-slate-600 rounded-lg p-6 text-center space-y-3">
              <Upload className="w-8 h-8 text-slate-500 mx-auto" />
              <p className="text-slate-400 text-sm">Select bank response file (CSV/TXT)</p>
              <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>Browse File</Button>
            </div>
            {respModal.csvText && (
              <div>
                <p className="text-green-400 text-xs mb-2">File loaded ({respModal.csvText.length} chars)</p>
                <textarea rows={4} readOnly value={respModal.csvText.slice(0, 500) + (respModal.csvText.length > 500 ? '…' : '')}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-slate-400 font-mono resize-none" />
              </div>
            )}
            <p className="text-slate-500 text-xs text-center">Or paste CSV text directly:</p>
            <textarea rows={3} placeholder="Paste bank response CSV here..."
              value={respModal.csvText}
              onChange={(e) => setRespModal((p) => ({ ...p, csvText: e.target.value }))}
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-slate-300 font-mono resize-none focus:border-sky-500 focus:outline-none"
            />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setRespModal((p) => ({ ...p, open: false }))}>Cancel</Button>
              <Button variant="primary" onClick={handleParseRespCSV} disabled={!respModal.csvText.trim()}>Parse & Map Columns</Button>
            </div>
          </div>
        )}

        {respModal.step === 'map' && (
          <div className="space-y-4">
            <p className="text-slate-400 text-sm">Map the CSV columns to the required fields.</p>
            <p className="text-xs text-slate-500">Detected columns: {respModal.parsedHeaders.join(', ')}</p>
            {[
              { field: 'accountCol', label: 'Match by (Account No or Emp Code)', required: false },
              { field: 'statusCol',  label: 'Payment Status column', required: true },
              { field: 'txnCol',     label: 'Transaction / UTR No column', required: false },
              { field: 'dateCol',    label: 'Payment Date column', required: false },
            ].map(({ field, label, required }) => (
              <div key={field}>
                <label className="block text-xs text-slate-400 mb-1">{label}{required && <span className="text-red-400 ml-1">*</span>}</label>
                <select value={respModal.mappings[field]} onChange={(e) => setRespModal((p) => ({ ...p, mappings: { ...p.mappings, [field]: e.target.value } }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:border-sky-500 focus:outline-none">
                  <option value="">— Select column —</option>
                  {respModal.parsedHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setRespModal((p) => ({ ...p, step: 'upload' }))}>Back</Button>
              <Button variant="primary" onClick={handlePreviewImport}>Preview Import</Button>
            </div>
          </div>
        )}

        {respModal.step === 'preview' && (
          <div className="space-y-4">
            <p className="text-slate-400 text-sm">{respModal.preview.length} rows parsed. {respModal.preview.filter((p) => p.recordId).length} matched to payment records.</p>
            <div className="overflow-x-auto max-h-64">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-800">
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-2 px-3 text-slate-400">Matched Employee</th>
                    <th className="text-left py-2 px-3 text-slate-400">Account/Key</th>
                    <th className="text-center py-2 px-3 text-slate-400">Status</th>
                    <th className="text-left py-2 px-3 text-slate-400">Txn ID</th>
                    <th className="text-left py-2 px-3 text-slate-400">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {respModal.preview.map((p, i) => (
                    <tr key={i} className={`${i % 2 === 0 ? 'bg-slate-900/40' : ''} ${!p.recordId ? 'opacity-40' : ''}`}>
                      <td className="py-1.5 px-3 text-slate-200">{p.employeeName}</td>
                      <td className="py-1.5 px-3 font-mono text-slate-400">{p.accountCol}</td>
                      <td className="py-1.5 px-3 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${p.status === 'paid' ? 'bg-green-900/40 text-green-300' : p.status === 'failed' ? 'bg-red-900/40 text-red-300' : 'bg-slate-700 text-slate-400'}`}>{p.status}</span>
                      </td>
                      <td className="py-1.5 px-3 font-mono text-slate-400 text-xs">{p.txnId || '—'}</td>
                      <td className="py-1.5 px-3 text-slate-400">{p.paymentDate || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setRespModal((p) => ({ ...p, step: 'map' }))}>Back</Button>
              <Button variant="primary" isLoading={respModal.loading} onClick={handleConfirmImport}>
                Confirm Import ({respModal.preview.filter((p) => p.recordId).length} records)
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Payslip Modal ── */}
      <Modal isOpen={isSlipModalOpen} onClose={() => setIsSlipModalOpen(false)} title="Payslip Details" size="2xl">
        {selectedSlip && (
          <div className="space-y-6">
            {/* Header */}
            <div className="border-b border-slate-700 pb-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-2xl font-bold text-slate-100">{selectedSlip.employeeName}</p>
                  <p className="text-slate-400">{selectedSlip.month}</p>
                  {selectedSlip.empCode && (
                    <p className="text-slate-500 text-xs mt-1">Code: {selectedSlip.empCode}</p>
                  )}
                </div>
                {/* Dispute badge */}
                {selectedSlip.dispute && (
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
                    selectedSlip.dispute.status === 'open'
                      ? 'bg-red-900/40 border border-red-700 text-red-300'
                      : 'bg-slate-800 border border-slate-600 text-slate-400'
                  }`}>
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Dispute: {selectedSlip.dispute.status}
                    {selectedSlip.dispute.status === 'open' && (
                      <span className="ml-1 opacity-70 text-xs">– {selectedSlip.dispute.reason?.slice(0, 40)}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Share buttons */}
              <div className="flex gap-2 mt-3 flex-wrap">
                <button
                  onClick={() => printPayslip(selectedSlip)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-slate-700 border border-slate-600 text-slate-300 hover:bg-slate-600 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" /> Print / PDF
                </button>
                <button
                  onClick={() => shareViaWhatsApp(selectedSlip)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-green-900/30 border border-green-700 text-green-400 hover:bg-green-900/50 transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  {selectedSlip.employeePhone ? 'WhatsApp' : 'WhatsApp (no phone)'}
                </button>
                <button
                  onClick={() => shareViaEmail(selectedSlip)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-sky-900/30 border border-sky-700 text-sky-400 hover:bg-sky-900/50 transition-colors"
                >
                  <Mail className="w-3.5 h-3.5" />
                  {selectedSlip.employeeEmail ? `Email ${selectedSlip.employeeEmail}` : 'Email (no address)'}
                </button>
              </div>
            </div>

            {/* Earnings */}
            <div>
              <h3 className="text-lg font-bold text-green-400 mb-3">Earnings</h3>
              <div className="space-y-2 bg-slate-900 p-4 rounded-lg">
                {Object.entries(selectedSlip.earnings || {}).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-slate-300">
                    <span>{k}:</span><span>₹{Number(v).toLocaleString()}</span>
                  </div>
                ))}
                <div className="border-t border-slate-700 pt-2 font-bold text-sky-400 flex justify-between">
                  <span>Gross:</span><span>₹{Number(selectedSlip.gross).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Deductions */}
            <div>
              <h3 className="text-lg font-bold text-red-400 mb-3">Deductions</h3>
              <div className="space-y-2 bg-slate-900 p-4 rounded-lg">
                {Object.entries(selectedSlip.deductions || {}).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-slate-300">
                    <span>{k}:</span><span>₹{Number(v).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Net salary */}
            <div className="bg-gradient-to-r from-green-900/20 to-green-800/20 border border-green-700 p-4 rounded-lg">
              <p className="text-slate-400 text-sm mb-2">Net Salary (Payable)</p>
              <p className="text-3xl font-bold text-green-400">₹{Number(selectedSlip.netSalary).toLocaleString()}</p>
              {selectedSlip.bankAccount && <p className="text-slate-400 text-sm mt-2">Account: {selectedSlip.bankAccount}</p>}
            </div>

            {/* Dispute resolution (if open) */}
            {selectedSlip.dispute?.status === 'open' && (
              <div className="bg-red-900/10 border border-red-800 rounded-lg p-4 space-y-3">
                <p className="text-red-400 font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Dispute Raised
                </p>
                <p className="text-slate-300 text-sm">{selectedSlip.dispute.reason}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleResolveDispute(selectedSlip.dispute.dispute_id, 'resolved')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-green-900/30 border border-green-700 text-green-400 hover:bg-green-900/50"
                  >
                    <CheckSquare className="w-3.5 h-3.5" /> Mark Resolved
                  </button>
                  <button
                    onClick={() => handleResolveDispute(selectedSlip.dispute.dispute_id, 'dismissed')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-slate-800 border border-slate-600 text-slate-400 hover:bg-slate-700"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default PayrollPage;
