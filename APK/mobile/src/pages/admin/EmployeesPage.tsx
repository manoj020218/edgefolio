import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, ScanFace } from 'lucide-react';
import { apiGet, apiPatch, ApiError, isCloudModeSync } from '../../lib/api';
import type { Shift } from './ShiftsPage';
import { useAuth } from '../../lib/auth';

interface EmployeeRow {
  id: number;
  empCode: string;
  name: string;
  department: string | null;
  designation: string | null;
  appRole: string;
  mobileLoginEnabled: number;
  enrollmentStatus: string;
  shiftId?: number | string | null;
}

export default function EmployeesPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'hr-admin';

  const [rows, setRows] = useState<EmployeeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cloud = isCloudModeSync();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [appManaged, setAppManaged] = useState(false);
  const canShift = cloud && appManaged && (user?.role === 'owner' || user?.role === 'hr-admin');
  const defaultShift = shifts.find((s) => s.isDefault);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [issued, setIssued] = useState<{ empName: string; tempPassword: string } | null>(null);

  function load() {
    apiGet<EmployeeRow[]>('/employees')
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load employees.'));
  }

  useEffect(load, []);

  useEffect(() => {
    if (!cloud) return;
    apiGet<Shift[]>('/shifts').then(setShifts).catch(() => { /* optional */ });
    apiGet<{ employeesManagedIn?: string }>('/company')
      .then((c) => setAppManaged(c.employeesManagedIn === 'app'))
      .catch(() => { /* stays read-only */ });
  }, [cloud]);

  async function changeShift(row: EmployeeRow, value: string) {
    const picked = shifts.find((s) => String(s.id) === value);
    setPendingId(row.id);
    try {
      await apiPatch(`/employees/${row.id}`, { shiftId: picked?.id ?? null });
      setRows((prev) => (prev ? prev.map((r) => (r.id === row.id ? { ...r, shiftId: picked?.id ?? null } : r)) : prev));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change the shift.');
    } finally {
      setPendingId(null);
    }
  }

  async function toggleLogin(row: EmployeeRow) {
    if (!canEdit) return;
    setPendingId(row.id);
    try {
      const nextEnabled = row.mobileLoginEnabled ? 0 : 1;
      // Turning login on for someone with no account yet auto-creates one — see
      // patchEmployeeHandler in apkController.js. tempPassword is only ever
      // returned this once; there's no other way to retrieve it afterwards.
      const res = await apiPatch<{ updated: boolean; tempPassword: string | null }>(`/employees/${row.id}`, {
        mobileLoginEnabled: nextEnabled,
      });
      if (res.tempPassword) {
        setIssued({ empName: row.name, tempPassword: res.tempPassword });
      }
      setRows((prev) =>
        prev ? prev.map((r) => (r.id === row.id ? { ...r, mobileLoginEnabled: nextEnabled } : r)) : prev,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed.');
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="animate-enter px-4 py-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">Employees</h1>
        <div className="flex gap-2">
          <Link
            to="/admin/face-requests"
            className="flex items-center gap-1.5 rounded-md bg-surface-light px-3 py-1.5 text-sm text-slate-200"
          >
            <ScanFace size={16} /> Face ID
          </Link>
          <Link
            to="/admin/password-resets"
            className="flex items-center gap-1.5 rounded-md bg-surface-light px-3 py-1.5 text-sm text-slate-200"
          >
            <KeyRound size={16} /> Resets
          </Link>
        </div>
      </div>

      {issued && (
        <div className="mb-4 glass !border-success p-3">
          <p className="text-sm text-slate-300">
            Temporary password for <span className="font-medium text-slate-100">{issued.empName}</span> (new
            account):
          </p>
          <p className="mt-1 font-mono text-lg text-slate-100">{issued.tempPassword}</p>
          <button onClick={() => setIssued(null)} className="mt-2 text-xs font-semibold text-brand-300">
            Dismiss
          </button>
        </div>
      )}

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      {!error && !rows && <p className="text-sm text-slate-400">Loading…</p>}

      <ul className="space-y-2">
        {rows?.map((r) => (
          <li key={r.id} className="glass p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-100">{r.name}</p>
                <p className="text-xs text-slate-400">
                  {r.empCode} · {r.department || 'No dept'} · {r.designation || '—'}
                </p>
                <p className="mt-1 text-xs capitalize text-slate-500">
                  Face enrollment: {r.enrollmentStatus}
                </p>
                {cloud && shifts.length > 0 && (
                  canShift ? (
                    <label className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400">
                      Shift
                      <select
                        value={r.shiftId != null ? String(r.shiftId) : String(defaultShift?.id ?? '')}
                        disabled={pendingId === r.id}
                        onChange={(e) => void changeShift(r, e.target.value)}
                        className="rounded-lg bg-surface-light px-2 py-1 text-xs text-slate-200"
                      >
                        {shifts.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                      </select>
                    </label>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">
                      Shift: {(shifts.find((s) => String(s.id) === String(r.shiftId)) ?? defaultShift)?.name ?? '—'}
                    </p>
                  )
                )}
              </div>
              <button
                disabled={!canEdit || pendingId === r.id}
                onClick={() => void toggleLogin(r)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium disabled:opacity-40 ${
                  r.mobileLoginEnabled
                    ? 'bg-success/20 text-success'
                    : 'bg-surface-light text-slate-400'
                }`}
              >
                {r.mobileLoginEnabled ? 'App: On' : 'App: Off'}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {!canEdit && rows && (
        <p className="mt-4 text-xs text-slate-500">Owner view is read-only — HR-admin can change mobile access.</p>
      )}
    </div>
  );
}
