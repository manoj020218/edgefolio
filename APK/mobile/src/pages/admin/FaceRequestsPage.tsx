import { useEffect, useState } from 'react';
import { ScanFace } from 'lucide-react';
import { apiGet, apiPost, ApiError } from '../../lib/api';
import { formatDateTime } from '../../lib/format';

interface RecaptureRequest {
  id: string;
  empId: string;
  empCode: string;
  name: string;
  dept: string | null;
  reason: string | null;
  requestedAt: string;
}

// HR/owner: approve or decline Face ID re-capture requests (GET/POST /faces/recapture-requests).
// An approval lets that employee re-capture once within 24 hours; nobody can change an existing
// Face ID without it.
export default function FaceRequestsPage() {
  const [rows, setRows] = useState<RecaptureRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function load() {
    apiGet<RecaptureRequest[]>('/faces/recapture-requests')
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load requests.'));
  }

  useEffect(load, []);

  async function decide(row: RecaptureRequest, action: 'approve' | 'reject') {
    setBusyId(row.id);
    setError(null);
    try {
      await apiPost(`/faces/recapture-requests/${row.id}/${action}`);
      setRows((prev) => prev?.filter((r) => r.id !== row.id) ?? prev);
      setDone(action === 'approve'
        ? `${row.name} can re-capture Face ID within the next 24 hours.`
        : `${row.name}'s request was declined.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your decision.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="animate-enter px-4 py-4">
      <h1 className="mb-1 text-lg font-semibold text-slate-100">Face ID requests</h1>
      <p className="mb-4 text-xs text-slate-400">
        Employees can&rsquo;t change their Face ID on their own. Approve only if you know the request is genuine
        &mdash; the approval works once, for 24 hours.
      </p>

      {done && <p className="mb-3 glass !border-success p-3 text-sm text-slate-200">{done}</p>}
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      {!rows && !error && <p className="text-sm text-slate-400">Loading…</p>}
      {rows && rows.length === 0 && (
        <div className="glass flex flex-col items-center gap-2 p-6 text-center">
          <ScanFace size={26} className="text-slate-500" />
          <p className="text-sm text-slate-400">No pending requests.</p>
        </div>
      )}

      <ul className="space-y-2.5">
        {rows?.map((r) => (
          <li key={r.id} className="glass p-4">
            <p className="font-medium text-slate-100">{r.name} <span className="text-xs text-slate-400">({r.empCode})</span></p>
            <p className="text-xs text-slate-400">{r.dept ?? 'No dept'} · {formatDateTime(r.requestedAt)}</p>
            {r.reason && <p className="mt-2 text-sm text-slate-300">&ldquo;{r.reason}&rdquo;</p>}
            <div className="mt-3 flex gap-2">
              <button disabled={busyId === r.id} onClick={() => void decide(r, 'approve')}
                className="btn-primary flex-1 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                Approve
              </button>
              <button disabled={busyId === r.id} onClick={() => void decide(r, 'reject')}
                className="btn-ghost flex-1 py-2.5 text-sm font-semibold text-slate-200 disabled:opacity-50">
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
