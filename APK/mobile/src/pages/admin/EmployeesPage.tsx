import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { apiGet, apiPatch, ApiError } from '../../lib/api';
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
}

export default function EmployeesPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'hr-admin';

  const [rows, setRows] = useState<EmployeeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [issued, setIssued] = useState<{ empName: string; tempPassword: string } | null>(null);

  function load() {
    apiGet<EmployeeRow[]>('/employees')
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load employees.'));
  }

  useEffect(load, []);

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
    <div className="px-4 py-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">Employees</h1>
        <Link
          to="/admin/password-resets"
          className="flex items-center gap-1.5 rounded-md bg-surface-light px-3 py-1.5 text-sm text-slate-200"
        >
          <KeyRound size={16} /> Resets
        </Link>
      </div>

      {issued && (
        <div className="mb-4 rounded-lg border border-success bg-surface p-3">
          <p className="text-sm text-slate-300">
            Temporary password for <span className="font-medium text-slate-100">{issued.empName}</span> (new
            account):
          </p>
          <p className="mt-1 font-mono text-lg text-slate-100">{issued.tempPassword}</p>
          <button onClick={() => setIssued(null)} className="mt-2 text-xs text-brand-500 underline">
            Dismiss
          </button>
        </div>
      )}

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      {!error && !rows && <p className="text-sm text-slate-400">Loading…</p>}

      <ul className="space-y-2">
        {rows?.map((r) => (
          <li key={r.id} className="rounded-lg border border-surface-light bg-surface p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-100">{r.name}</p>
                <p className="text-xs text-slate-400">
                  {r.empCode} · {r.department || 'No dept'} · {r.designation || '—'}
                </p>
                <p className="mt-1 text-xs capitalize text-slate-500">
                  Face enrollment: {r.enrollmentStatus}
                </p>
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
