import { useEffect, useState } from 'react';
import { authApiGet, authApiPost, ApiError } from '../../lib/api';
import { formatDateTime } from '../../lib/format';

interface ResetRequest {
  id: string;
  emp_id: string;
  emp_name: string;
  emp_phone: string | null;
  requested_at: string;
}

export default function PasswordResetsPage() {
  const [rows, setRows] = useState<ResetRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ empName: string; tempPassword: string } | null>(null);

  function load() {
    authApiGet<ResetRequest[]>('/reset-requests')
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load reset requests.'));
  }

  useEffect(load, []);

  async function approve(row: ResetRequest) {
    setBusyId(row.id);
    setError(null);
    try {
      const res = await authApiPost<{ tempPassword: string }>(`/reset-requests/${row.id}/approve`);
      setIssued({ empName: row.emp_name, tempPassword: res.tempPassword });
      setRows((prev) => prev?.filter((r) => r.id !== row.id) ?? prev);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not approve request.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="px-4 py-4">
      <h1 className="mb-1 text-lg font-semibold text-slate-100">Password Resets</h1>
      <p className="mb-4 text-xs text-slate-400">
        Approving generates a one-time temporary password — share it with the employee
        directly (SMS/call). It&rsquo;s only ever shown here, once.
      </p>

      {issued && (
        <div className="mb-4 rounded-lg border border-success bg-surface p-3">
          <p className="text-sm text-slate-300">
            Temporary password for <span className="font-medium text-slate-100">{issued.empName}</span>:
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
                <p className="font-medium text-slate-100">{r.emp_name}</p>
                <p className="text-xs text-slate-400">
                  {r.emp_phone || 'No phone on file'} · requested {formatDateTime(r.requested_at)}
                </p>
              </div>
              <button
                disabled={busyId === r.id}
                onClick={() => void approve(r)}
                className="rounded-md bg-brand-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                {busyId === r.id ? 'Approving…' : 'Approve'}
              </button>
            </div>
          </li>
        ))}
        {rows && rows.length === 0 && <p className="text-sm text-slate-400">No pending requests.</p>}
      </ul>
    </div>
  );
}
