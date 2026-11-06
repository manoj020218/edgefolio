import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays, Clock, Wallet, Receipt, Plane, RefreshCw, Home as HomeIcon, Timer, FileText,
} from 'lucide-react';
import { apiGet, apiPost, ApiError, isCloudModeSync } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { REQUEST_TYPES, requestTypeLabel, type RequestType } from './requestTypes';

const ICONS: Record<RequestType, typeof CalendarDays> = {
  leave: CalendarDays,
  attendance_correction: Clock,
  advance_salary: Wallet,
  expense: Receipt,
  travel: Plane,
  shift_change: RefreshCw,
  wfh: HomeIcon,
  comp_off: Timer,
  document_request: FileText,
};

interface RequestRow {
  id: string;
  type: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  title: string;
  decisionNote: string | null;
  decidedByName?: string | null;
  createdAt: string;
}

const FILTERS = ['all', 'pending', 'approved', 'rejected'] as const;

export default function RequestsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');

  function load() {
    apiGet<RequestRow[]>('/requests', filter === 'all' ? undefined : { status: filter })
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load requests.'));
  }

  useEffect(load, [filter]);

  const [cancellingId, setCancellingId] = useState<string | null>(null);
  async function cancel(id: string) {
    setCancellingId(id);
    setError(null);
    try {
      await apiPost(`/requests/${id}/cancel`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not cancel the request.');
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="animate-enter px-5" style={{ paddingTop: '52px' }}>
      <h1 className="mb-4 text-xl font-bold text-slate-100">Requests</h1>

      <p className="mb-2 text-[11px] font-bold tracking-wide text-slate-500">START A REQUEST</p>
      <div className="mb-4 grid grid-cols-4 gap-2">
        {REQUEST_TYPES.map(({ type, label }) => {
          const Icon = ICONS[type];
          return (
            <button
              key={type}
              onClick={() => navigate(`/requests/new/${type}`)}
              className="flex flex-col items-center gap-1.5 glass p-3"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/15">
                <Icon size={17} className="text-brand-400" />
              </div>
              <span className="text-center text-[10.5px] font-semibold leading-tight text-slate-300">{label}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-3.5 flex gap-2 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize ${
              filter === f ? 'bg-brand text-white shadow-glow' : 'border border-surface-light bg-surface text-slate-300'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      {!error && !rows && <p className="text-sm text-slate-400">Loading…</p>}

      <div className="flex flex-col gap-2">
        {rows?.map((r) => (
          <div key={r.id} className="glass p-3.5">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-100">{r.title}</span>
              <span
                className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                  r.status === 'approved'
                    ? 'bg-success/15 text-success'
                    : r.status === 'rejected'
                      ? 'bg-danger/15 text-danger'
                      : r.status === 'cancelled'
                        ? 'bg-slate-500/20 text-slate-400'
                        : 'bg-warning/15 text-warning'
                }`}
              >
                {r.status.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {requestTypeLabel(r.type)} &middot; {formatDateTime(r.createdAt)}
              {r.decidedByName && r.status !== 'pending' && r.status !== 'cancelled' ? ` · by ${r.decidedByName}` : ''}
              {r.decisionNote ? ` · ${r.decisionNote}` : ''}
            </p>
            {r.status === 'pending' && isCloudModeSync() && (
              <button
                type="button"
                disabled={cancellingId === r.id}
                onClick={() => void cancel(r.id)}
                className="btn-ghost mt-2.5 px-3 py-1.5 text-xs font-semibold text-slate-200 disabled:opacity-50"
              >
                {cancellingId === r.id ? 'Cancelling…' : 'Cancel request'}
              </button>
            )}
          </div>
        ))}
        {rows && rows.length === 0 && <p className="text-sm text-slate-400">No requests {filter !== 'all' ? `(${filter})` : 'yet'}.</p>}
      </div>
    </div>
  );
}
