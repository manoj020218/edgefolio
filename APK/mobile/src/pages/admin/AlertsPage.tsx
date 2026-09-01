import { useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPost, ApiError } from '../../lib/api';

interface Subscription {
  id: string;
  watched: { id: number; name: string; empCode: string; dept: string | null };
  alertCheckin: boolean;
  alertCheckout: boolean;
}

interface EmployeeOption {
  id: number;
  empCode: string;
  name: string;
}

export default function AlertsPage() {
  const [rows, setRows] = useState<Subscription[] | null>(null);
  const [employees, setEmployees] = useState<EmployeeOption[] | null>(null);
  const [pickEmpId, setPickEmpId] = useState<number | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    apiGet<Subscription[]>('/alert-subscriptions')
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load alerts.'));
  }

  useEffect(load, []);
  useEffect(() => {
    apiGet<EmployeeOption[]>('/employees').then(setEmployees).catch(() => {});
  }, []);

  const availableEmployees = employees?.filter((e) => !rows?.some((r) => r.watched.id === e.id)) ?? [];

  async function subscribe() {
    if (!pickEmpId) return;
    setBusy(true);
    try {
      await apiPost('/alert-subscriptions', { watchedEmpId: pickEmpId });
      setPickEmpId('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not subscribe.');
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe(id: string) {
    try {
      await apiDelete(`/alert-subscriptions/${id}`);
      setRows((prev) => prev?.filter((r) => r.id !== id) ?? prev);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove.');
    }
  }

  return (
    <div className="px-4 py-4">
      <h1 className="mb-1 text-lg font-semibold text-slate-100">Alerts</h1>
      <p className="mb-4 text-xs text-slate-400">Get notified on your phone when someone checks in or out.</p>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      <div className="mb-4 flex gap-2">
        <select
          value={pickEmpId}
          onChange={(e) => setPickEmpId(e.target.value ? Number(e.target.value) : '')}
          className="flex-1 rounded-md border border-surface-light bg-surface px-3 py-2 text-sm text-slate-100"
        >
          <option value="">Select employee to watch…</option>
          {availableEmployees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} ({e.empCode})
            </option>
          ))}
        </select>
        <button
          disabled={!pickEmpId || busy}
          onClick={() => void subscribe()}
          className="rounded-md bg-brand-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {!rows && !error && <p className="text-sm text-slate-400">Loading…</p>}

      <ul className="space-y-2">
        {rows?.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between rounded-lg border border-surface-light bg-surface p-3"
          >
            <div>
              <p className="font-medium text-slate-100">{r.watched.name}</p>
              <p className="text-xs text-slate-400">
                {r.watched.empCode} · {r.watched.dept || 'No dept'}
              </p>
            </div>
            <button onClick={() => void unsubscribe(r.id)} className="text-xs text-danger underline">
              Remove
            </button>
          </li>
        ))}
        {rows && rows.length === 0 && <p className="text-sm text-slate-400">Not watching anyone yet.</p>}
      </ul>
    </div>
  );
}
