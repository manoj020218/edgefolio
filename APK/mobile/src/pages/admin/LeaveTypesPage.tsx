import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { apiGet, apiPut, ApiError } from '../../lib/api';
import type { LeaveTypeCfg } from '../employee/requestTypes';

// Owner/HR: name and yearly days for each leave type (GET/PUT /leave-types). App-only companies.
export default function LeaveTypesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<LeaveTypeCfg[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet<LeaveTypeCfg[]>('/leave-types')
      .then(setRows)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load leave types.'));
  }, []);

  function patch(key: string, p: Partial<LeaveTypeCfg>) {
    setSaved(false);
    setRows((prev) => prev?.map((r) => (r.key === key ? { ...r, ...p } : r)) ?? prev);
  }

  async function save() {
    if (!rows) return;
    for (const r of rows) {
      if (!r.name.trim()) { setError('Every leave type needs a name.'); return; }
      if (r.perYear != null && !(r.perYear >= 0 && r.perYear <= 60)) { setError('Days per year must be between 0 and 60.'); return; }
    }
    setBusy(true);
    setError(null);
    try {
      const out = await apiPut<LeaveTypeCfg[]>('/leave-types', rows.map((r) => ({ key: r.key, name: r.name.trim(), perYear: r.key === 'unpaid' ? null : r.perYear })));
      if (Array.isArray(out)) setRows(out);
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'MANAGED_IN_EDGE' ? 'Leave types are managed in EdgeFolio for Windows.' : e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-enter space-y-4 px-5 py-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="btn-ghost h-9 w-9 !rounded-full text-slate-200" aria-label="Back"><ArrowLeft size={16} /></button>
        <h1 className="text-lg font-extrabold text-[#f4f5fb]">Leave types</h1>
      </div>
      <p className="text-xs text-slate-400">Days each employee gets per calendar year. Approved leave is deducted; holidays and weekly offs are not counted.</p>

      {!rows && !error && <p className="text-slate-400">Loading…</p>}

      {rows?.map((r) => {
        const fixed = r.key === 'unpaid';
        const unlimited = r.perYear == null;
        return (
          <div key={r.key} className="glass space-y-3 p-4">
            <div>
              <label className="label-caps">Name</label>
              <input className="input !py-2.5" value={r.name} maxLength={30} onChange={(e) => patch(r.key, { name: e.target.value })} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <label className="label-caps">Days per year</label>
                <input
                  type="number" inputMode="numeric" min={0} max={60}
                  className="input !py-2.5 disabled:opacity-40"
                  disabled={unlimited || fixed}
                  value={unlimited ? '' : r.perYear ?? ''}
                  placeholder={unlimited ? 'No limit' : '0'}
                  onChange={(e) => patch(r.key, { perYear: e.target.value === '' ? 0 : Number(e.target.value) })}
                />
              </div>
              <label className="flex flex-col items-center gap-1 text-[11px] text-slate-400">
                No limit
                <input type="checkbox" className="h-5 w-5 accent-brand-500" checked={unlimited} disabled={fixed}
                  onChange={(e) => patch(r.key, { perYear: e.target.checked ? null : 12 })} />
              </label>
            </div>
          </div>
        );
      })}

      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && <p className="text-sm text-success">Saved.</p>}
      {rows && (
        <button type="button" disabled={busy} onClick={() => void save()} className="btn-primary w-full py-3.5 text-sm font-bold text-white disabled:opacity-50">
          {busy ? 'Saving…' : 'Save'}
        </button>
      )}
    </div>
  );
}
