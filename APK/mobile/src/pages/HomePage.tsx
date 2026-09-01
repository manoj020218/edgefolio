import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { apiGet, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import AttendancePage from './AttendancePage';

interface TodayStatus {
  workType: 'office' | 'tour' | 'wfh';
  assignment: { id: number; fromDate: string; toDate: string; notes: string | null } | null;
}

export default function HomePage() {
  const { user, logout } = useAuth();
  const [status, setStatus] = useState<TodayStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    apiGet<TodayStatus>('/today-status')
      .then(setStatus)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load today’s status.'));
  }, []);

  const canMarkFromPhone = status?.workType === 'tour' || status?.workType === 'wfh';

  if (marking && canMarkFromPhone) {
    return <AttendancePage workType={status!.workType as 'tour' | 'wfh'} onBack={() => setMarking(false)} />;
  }

  return (
    <div className="flex min-h-full flex-col px-6 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-300">Welcome back,</p>
          <h1 className="text-xl font-semibold text-slate-100">{user?.name}</h1>
          <p className="text-xs text-slate-400">
            {user?.empCode} · {user?.role}
          </p>
        </div>
        <button
          onClick={() => void logout()}
          className="rounded-md p-2 text-slate-300 hover:bg-surface hover:text-slate-100"
          aria-label="Sign out"
        >
          <LogOut size={20} />
        </button>
      </div>

      <div className="rounded-lg border border-surface-light bg-surface p-4">
        <p className="text-sm text-slate-300">Today&rsquo;s work type</p>
        {error && <p className="mt-1 text-sm text-danger">{error}</p>}
        {!error && !status && <p className="mt-1 text-sm text-slate-400">Loading…</p>}
        {status && (
          <>
            <p className="mt-1 text-lg font-medium capitalize text-slate-100">{status.workType}</p>
            {status.assignment?.notes && (
              <p className="mt-1 text-sm text-slate-400">{status.assignment.notes}</p>
            )}
          </>
        )}
      </div>

      <div className="mt-6">
        {canMarkFromPhone ? (
          <div className="rounded-lg border border-brand-700 bg-surface p-4">
            <p className="mb-3 text-sm text-slate-300">
              You&rsquo;re assigned to <span className="font-medium capitalize">{status?.workType}</span>{' '}
              today — mobile attendance is available.
            </p>
            <button
              onClick={() => setMarking(true)}
              className="w-full rounded-md bg-brand-500 py-2.5 font-medium text-white transition hover:bg-brand-600"
            >
              Mark Attendance
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-surface-light bg-surface p-4">
            <p className="text-sm text-slate-300">
              Mobile attendance isn&rsquo;t enabled for today. Use the office attendance machine.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
