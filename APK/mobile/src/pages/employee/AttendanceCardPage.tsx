import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarOff, CheckCircle2, ChevronLeft, ChevronRight, Clock, PartyPopper, TreePalm, XCircle } from 'lucide-react';
import { apiGet } from '../../lib/api';
import { useAuth } from '../../lib/auth';

interface DayRecord {
  date: string;
  status: string;
  checkIn: string | null;
  checkOut: string | null;
  hoursWorked: number;
  leaveType: string | null;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function AttendanceCardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cursor, setCursor] = useState(() => new Date());
  const [records, setRecords] = useState<DayRecord[] | null>(null);

  const key = monthKey(cursor);

  useEffect(() => {
    setRecords(null);
    apiGet<DayRecord[]>('/attendance-calendar', { month: key })
      .then(setRecords)
      .catch(() => setRecords([]));
  }, [key]);

  const summary = useMemo(() => {
    const rows = records ?? [];
    return {
      present: rows.filter((r) => r.status === 'present').length,
      absent: rows.filter((r) => r.status === 'absent').length,
      leave: rows.filter((r) => r.status === 'leave').length,
      holiday: rows.filter((r) => r.status === 'holiday').length,
      weeklyOff: rows.filter((r) => r.status === 'weekly_off').length,
      hours: rows.reduce((sum, r) => sum + (r.hoursWorked || 0), 0),
    };
  }, [records]);

  return (
    <div className="px-5 pb-8" style={{ paddingTop: '52px' }}>
      <button onClick={() => navigate(-1)} className="mb-5 flex items-center gap-1 text-sm font-medium text-slate-300">
        <ChevronLeft size={18} /> Back
      </button>
      <h1 className="mb-5 text-xl font-bold text-slate-100">Attendance Card</h1>

      <div className="mb-5 flex items-center justify-between rounded-xl border border-surface-light bg-surface p-2">
        <button onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))} className="rounded-full p-2 text-slate-300">
          <ChevronLeft size={16} />
        </button>
        <p className="text-[14.5px] font-semibold text-slate-100">
          {cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
        </p>
        <button onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))} className="rounded-full p-2 text-slate-300">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="mb-5 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-base font-bold text-white">{user?.name}</p>
            <p className="text-[11.5px] text-sky-100">
              {user?.empCode} &middot; {user?.department}
            </p>
          </div>
          <p className="text-[11.5px] font-semibold text-sky-100">
            {cursor.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
          </p>
        </div>

        {records === null ? (
          <p className="text-sm text-sky-100">Loading…</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-white/10 p-2.5 text-center">
              <CheckCircle2 size={16} className="mx-auto mb-1 text-white" />
              <p className="text-lg font-bold text-white">{summary.present}</p>
              <p className="text-[10px] text-sky-100">Present</p>
            </div>
            <div className="rounded-xl bg-white/10 p-2.5 text-center">
              <XCircle size={16} className="mx-auto mb-1 text-white" />
              <p className="text-lg font-bold text-white">{summary.absent}</p>
              <p className="text-[10px] text-sky-100">Absent</p>
            </div>
            <div className="rounded-xl bg-white/10 p-2.5 text-center">
              <TreePalm size={16} className="mx-auto mb-1 text-white" />
              <p className="text-lg font-bold text-white">{summary.leave}</p>
              <p className="text-[10px] text-sky-100">Leave</p>
            </div>
            <div className="rounded-xl bg-white/10 p-2.5 text-center">
              <PartyPopper size={16} className="mx-auto mb-1 text-white" />
              <p className="text-lg font-bold text-white">{summary.holiday}</p>
              <p className="text-[10px] text-sky-100">Holiday</p>
            </div>
            <div className="rounded-xl bg-white/10 p-2.5 text-center">
              <CalendarOff size={16} className="mx-auto mb-1 text-white" />
              <p className="text-lg font-bold text-white">{summary.weeklyOff}</p>
              <p className="text-[10px] text-sky-100">Weekly Off</p>
            </div>
            <div className="rounded-xl bg-white/10 p-2.5 text-center">
              <Clock size={16} className="mx-auto mb-1 text-white" />
              <p className="text-lg font-bold text-white">{summary.hours.toFixed(0)}h</p>
              <p className="text-[10px] text-sky-100">Hours</p>
            </div>
          </div>
        )}
      </div>

      <p className="mb-2.5 text-[11px] font-bold tracking-wide text-slate-500">DAY-WISE DETAIL</p>
      <div className="flex flex-col gap-2">
        {records?.length === 0 && <p className="text-sm text-slate-400">No attendance recorded this month.</p>}
        {records?.map((r) => (
          <div key={r.date} className="flex items-center justify-between rounded-xl border border-surface-light bg-surface p-3.5">
            <span className="text-[13.5px] font-medium text-slate-100">
              {new Date(r.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
            {r.status === 'leave' ? (
              <span className="text-xs font-medium text-orange-400">{r.leaveType ? `${r.leaveType} leave` : 'Leave'}</span>
            ) : r.status === 'absent' ? (
              <span className="text-xs font-medium text-red-400">Absent</span>
            ) : r.status === 'holiday' ? (
              <span className="text-xs font-medium text-purple-400">Holiday</span>
            ) : r.status === 'weekly_off' ? (
              <span className="text-xs font-medium text-slate-400">Weekly Off</span>
            ) : (
              <span className="text-xs text-slate-400">
                {r.checkIn ?? '—'} &rarr; {r.checkOut ?? '—'}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
