import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Calendar } from 'lucide-react';
import { apiGet, rootApiGet } from '../../lib/api';
import { useAuth } from '../../lib/auth';

interface TodayAttendance {
  checkIn: string | null;
  checkOut: string | null;
  hoursWorked: number;
  status: string;
}

interface TodayStatus {
  workType: 'office' | 'tour' | 'wfh';
  assignment: { notes: string | null } | null;
  todayAttendance: TodayAttendance | null;
}

interface LeaveBalance {
  annual: number;
  sick: number;
  casual: number;
}

interface RequestRow {
  id: string;
  status: string;
}

interface Announcement {
  id: string;
  message: string;
  createdAt: string;
}

interface Holiday {
  id: string;
  date: string;
  name: string;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [status, setStatus] = useState<TodayStatus | null>(null);
  const [leave, setLeave] = useState<LeaveBalance | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [nextHoliday, setNextHoliday] = useState<Holiday | null>(null);

  useEffect(() => {
    apiGet<TodayStatus>('/today-status').then(setStatus).catch(() => {});
    apiGet<LeaveBalance>('/leave-balance').then(setLeave).catch(() => {});
    apiGet<RequestRow[]>('/requests', { status: 'pending' })
      .then((rows) => setPendingCount(rows.length))
      .catch(() => {});
    rootApiGet<Announcement[]>('/announcements')
      .then((rows) => setAnnouncement(rows[0] ?? null))
      .catch(() => {});

    const year = new Date().getFullYear();
    Promise.all([
      rootApiGet<Holiday[]>('/holidays', { year }),
      rootApiGet<Holiday[]>('/holidays', { year: year + 1 }),
    ])
      .then(([a, b]) => {
        const today = new Date().toISOString().slice(0, 10);
        const upcoming = [...a, ...b].filter((h) => h.date >= today).sort((x, y) => x.date.localeCompare(y.date));
        setNextHoliday(upcoming[0] ?? null);
      })
      .catch(() => {});
  }, []);

  const att = status?.todayAttendance;
  const isWorking = Boolean(att?.checkIn && !att?.checkOut);
  const canMarkFromPhone = status?.workType === 'tour' || status?.workType === 'wfh';

  return (
    <div className="flex min-h-full flex-col px-5 pb-4" style={{ paddingTop: '52px' }}>
      <div className="mb-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-[15px] font-bold text-white">
            {user?.name?.[0] ?? '?'}
          </div>
          <div>
            <p className="text-xs text-slate-400">{greeting()}</p>
            <p className="text-base font-bold text-slate-100">{user?.name}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
        </div>
      </div>

      {/* Check-in card */}
      <div className="relative mb-3.5 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${isWorking ? 'bg-green-400' : 'bg-slate-300'}`} />
            <span className="text-xs font-bold text-white">
              {att?.checkOut ? 'CHECKED OUT' : isWorking ? 'WORKING' : 'NOT CHECKED IN'}
            </span>
          </div>
        </div>
        {att?.checkIn ? (
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="mb-0.5 text-[11px] text-sky-100">CHECKED IN AT</p>
              <p className="text-xl font-bold text-white">{att.checkIn}</p>
            </div>
            <div className="text-right">
              <p className="mb-0.5 text-[11px] text-sky-100">HOURS TODAY</p>
              <p className="text-xl font-bold text-white">{att.hoursWorked.toFixed(1)}h</p>
            </div>
          </div>
        ) : (
          <p className="mb-4 text-sm text-sky-100">
            {status?.workType === 'office'
              ? 'Mark attendance at the office machine.'
              : 'You can mark attendance from your phone today.'}
          </p>
        )}
        {canMarkFromPhone && !att?.checkIn && (
          <button
            onClick={() => navigate('/attendance')}
            className="w-full rounded-xl bg-white py-3 text-sm font-bold text-brand-700"
          >
            Mark Attendance
          </button>
        )}
      </div>

      {/* quick stats */}
      <div className="mb-3.5 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-surface-light bg-surface p-2.5 text-center">
          <p className="text-lg font-bold text-slate-100">{pendingCount ?? '—'}</p>
          <p className="text-[10px] text-slate-400">Pending tasks</p>
        </div>
        <div className="rounded-xl border border-surface-light bg-surface p-2.5 text-center">
          <p className="text-lg font-bold text-slate-100">
            {leave ? `${leave.casual} / ${leave.sick}` : '—'}
          </p>
          <p className="text-[10px] text-slate-400">CL / SL left</p>
        </div>
        <div className="rounded-xl border border-surface-light bg-surface p-2.5 text-center">
          <p className="text-lg font-bold text-slate-100">{leave?.annual ?? '—'}</p>
          <p className="text-[10px] text-slate-400">Annual left</p>
        </div>
      </div>

      {announcement && (
        <div className="mb-3.5 flex items-start gap-3 rounded-xl border border-surface-light bg-surface p-3.5">
          <Bell size={17} className="mt-0.5 flex-shrink-0 text-warning" />
          <div>
            <p className="text-[13px] font-semibold text-slate-100">{announcement.message}</p>
            <p className="mt-0.5 text-[11.5px] text-slate-400">
              {new Date(announcement.createdAt).toLocaleDateString('en-IN')}
            </p>
          </div>
        </div>
      )}

      {nextHoliday && (
        <div className="flex items-center gap-3 rounded-xl border border-surface-light bg-surface p-3.5">
          <Calendar size={17} className="flex-shrink-0 text-purple-400" />
          <div>
            <p className="text-[13px] font-semibold text-slate-100">{nextHoliday.name}</p>
            <p className="text-[11.5px] text-slate-400">
              Next holiday &middot; {new Date(nextHoliday.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
