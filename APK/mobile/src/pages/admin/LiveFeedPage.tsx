import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Megaphone } from 'lucide-react';
import { apiGet, ApiError } from '../../lib/api';

interface FeedEntry {
  empId: number;
  empCode: string;
  name: string;
  dept: string | null;
  designation: string | null;
  workType: string;
  checkinTime: string | null;
  checkoutTime: string | null;
  hoursWorked: number;
  status: string;
}

interface LiveFeed {
  summary: { totalEmployees: number; present: number; onTour: number; wfh: number; absent: number };
  feed: FeedEntry[];
}

export default function LiveFeedPage() {
  const [data, setData] = useState<LiveFeed | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<LiveFeed>('/live-feed')
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load the live feed.'));
  }, []);

  return (
    <div className="px-4 py-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">Today</h1>
        <Link
          to="/admin/broadcast"
          className="flex items-center gap-1.5 rounded-md bg-brand-500 px-3 py-1.5 text-sm font-medium text-white"
        >
          <Megaphone size={16} /> Broadcast
        </Link>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {!error && !data && <p className="text-sm text-slate-400">Loading…</p>}

      {data && (
        <>
          <div className="mb-4 grid grid-cols-4 gap-2">
            <Stat label="Present" value={data.summary.present} />
            <Stat label="On Tour" value={data.summary.onTour} />
            <Stat label="WFH" value={data.summary.wfh} />
            <Stat label="Absent" value={data.summary.absent} />
          </div>

          <ul className="space-y-2">
            {data.feed.map((r) => (
              <li key={r.empId} className="rounded-lg border border-surface-light bg-surface p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-100">{r.name}</p>
                    <p className="text-xs text-slate-400">
                      {r.empCode} · {r.dept || 'No dept'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-200">{r.checkinTime || '—'}</p>
                    <p className="text-xs capitalize text-slate-500">{r.workType.replace('mobile-', '')}</p>
                  </div>
                </div>
              </li>
            ))}
            {data.feed.length === 0 && <p className="text-sm text-slate-400">No check-ins yet today.</p>}
          </ul>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-surface-light bg-surface p-2 text-center">
      <p className="text-lg font-semibold text-slate-100">{value}</p>
      <p className="text-[11px] text-slate-400">{label}</p>
    </div>
  );
}
