import { useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPost, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';

interface Assignment {
  id: string;
  employee: { id: number; name: string; empCode: string; dept: string | null };
  workType: 'tour' | 'wfh';
  fromDate: string;
  toDate: string;
  notes: string | null;
}

interface EmployeeOption {
  id: number;
  empCode: string;
  name: string;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function AssignmentsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'hr-admin';

  const [date, setDate] = useState(todayStr());
  const [rows, setRows] = useState<Assignment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [employees, setEmployees] = useState<EmployeeOption[] | null>(null);

  function load() {
    apiGet<Assignment[]>('/work-assignments', { date })
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load assignments.'));
  }

  useEffect(load, [date]);

  useEffect(() => {
    if (canEdit && !employees) {
      apiGet<EmployeeOption[]>('/employees').then(setEmployees).catch(() => {});
    }
  }, [canEdit, employees]);

  async function handleDelete(id: string) {
    try {
      await apiDelete(`/work-assignments/${id}`);
      setRows((prev) => prev?.filter((r) => r.id !== id) ?? prev);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Delete failed.');
    }
  }

  return (
    <div className="px-4 py-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">Work Assignments</h1>
        {canEdit && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-md bg-brand-500 px-3 py-1.5 text-sm font-medium text-white"
          >
            {showForm ? 'Close' : '+ New'}
          </button>
        )}
      </div>

      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="mb-4 rounded-md border border-surface-light bg-surface px-3 py-2 text-sm text-slate-100"
      />

      {showForm && employees && (
        <NewAssignmentForm
          employees={employees}
          onCreated={() => {
            setShowForm(false);
            load();
          }}
          onError={setError}
        />
      )}

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      {!error && !rows && <p className="text-sm text-slate-400">Loading…</p>}

      <ul className="space-y-2">
        {rows?.map((r) => (
          <li key={r.id} className="rounded-lg border border-surface-light bg-surface p-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-slate-100">{r.employee.name}</p>
                <p className="text-xs text-slate-400">
                  {r.employee.empCode} · <span className="capitalize">{r.workType}</span> · {r.fromDate} →{' '}
                  {r.toDate}
                </p>
                {r.notes && <p className="mt-1 text-xs text-slate-500">{r.notes}</p>}
              </div>
              {canEdit && (
                <button onClick={() => void handleDelete(r.id)} className="text-xs text-danger underline">
                  Remove
                </button>
              )}
            </div>
          </li>
        ))}
        {rows && rows.length === 0 && <p className="text-sm text-slate-400">No assignments for this date.</p>}
      </ul>
    </div>
  );
}

function NewAssignmentForm({
  employees,
  onCreated,
  onError,
}: {
  employees: EmployeeOption[];
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? '');
  const [workType, setWorkType] = useState<'tour' | 'wfh'>('tour');
  const [fromDate, setFromDate] = useState(todayStr());
  const [toDate, setToDate] = useState(todayStr());
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await apiPost('/work-assignments', { employeeId, workType, fromDate, toDate, notes: notes || undefined });
      onCreated();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not create assignment.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 space-y-3 rounded-lg border border-surface-light bg-surface p-3">
      <select
        value={employeeId}
        onChange={(e) => setEmployeeId(Number(e.target.value))}
        className="w-full rounded-md border border-surface-light bg-surface-bg px-3 py-2 text-sm text-slate-100"
      >
        {employees.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name} ({e.empCode})
          </option>
        ))}
      </select>

      <div className="flex gap-2">
        <select
          value={workType}
          onChange={(e) => setWorkType(e.target.value as 'tour' | 'wfh')}
          className="flex-1 rounded-md border border-surface-light bg-surface-bg px-3 py-2 text-sm text-slate-100"
        >
          <option value="tour">Tour</option>
          <option value="wfh">WFH</option>
        </select>
      </div>

      <div className="flex gap-2">
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="flex-1 rounded-md border border-surface-light bg-surface-bg px-3 py-2 text-sm text-slate-100"
        />
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="flex-1 rounded-md border border-surface-light bg-surface-bg px-3 py-2 text-sm text-slate-100"
        />
      </div>

      <input
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="w-full rounded-md border border-surface-light bg-surface-bg px-3 py-2 text-sm text-slate-100"
      />

      <button
        disabled={busy}
        onClick={() => void submit()}
        className="w-full rounded-md bg-brand-500 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Create Assignment'}
      </button>
    </div>
  );
}
