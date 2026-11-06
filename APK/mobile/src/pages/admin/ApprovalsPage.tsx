import { useEffect, useState } from 'react';
import { CheckCircle2, Image as ImageIcon, X } from 'lucide-react';
import { apiGet, apiGetFull, apiPost, ApiError } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { requestTypeLabel } from '../employee/requestTypes';

interface ApprovalRow {
  id: string;
  type: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  title: string;
  details?: { leaveType?: string; fromDate?: string; toDate?: string; halfDay?: boolean; reason?: string } | null;
  days: number | null;
  decisionNote: string | null;
  decidedByName?: string | null;
  createdAt: string;
  hasBill?: boolean;
  employee: { empId: string; empCode: string; name: string; department: string | null };
  balance?: { key?: string; name?: string; remaining: number | null } | number | null;
}

const TABS = ['pending', 'approved', 'rejected'] as const;

function balanceText(r: ApprovalRow): string | null {
  if (r.type !== 'leave' || r.balance == null) return null;
  const rem = typeof r.balance === 'number' ? r.balance : r.balance.remaining;
  const name = typeof r.balance === 'object' && r.balance.name ? r.balance.name : r.details?.leaveType ?? 'Leave';
  if (rem == null) return `${name}: no limit`;
  return `${name}: ${rem} day${rem === 1 ? '' : 's'} left${r.status === 'pending' ? ' after this' : ''}`;
}

