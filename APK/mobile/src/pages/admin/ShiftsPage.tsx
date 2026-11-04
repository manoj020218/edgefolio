import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Pencil, Plus, Trash2, X } from 'lucide-react';
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from '../../lib/api';

export interface Shift {
  id: number | string;
  name: string;
  start: string;
  end: string;
  breakStart: string | null;
  breakEnd: string | null;
  breakPaid: boolean;
  weeklyOff: number[];
  graceMinutes: number;
  isDefault: boolean;
  overnight: boolean;
  employees: number;
}

interface FormState {
  name: string;
  start: string;
  end: string;
  breakStart: string;
  breakEnd: string;
  breakPaid: boolean;
  weeklyOff: number[];
  graceMinutes: string;
  isDefault: boolean;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const EMPTY: FormState = {
  name: '', start: '09:00', end: '18:00', breakStart: '', breakEnd: '', breakPaid: false,
  weeklyOff: [0], graceMinutes: '10', isDefault: false,
};

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${on ? 'bg-brand-500' : 'bg-surface-light'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

export default function ShiftsPage() {
  const navigate = useNavigate();
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Shift | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<Shift | null>(null);

  function load() {
    apiGet<Shift[]>('/shifts').then(setShifts).catch((e) => setError(e instanceof Error ? e.message : 'Could not load shifts.'));
  }

  useEffect(() => {
    load();
    apiGet<{ employeesManagedIn?: string }>('/company')
      .then((c) => { if (c.employeesManagedIn === 'pc') setReadOnly(true); })
      .catch(() => { /* ignore */ });
  }, []);

  function openNew() {
    setForm({ ...EMPTY, isDefault: (shifts?.length ?? 0) === 0 });
    setFormError(null);
    setEditing('new');
  }

  function openEdit(s: Shift) {
    setForm({
      name: s.name, start: s.start, end: s.end, breakStart: s.breakStart ?? '', breakEnd: s.breakEnd ?? '',
      breakPaid: s.breakPaid, weeklyOff: [...s.weeklyOff], graceMinutes: String(s.graceMinutes ?? 0), isDefault: s.isDefault,
    });
    setFormError(null);
    setEditing(s);
  }

  function handleManaged(err: unknown): string {
    if (err instanceof ApiError && err.code === 'MANAGED_IN_EDGE') {
      setReadOnly(true);
      return 'Managed in EdgeFolio for Windows';
    }
    return err instanceof Error ? err.message : 'Something went wrong.';
  }

  async function save() {
    if (!form.name.trim()) { setFormError('Enter a shift name'); return; }
    if (!form.start || !form.end) { setFormError('Set the start and end time'); return; }
    if ((form.breakStart && !form.breakEnd) || (!form.breakStart && form.breakEnd)) { setFormError('Set both break start and end, or leave both empty'); return; }
    const body = {
      name: form.name.trim(),
      start: form.start,
      end: form.end,
      breakStart: form.breakStart || null,
      breakEnd: form.breakEnd || null,
      breakPaid: form.breakPaid,
      weeklyOff: [...form.weeklyOff].sort(),
      graceMinutes: Math.max(0, parseInt(form.graceMinutes, 10) || 0),
      isDefault: form.isDefault,
    };
    setBusy(true);
    setFormError(null);
    try {
      if (editing === 'new') await apiPost<Shift>('/shifts', body);
      else if (editing) await apiPatch<Shift>(`/shifts/${editing.id}`, body);
      setEditing(null);
      load();
    } catch (err) {
      setFormError(handleManaged(err));
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!confirmDel) return;
    setBusy(true);
    try {
      await apiDelete(`/shifts/${confirmDel.id}`);
      setConfirmDel(null);
      load();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SHIFT_IN_USE') setError('This shift has employees assigned. Move them to another shift first.');
      else if (err instanceof ApiError && err.code === 'SHIFT_DEFAULT') setError('The default shift cannot be deleted. Make another shift the default first.');
      else setError(handleManaged(err));
      setConfirmDel(null);
    } finally {
      setBusy(false);
    }
  }

  const overnight = form.end < form.start;

  return (
    <div className="animate-enter space-y-4 px-5 py-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate('/admin/company')} className="btn-ghost h-9 w-9 !rounded-full text-slate-200" aria-label="Back"><ArrowLeft size={16} /></button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-extrabold text-[#f4f5fb]">Shifts &amp; working hours</h1>
          <p className="text-xs text-slate-400">Office time, lunch break and weekly off</p>
        </div>
        {!readOnly && (
          <button type="button" onClick={openNew} className="btn-primary h-9 gap-1 px-3 text-sm"><Plus size={15} /> Add</button>
        )}
      </div>

      {readOnly && <p className="glass px-4 py-3 text-xs text-slate-300">Managed in EdgeFolio for Windows. Shifts are shown here read-only.</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
      {!error && !shifts && <p className="text-sm text-slate-400">Loading…</p>}

      <ul className="space-y-2.5">
        {shifts?.map((s) => (
          <li key={s.id} className="glass p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-100">{s.name}</p>
                  {s.isDefault && <span className="chip">Default</span>}
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-[13px] text-slate-300">
                  <Clock size={13} className="text-slate-500" /> {s.start}–{s.end}{s.overnight ? ' (overnight)' : ''}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {s.breakStart && s.breakEnd
                    ? `Break ${s.breakStart}–${s.breakEnd} · Lunch ${s.breakPaid ? 'paid' : 'deducted'}`
                    : 'No break'}
                </p>
              </div>
              {!readOnly && (
                <div className="flex flex-shrink-0 gap-1.5">
                  <button type="button" onClick={() => openEdit(s)} className="btn-ghost h-8 w-8 !rounded-full text-slate-200" aria-label="Edit"><Pencil size={14} /></button>
                  <button type="button" onClick={() => setConfirmDel(s)} className="btn-ghost h-8 w-8 !rounded-full text-danger" aria-label="Delete"><Trash2 size={14} /></button>
                </div>
              )}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {s.weeklyOff.length === 0 && <span className="text-xs text-slate-500">No weekly off</span>}
              {[...s.weeklyOff].sort().map((d) => <span key={d} className="rounded-full bg-slate-500/20 px-2 py-0.5 text-[11px] text-slate-300">{DAYS[d]} off</span>)}
              <span className="ml-auto text-xs text-slate-400">{s.employees} employee{s.employees === 1 ? '' : 's'}</span>
            </div>
          </li>
        ))}
      </ul>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => !busy && setEditing(null)} />
          <div className="animate-enter relative z-10 flex max-h-[92vh] w-full flex-col rounded-t-4xl border-t border-white/[0.1] bg-surface-raised px-5 pb-6 pt-3 shadow-2xl">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-surface-light" />
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-100">{editing === 'new' ? 'New shift' : 'Edit shift'}</h2>
              <button onClick={() => setEditing(null)} className="rounded-full glass p-1.5 text-slate-400" aria-label="Close"><X size={16} /></button>
            </div>
            <div className="space-y-3.5 overflow-y-auto pb-2">
              <div>
                <label className="label-caps" htmlFor="sn">Name</label>
                <input id="sn" className="input mt-1 !py-2.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Shift A — General" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-caps" htmlFor="ss">Start</label>
                  <input id="ss" type="time" className="input mt-1 !py-2.5" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
                </div>
                <div>
                  <label className="label-caps" htmlFor="se">End</label>
                  <input id="se" type="time" className="input mt-1 !py-2.5" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
                </div>
              </div>
              {overnight && <p className="text-xs text-amber-300">End is before start, so this is an overnight shift (ends the next day).</p>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-caps" htmlFor="bs">Break start (optional)</label>
                  <input id="bs" type="time" className="input mt-1 !py-2.5" value={form.breakStart} onChange={(e) => setForm({ ...form, breakStart: e.target.value })} />
                </div>
                <div>
                  <label className="label-caps" htmlFor="be">Break end</label>
                  <input id="be" type="time" className="input mt-1 !py-2.5" value={form.breakEnd} onChange={(e) => setForm({ ...form, breakEnd: e.target.value })} />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 glass px-4 py-3">
                <div>
                  <p className="text-[13.5px] font-semibold text-slate-100">Lunch counted as working time</p>
                  <p className="text-xs text-slate-400">{form.breakPaid ? 'Break is paid — not deducted.' : 'Off: break time is deducted from net hours.'}</p>
                </div>
                <Toggle on={form.breakPaid} onChange={(v) => setForm({ ...form, breakPaid: v })} label="Lunch counted as working time" />
              </div>
              <div>
                <p className="label-caps">Weekly off</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {DAYS.map((d, i) => {
                    const on = form.weeklyOff.includes(i);
                    return (
                      <button key={d} type="button"
                        onClick={() => setForm({ ...form, weeklyOff: on ? form.weeklyOff.filter((x) => x !== i) : [...form.weeklyOff, i] })}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold ${on ? 'bg-brand-500 text-white' : 'bg-surface-light text-slate-400'}`}>
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="label-caps" htmlFor="gm">Grace minutes (late-arrival tolerance)</label>
                <input id="gm" type="number" inputMode="numeric" min={0} className="input mt-1 !py-2.5" value={form.graceMinutes} onChange={(e) => setForm({ ...form, graceMinutes: e.target.value })} />
              </div>
              <div className="flex items-center justify-between gap-3 glass px-4 py-3">
                <p className="text-[13.5px] font-semibold text-slate-100">Default shift</p>
                <Toggle on={form.isDefault} onChange={(v) => setForm({ ...form, isDefault: v })} label="Default shift" />
              </div>
              {formError && <p className="text-sm text-danger">{formError}</p>}
            </div>
            <button type="button" onClick={() => void save()} disabled={busy} className="btn-primary mt-2 w-full py-3 font-semibold disabled:opacity-50">
              {busy ? 'Saving…' : 'Save shift'}
            </button>
          </div>
        </div>
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/60" onClick={() => setConfirmDel(null)} />
          <div className="animate-enter relative z-10 w-full max-w-sm rounded-3xl border border-white/[0.1] bg-surface-raised p-5">
            <p className="font-semibold text-slate-100">Delete &ldquo;{confirmDel.name}&rdquo;?</p>
            <p className="mt-1 text-sm text-slate-400">This cannot be undone.</p>
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
