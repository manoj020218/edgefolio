import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react';
import { apiDelete, apiGet, apiPost, ApiError } from '../../lib/api';

interface Holiday { id: number | string; date: string; name: string }

export default function HolidaysPage() {
  const navigate = useNavigate();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [rows, setRows] = useState<Holiday[] | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<Holiday | null>(null);

  function load() {
    setRows(null);
    setError(null);
    apiGet<Holiday[]>('/holidays', { year })
      .then((r) => setRows([...r].sort((a, b) => a.date.localeCompare(b.date))))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load holidays.'));
  }

  useEffect(load, [year]);

  useEffect(() => {
    apiGet<{ employeesManagedIn?: string }>('/company')
      .then((c) => { if (c.employeesManagedIn === 'pc') setReadOnly(true); })
      .catch(() => { /* ignore */ });
  }, []);

  function handleErr(err: unknown): string {
    if (err instanceof ApiError && err.code === 'MANAGED_IN_EDGE') { setReadOnly(true); return 'Managed in EdgeFolio for Windows'; }
    if (err instanceof ApiError && err.code === 'HOLIDAY_EXISTS') return 'There is already a holiday on that date.';
    return err instanceof Error ? err.message : 'Something went wrong.';
  }

  async function add() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setFormError('Pick a date'); return; }
    if (!name.trim()) { setFormError('Enter the holiday name'); return; }
    setBusy(true);
    setFormError(null);
    try {
      await apiPost('/holidays', { date, name: name.trim() });
      setAdding(false);
      setDate('');
      setName('');
      if (Number(date.slice(0, 4)) !== year) setYear(Number(date.slice(0, 4)));
      else load();
    } catch (err) {
      setFormError(handleErr(err));
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!confirmDel) return;
    setBusy(true);
    try {
      await apiDelete(`/holidays/${confirmDel.id}`);
      setConfirmDel(null);
      load();
    } catch (err) {
      setError(handleErr(err));
      setConfirmDel(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-enter space-y-4 px-5 py-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate('/admin/company')} className="btn-ghost h-9 w-9 !rounded-full text-slate-200" aria-label="Back"><ArrowLeft size={16} /></button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-extrabold text-[#f4f5fb]">Holidays</h1>
          <p className="text-xs text-slate-400">Company holidays are not marked absent</p>
        </div>
        {!readOnly && (
          <button type="button" onClick={() => { setFormError(null); setDate(''); setName(''); setAdding(true); }} className="btn-primary h-9 gap-1 px-3 text-sm"><Plus size={15} /> Add</button>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button onClick={() => setYear((y) => y - 1)} className="rounded-full glass p-2 text-slate-300" aria-label="Previous year"><ChevronLeft size={16} /></button>
        <p className="text-[15px] font-semibold text-slate-100">{year}</p>
        <button onClick={() => setYear((y) => y + 1)} className="rounded-full glass p-2 text-slate-300" aria-label="Next year"><ChevronRight size={16} /></button>
      </div>

      {readOnly && <p className="glass px-4 py-3 text-xs text-slate-300">Managed in EdgeFolio for Windows. Holidays are shown here read-only.</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
      {!error && !rows && <p className="text-sm text-slate-400">Loading…</p>}
      {rows && rows.length === 0 && <p className="text-sm text-slate-400">No holidays for {year}.</p>}

      <ul className="space-y-2">
        {rows?.map((h) => {
          const d = new Date(`${h.date}T00:00:00`);
          return (
            <li key={h.id} className="flex items-center gap-3 glass px-4 py-3">
              <div className="flex h-11 w-11 flex-shrink-0 flex-col items-center justify-center rounded-xl bg-purple-500/20 text-purple-300">
                <span className="text-sm font-bold leading-none">{d.getDate()}</span>
                <span className="text-[9px] uppercase">{d.toLocaleDateString('en-IN', { month: 'short' })}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-slate-100">{h.name}</p>
                <p className="text-xs text-slate-400">{d.toLocaleDateString('en-IN', { weekday: 'long' })}</p>
              </div>
              {!readOnly && (
                <button type="button" onClick={() => setConfirmDel(h)} className="btn-ghost h-8 w-8 !rounded-full text-danger" aria-label="Delete"><Trash2 size={14} /></button>
              )}
            </li>
          );
        })}
      </ul>

      {adding && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => !busy && setAdding(false)} />
          <div className="animate-enter relative z-10 w-full rounded-t-4xl border-t border-white/[0.1] bg-surface-raised px-5 pb-6 pt-3 shadow-2xl">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-surface-light" />
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-100">Add holiday</h2>
              <button onClick={() => setAdding(false)} className="rounded-full glass p-1.5 text-slate-400" aria-label="Close"><X size={16} /></button>
            </div>
            <div className="space-y-3.5">
              <div>
                <label className="label-caps" htmlFor="hd">Date</label>
                <input id="hd" type="date" className="input mt-1 !py-2.5" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <label className="label-caps" htmlFor="hn">Name</label>
                <input id="hn" className="input mt-1 !py-2.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="Diwali" />
              </div>
              {formError && <p className="text-sm text-danger">{formError}</p>}
              <button type="button" onClick={() => void add()} disabled={busy} className="btn-primary w-full py-3 font-semibold disabled:opacity-50">
                {busy ? 'Saving…' : 'Add holiday'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/60" onClick={() => setConfirmDel(null)} />
          <div className="animate-enter relative z-10 w-full max-w-sm rounded-3xl border border-white/[0.1] bg-surface-raised p-5">
            <p className="font-semibold text-slate-100">Delete &ldquo;{confirmDel.name}&rdquo;?</p>
            <p className="mt-1 text-sm text-slate-400">{confirmDel.date}</p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setConfirmDel(null)} className="btn-ghost flex-1 py-2.5 text-sm">Cancel</button>
              <button type="button" onClick={() => void doDelete()} disabled={busy} className="btn-primary flex-1 py-2.5 text-sm disabled:opacity-50">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