// Owner/HR: approve or reject employee requests (GET /approvals, POST /approvals/:id/approve|reject).
export default function ApprovalsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('pending');
  const [rows, setRows] = useState<ApprovalRow[] | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<{ row: ApprovalRow; action: 'approve' | 'reject' } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [bill, setBill] = useState<{ loading: boolean; src: string | null; error: string | null } | null>(null);

  function load() {
    setRows(null);
    setError(null);
    apiGetFull<ApprovalRow[]>('/approvals', { status: tab })
      .then(({ data, meta }) => {
        setRows(data ?? []);
        const pc = (meta as { pendingCount?: number } | undefined)?.pendingCount;
        if (typeof pc === 'number') setPendingCount(pc);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load requests.'));
  }

  useEffect(load, [tab]);

  async function submit() {
    if (!deciding) return;
    setBusy(true);
    setSheetError(null);
    try {
      await apiPost(`/approvals/${deciding.row.id}/${deciding.action}`, { note: note.trim() || undefined });
      setNotice(`${deciding.row.employee.name}'s request was ${deciding.action === 'approve' ? 'approved' : 'rejected'}.`);
      setDeciding(null);
      setNote('');
      load();
    } catch (e) {
      setSheetError(e instanceof ApiError ? e.message : 'Could not save your decision.');
    } finally {
      setBusy(false);
    }
  }

  async function showBill(id: string) {
    setBill({ loading: true, src: null, error: null });
    try {
      const b = await apiGet<{ mime: string; data: string }>(`/approvals/${id}/bill`);
      const src = b.data.startsWith('data:') ? b.data : `data:${b.mime};base64,${b.data}`;
      setBill({ loading: false, src, error: null });
    } catch (e) {
      setBill({ loading: false, src: null, error: e instanceof ApiError ? e.message : 'Could not load the bill.' });
    }
  }

  return (
    <div className="animate-enter px-4 py-4">
      <h1 className="mb-3 text-lg font-semibold text-slate-100">Approvals</h1>

      <div className="mb-3.5 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setNotice(null); }}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize ${
              tab === t ? 'bg-brand text-white shadow-glow' : 'border border-surface-light bg-surface text-slate-300'
            }`}
          >
            {t}
            {t === 'pending' && pendingCount ? (
              <span className="rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">{pendingCount}</span>
            ) : null}
          </button>
        ))}
      </div>

      {notice && <p className="mb-3 glass !border-success p-3 text-sm text-slate-200">{notice}</p>}
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      {!rows && !error && <p className="text-sm text-slate-400">Loading…</p>}
      {rows && rows.length === 0 && (
        <div className="glass flex flex-col items-center gap-2 p-6 text-center">
          <CheckCircle2 size={26} className="text-slate-500" />
          <p className="text-sm text-slate-400">{tab === 'pending' ? 'Nothing waiting for approval.' : `No ${tab} requests.`}</p>
        </div>
      )}

      <ul className="space-y-2.5">
        {rows?.map((r) => {
          const bal = balanceText(r);
          const d = r.details ?? {};
          return (
            <li key={r.id} className="glass p-4">
              <p className="font-medium text-slate-100">
                {r.employee.name} <span className="text-xs text-slate-400">({r.employee.empCode})</span>
              </p>
              <p className="text-xs text-slate-400">{r.employee.department ?? 'No dept'} · {formatDateTime(r.createdAt)}</p>
              <p className="mt-2 text-sm font-semibold text-slate-100">{requestTypeLabel(r.type)}</p>
              <p className="text-[13px] text-slate-300">{r.title}</p>
              {d.fromDate && (
                <p className="text-xs text-slate-400">
                  {d.fromDate}{d.toDate && d.toDate !== d.fromDate ? ` → ${d.toDate}` : ''}
                  {r.days != null ? ` · ${r.days} day${r.days === 1 ? '' : 's'}` : ''}{d.halfDay ? ' (half day)' : ''}
                </p>
              )}
              {bal && <p className="mt-1 text-xs font-semibold text-info">{bal}</p>}
              {d.reason && <p className="mt-2 text-sm text-slate-300">&ldquo;{d.reason}&rdquo;</p>}
              {r.hasBill && (
                <button type="button" onClick={() => void showBill(r.id)} className="btn-ghost mt-2 gap-1.5 px-3 py-1.5 text-xs">
                  <ImageIcon size={14} /> View bill photo
                </button>
              )}
              {r.status !== 'pending' && (
                <p className="mt-2 text-xs text-slate-400">
                  {r.status === 'cancelled' ? 'Cancelled by employee' : `${r.status === 'approved' ? 'Approved' : 'Rejected'}${r.decidedByName ? ` by ${r.decidedByName}` : ''}`}
                  {r.decisionNote ? ` · ${r.decisionNote}` : ''}
                </p>
              )}
              {r.status === 'pending' && (
                <div className="mt-3 flex gap-2">
                  <button onClick={() => { setDeciding({ row: r, action: 'approve' }); setNote(''); setSheetError(null); }}
                    className="btn-primary flex-1 py-2.5 text-sm font-semibold text-white">Approve</button>
                  <button onClick={() => { setDeciding({ row: r, action: 'reject' }); setNote(''); setSheetError(null); }}
                    className="btn-ghost flex-1 py-2.5 text-sm font-semibold text-slate-200">Reject</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {deciding && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => !busy && setDeciding(null)} />
          <div className="animate-enter relative z-10 w-full rounded-t-4xl border-t border-white/[0.1] bg-surface-raised px-5 pb-8 pt-4 shadow-2xl">
            <h2 className="text-base font-bold text-slate-100">
              {deciding.action === 'approve' ? 'Approve' : 'Reject'} {deciding.row.employee.name}&rsquo;s request
            </h2>
            <p className="mb-3 text-xs text-slate-400">{deciding.row.title}</p>
            <label className="label-caps">Note (optional)</label>
            <textarea className="input mt-1 w-full text-sm" rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={deciding.action === 'reject' ? 'Reason shown to the employee' : 'Message to the employee'} />
            {sheetError && <p className="mt-2 text-sm text-danger">{sheetError}</p>}
            <div className="mt-4 flex gap-2">
              <button disabled={busy} onClick={() => setDeciding(null)} className="btn-ghost flex-1 py-3 text-sm">Cancel</button>
              <button disabled={busy} onClick={() => void submit()} className="btn-primary flex-1 py-3 text-sm font-semibold text-white disabled:opacity-50">
                {busy ? 'Saving…' : deciding.action === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {bill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setBill(null)}>
          <button className="absolute right-4 top-12 rounded-full glass p-2 text-slate-200" aria-label="Close"><X size={18} /></button>
          {bill.loading && <p className="text-sm text-slate-300">Loading…</p>}
          {bill.error && <p className="text-sm text-danger">{bill.error}</p>}
          {bill.src && <img src={bill.src} alt="Bill" className="max-h-full max-w-full rounded-xl object-contain" />}
        </div>
      )}
    </div>
  );
}
