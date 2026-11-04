import { useEffect, useState } from 'react';
import { Check, Flag, Sparkles } from 'lucide-react';
import { apiGetFull, apiPost, ApiError } from '../lib/api';

interface Suggestion { date: string; name: string; type: 'national' | 'festival'; verify: boolean; added: boolean }

// Suggested Indian public holidays (GET /holidays/suggestions). Nothing is added automatically —
// the admin ticks the ones the company observes and taps "Add selected".
export default function HolidaySuggestions({ year, onAdded }: { year: number; onAdded: () => void }) {
  const [rows, setRows] = useState<Suggestion[] | null>(null);
  const [known, setKnown] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  function load() {
    setRows(null);
    setPicked(new Set());
    apiGetFull<Suggestion[]>('/holidays/suggestions', { year })
      .then(({ data, meta }) => { setRows(data); setKnown(Boolean((meta as { festivalDatesKnown?: boolean })?.festivalDatesKnown)); })
      .catch(() => setRows([]));
  }
  useEffect(load, [year]);

  const pending = rows?.filter((r) => !r.added) ?? [];
  if (rows && pending.length === 0) return null;

  function toggle(date: string) {
    setPicked((p) => { const n = new Set(p); if (n.has(date)) n.delete(date); else n.add(date); return n; });
  }

  async function addSelected() {
    setBusy(true);
    setMsg(null);
    let ok = 0;
    for (const s of pending.filter((r) => picked.has(r.date))) {
      try { await apiPost('/holidays', { date: s.date, name: s.name }); ok++; }
      catch (e) { if (!(e instanceof ApiError && e.code === 'HOLIDAY_EXISTS')) setMsg(e instanceof Error ? e.message : 'Some holidays could not be added.'); }
    }
    setBusy(false);
    if (ok) { setMsg(`${ok} holiday${ok === 1 ? '' : 's'} added.`); onAdded(); }
    load();
  }

  return (
    <div className="glass space-y-3 p-4">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 text-left">
        <Sparkles size={16} className="text-amber-300" />
        <span className="flex-1 text-[14px] font-semibold text-slate-100">Suggested holidays (India) — {year}</span>
        <span className="text-xs text-brand-300">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <>
          <p className="text-xs text-slate-400">
            Tick the ones your company observes. National holidays have fixed dates; festival dates follow the
            central government list and can differ by a day in your state — please check before adding.
            {!known && ' Festival dates for this year are not loaded yet; only fixed-date holidays are shown.'}
          </p>
          {!rows && <p className="text-xs text-slate-400">Loading…</p>}
          <ul className="space-y-1.5">
            {pending.map((s) => {
              const d = new Date(`${s.date}T00:00:00`);
              const on = picked.has(s.date);
              return (
                <li key={s.date}>
                  <button type="button" onClick={() => toggle(s.date)}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${on ? 'border-brand-500/60 bg-brand-500/15' : 'border-white/[0.08] bg-white/[0.03]'}`}>
                    <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border ${on ? 'border-brand-400 bg-brand-500 text-white' : 'border-slate-500'}`}>
                      {on && <Check size={13} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-slate-100">
                        {s.type === 'national' && <Flag size={12} className="text-orange-300" />}{s.name}
                      </span>
                      <span className="text-[11.5px] text-slate-400">
                        {d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                        {s.verify && ' · check date'}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPicked(new Set(pending.map((p) => p.date)))} className="btn-ghost flex-1 py-2.5 text-xs">Select all</button>
            <button type="button" disabled={busy || picked.size === 0} onClick={() => void addSelected()} className="btn-primary flex-1 py-2.5 text-sm disabled:opacity-50">
              {busy ? 'Adding…' : `Add selected (${picked.size})`}
            </button>
          </div>
          {msg && <p className="text-xs text-slate-300">{msg}</p>}
        </>
      )}
    </div>
  );
}
