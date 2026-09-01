import { useEffect, useState } from 'react';
import { apiGet, ApiError } from '../../lib/api';

interface Analytics {
  sevenDayTrend: { date: string; present: number; total: number }[];
  departmentBreakdown: { dept: string; total: number; present: number }[];
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Analytics>('/analytics')
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load analytics.'));
  }, []);

  return (
    <div className="px-4 py-4">
      <h1 className="mb-4 text-lg font-semibold text-slate-100">Analytics</h1>

      {error && <p className="text-sm text-danger">{error}</p>}
      {!error && !data && <p className="text-sm text-slate-400">Loading…</p>}

      {data && (
        <>
          <h2 className="mb-2 text-sm font-medium text-slate-300">Last 7 days</h2>
          <div className="mb-6 flex items-end gap-2" style={{ height: 120 }}>
            {data.sevenDayTrend.map((d) => {
              const pct = d.total > 0 ? Math.round((d.present / d.total) * 100) : 0;
              return (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t bg-brand-500"
                      style={{ height: `${Math.max(pct, 4)}%` }}
                      title={`${d.present}/${d.total}`}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500">{d.date.slice(5)}</span>
                </div>
              );
            })}
          </div>

          <h2 className="mb-2 text-sm font-medium text-slate-300">Today by department</h2>
          <ul className="space-y-2">
            {data.departmentBreakdown.map((d) => (
              <li key={d.dept} className="rounded-lg border border-surface-light bg-surface p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-100">{d.dept}</span>
                  <span className="text-slate-400">
                    {d.present}/{d.total}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-surface-light">
                  <div
                    className="h-1.5 rounded-full bg-brand-500"
                    style={{ width: `${d.total > 0 ? (d.present / d.total) * 100 : 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
