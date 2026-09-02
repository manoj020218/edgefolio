import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Upload } from 'lucide-react';
import { apiPost, ApiError } from '../../lib/api';
import { REQUEST_TYPES, EXPENSE_CATEGORIES, LEAVE_TYPES } from './requestTypes';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const today = () => new Date().toISOString().slice(0, 10);

export default function NewRequestPage() {
  const { type } = useParams<{ type: string }>();
  const navigate = useNavigate();
  const config = REQUEST_TYPES.find((t) => t.type === type);

  const [fromDate, setFromDate] = useState(today());
  const [toDate, setToDate] = useState(today());
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [leaveType, setLeaveType] = useState<(typeof LEAVE_TYPES)[number]>(LEAVE_TYPES[0]);
  const [shiftText, setShiftText] = useState('');
  const [documentType, setDocumentType] = useState('');
  const [reason, setReason] = useState('');
  const [billFile, setBillFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!config) {
    return (
      <div className="px-5" style={{ paddingTop: '52px' }}>
        <p className="text-sm text-danger">Unknown request type.</p>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!config) return;
    setBusy(true);
    setError(null);
    try {
      const details: Record<string, unknown> = { reason: reason.trim() || undefined };
      if (config.fields.includes('dateRange')) {
        details.fromDate = fromDate;
        details.toDate = toDate;
      }
      if (config.fields.includes('singleDate')) details.date = fromDate;
      if (config.fields.includes('amount')) details.amount = Number(amount) || 0;
      if (config.fields.includes('category')) details.category = category;
      if (config.fields.includes('leaveType')) details.leaveType = leaveType;
      if (config.fields.includes('shiftText')) details.requestedShift = shiftText;
      if (config.fields.includes('documentType')) details.documentType = documentType;

      const title = config.fields.includes('amount') && amount
        ? `${config.label} — ₹${Number(amount).toLocaleString('en-IN')}`
        : config.label;

      const billBase64 = billFile ? await fileToBase64(billFile) : undefined;

      await apiPost('/requests', { type: config.type, title, details, billBase64 });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit request.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex min-h-full flex-col justify-center px-6">
        <h1 className="mb-2 text-xl font-bold text-slate-100">Request submitted</h1>
        <p className="mb-8 text-sm text-slate-300">You&rsquo;ll see its status under Requests once it&rsquo;s reviewed.</p>
        <button onClick={() => navigate('/requests')} className="text-sm font-semibold text-brand-500">
          ← Back to Requests
        </button>
      </div>
    );
  }

  return (
    <div className="px-5 pb-8" style={{ paddingTop: '52px' }}>
      <button onClick={() => navigate(-1)} className="mb-5 flex items-center gap-1 text-sm font-medium text-slate-300">
        <ChevronLeft size={18} /> Back
      </button>

      <h1 className="mb-5 text-xl font-bold text-slate-100">{config.label}</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {config.fields.includes('leaveType') && (
          <div>
            <label className="mb-2 block text-xs font-semibold text-slate-400">Leave Type</label>
            <div className="flex gap-2">
              {LEAVE_TYPES.map((lt) => (
                <button
                  type="button"
                  key={lt}
                  onClick={() => setLeaveType(lt)}
                  className={`flex-1 rounded-xl py-2.5 text-xs font-semibold capitalize ${
                    leaveType === lt ? 'bg-brand-500 text-white' : 'bg-surface-light text-slate-300'
                  }`}
                >
                  {lt}
                </button>
              ))}
            </div>
          </div>
        )}

        {config.fields.includes('dateRange') && (
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-semibold text-slate-400">From</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full rounded-xl border border-surface-light bg-surface px-3 py-2.5 text-sm text-slate-100"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-semibold text-slate-400">To</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full rounded-xl border border-surface-light bg-surface px-3 py-2.5 text-sm text-slate-100"
              />
            </div>
          </div>
        )}

        {config.fields.includes('singleDate') && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-400">Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full rounded-xl border border-surface-light bg-surface px-3 py-2.5 text-sm text-slate-100"
            />
          </div>
        )}

        {config.fields.includes('category') && (
          <div>
            <label className="mb-2 block text-xs font-semibold text-slate-400">Category</label>
            <div className="flex flex-wrap gap-2">
              {EXPENSE_CATEGORIES.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`rounded-full px-3.5 py-2 text-xs font-semibold ${
                    category === c ? 'bg-brand-500 text-white' : 'bg-surface-light text-slate-300'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {config.fields.includes('amount') && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-400">Amount (&#8377;)</label>
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="w-full rounded-xl border border-surface-light bg-surface px-3 py-2.5 text-sm text-slate-100"
            />
          </div>
        )}

        {config.fields.includes('shiftText') && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-400">Requested Shift</label>
            <input
              value={shiftText}
              onChange={(e) => setShiftText(e.target.value)}
              placeholder="e.g. 2:00 PM – 11:00 PM"
              className="w-full rounded-xl border border-surface-light bg-surface px-3 py-2.5 text-sm text-slate-100"
            />
          </div>
        )}

        {config.fields.includes('documentType') && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-400">Document Needed</label>
            <input
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              placeholder="e.g. Experience letter"
              className="w-full rounded-xl border border-surface-light bg-surface px-3 py-2.5 text-sm text-slate-100"
            />
          </div>
        )}

        {config.fields.includes('billPhoto') && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-400">Bill</label>
            <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-slate-600 bg-surface p-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-500/15">
                <Upload size={18} className="text-brand-400" />
              </div>
              <span className="text-sm font-semibold text-slate-100">
                {billFile ? billFile.name : 'Upload photo of bill'}
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => setBillFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-400">Reason / Notes</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-surface-light bg-surface px-3 py-2.5 text-sm text-slate-100"
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-2 rounded-xl bg-brand-500 py-3.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? 'Submitting…' : 'Submit for Approval'}
        </button>
      </form>
    </div>
  );
}
