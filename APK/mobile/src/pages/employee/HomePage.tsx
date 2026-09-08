import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Bell, Calendar, CalendarDays, CloudOff, Download, PartyPopper, RefreshCw } from 'lucide-react';
import { apiGet, apiPost, rootApiGet } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useAuth } from '../../lib/auth';
import { useNetworkStatus } from '../../lib/network';
import { enqueue } from '../../lib/offlineQueue';
import AttendanceCalendarDrawer from '../../components/AttendanceCalendarDrawer';

interface TodayAttendance {
  checkIn: string | null;
  checkOut: string | null;
  hoursWorked: number;
  status: string;
  currentlyWorking: boolean;
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
  type: string;
  message: string;
  createdAt: string;
}

const ANNOUNCEMENT_STYLES: Record<string, { icon: typeof Bell; iconClass: string; label: string }> = {
  sos: { icon: AlertTriangle, iconClass: 'text-danger', label: 'Urgent' },
  holiday: { icon: PartyPopper, iconClass: 'text-purple-400', label: 'Holiday Notice' },
  app_update: { icon: Download, iconClass: 'text-brand-400', label: 'App Update' },
  event: { icon: Bell, iconClass: 'text-warning', label: 'Announcement' },
  general: { icon: Bell, iconClass: 'text-warning', label: 'Notice' },
};

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
  const [now, setNow] = useState(new Date());
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkOutError, setCheckOutError] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [faceEnrolled, setFaceEnrolled] = useState<boolean | null>(null);
  const [queuedCheckout, setQueuedCheckout] = useState(false);
  const { status: netStatus, pendingCount: syncPendingCount, syncing } = useNetworkStatus();

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  function refreshStatus() {
    apiGet<TodayStatus>('/today-status').then(setStatus).catch(() => {});
  }

  // Once EDGE is reachable again, NetworkStatusProvider has already replayed
  // the offline queue by the time `netStatus` flips to 'online' — refetch so
  // this screen picks up the real, server-computed first-in/last-out state
  // instead of the optimistic "queued" placeholder.
  useEffect(() => {
    if (netStatus === 'online') {
      setQueuedCheckout(false);
      refreshStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [netStatus]);

  useEffect(() => {
    refreshStatus();
    apiGet<{ enrolled: boolean }>('/faces/self-enroll').then((r) => setFaceEnrolled(r.enrolled)).catch(() => {});
    apiGet<LeaveBalance>('/leave-balance').then(setLeave).catch(() => {});
    apiGet<RequestRow[]>('/requests', { status: 'pending' })
      .then((rows) => setPendingCount(rows.length))
      .catch(() => {});
    // target scopes a private/targeted announcement to this employee — the API
    // returns rows where target is 'all' or matches this param (see
    // EDGE/backend/controllers/announcementController.js).
    rootApiGet<Announcement[]>('/announcements', { target: user?.empId })
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
  // "Currently working" is the latest punch's direction, not just whether
  // check_out is empty — the day's check_out holds the LAST checkout even
  // after a re-check-in, so it alone can't tell an open cycle from a closed
  // one (see backend/controllers/apkController.js getTodayStatusHandler).
  const isWorking = Boolean(att?.currentlyWorking);
  const canMarkFromPhone = status?.workType === 'tour' || status?.workType === 'wfh';

  async function handleCheckOut() {
    setCheckingOut(true);
    setCheckOutError(null);
    const timestamp = new Date().toISOString();

    if (netStatus === 'offline') {
      // No network round-trip possible — save locally and let
      // NetworkStatusProvider replay it once EDGE answers /health again.
      // queuedCheckout (not a server round-trip) is what keeps this button
      // from re-queuing a second checkout on a repeat tap before that sync
      // happens.
      await enqueue({ kind: 'checkout', id: crypto.randomUUID(), queuedAt: timestamp, payload: { timestamp } });
      setQueuedCheckout(true);
      setCheckingOut(false);
      return;
    }

    try {
      await apiPost('/attendance/checkout', { timestamp });
      refreshStatus();
    } catch (err) {
      // The screen's WORKING/not-working state can go stale if attendance was
      // changed elsewhere (desktop edit, another device) since the last
      // fetch — re-sync now so the buttons reflect reality instead of
      // repeating the same failing tap.
      refreshStatus();
      setCheckOutError(err instanceof Error ? err.message : 'Check-out failed.');
    } finally {
      setCheckingOut(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col px-5 pb-4" style={{ paddingTop: '52px' }}>
      <div className="mb-3.5 flex items-center justify-between">
        <button onClick={() => navigate('/profile')} className="flex items-center gap-3 text-left">
          <div className="relative h-[42px] w-[42px] flex-shrink-0">
            {faceEnrolled === true && (
              <div
                className="absolute -inset-[3px] animate-spin rounded-full"
                style={{
                  background: 'conic-gradient(from 0deg, transparent 0%, #38bdf8 12%, transparent 28%)',
                  animationDuration: '2.4s',
                }}
              />
            )}
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-[15px] font-bold text-white ring-2 ring-surface-bg">
              {user?.name?.[0] ?? '?'}
            </div>
            {faceEnrolled === false && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 ring-2 ring-surface-bg">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
              </span>
            )}
          </div>
          <div>
            <p className="text-xs text-slate-400">{greeting()}</p>
            <p className="text-base font-bold text-slate-100">{user?.name}</p>
          </div>
        </button>
        <div className="flex items-center gap-2.5">
          <div className="text-right">
            <p className="text-sm font-bold tabular-nums text-slate-100">
              {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })}
            </p>
            <p className="text-xs text-slate-400">
              {now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Kolkata' })}
            </p>
          </div>
          <button
            onClick={() => setCalendarOpen(true)}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-surface-light bg-surface text-slate-300"
          >
            <CalendarDays size={16} />
          </button>
        </div>
      </div>

      {/* EDGE is a PC on the local network, not a cloud service — this reflects
          whether it actually answered just now, not just whether the phone has
          any network at all (see lib/network.tsx). */}
      <div
        className={`mb-3.5 flex items-center gap-2 rounded-xl border p-2.5 text-xs font-medium ${
          netStatus === 'offline'
            ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
            : 'border-surface-light bg-surface text-slate-400'
        }`}
      >
        {netStatus === 'offline' ? (
          <>
            <CloudOff size={14} className="flex-shrink-0" />
            <span>
              Offline — can&rsquo;t reach EDGE.
              {syncPendingCount > 0 && ` ${syncPendingCount} action${syncPendingCount === 1 ? '' : 's'} saved, will sync.`}
            </span>
          </>
        ) : syncing ? (
          <>
            <RefreshCw size={14} className="flex-shrink-0 animate-spin" />
            <span>Back online — syncing {syncPendingCount || ''}…</span>
          </>
        ) : netStatus === 'checking' ? (
          <>
            <RefreshCw size={14} className="flex-shrink-0 animate-spin" />
            <span>Checking connection…</span>
          </>
        ) : (
          <>
            <span className="h-2 w-2 flex-shrink-0 rounded-full bg-green-400" />
            <span>Online</span>
          </>
        )}
      </div>

      {/* Check-in card */}
      <div className="relative mb-3.5 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${isWorking ? 'bg-green-400' : 'bg-slate-300'}`} />
            <span className="text-xs font-bold text-white">
              {isWorking ? 'WORKING' : att?.checkOut ? 'CHECKED OUT' : 'NOT CHECKED IN'}
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
            {status === null
              ? 'Loading…'
              : canMarkFromPhone
                ? 'You can mark attendance from your phone today.'
                : 'Mark attendance at the office machine.'}
          </p>
        )}
        {canMarkFromPhone && !isWorking && (
          <button
            onClick={() => navigate('/attendance')}
            className="w-full rounded-xl bg-white py-3 text-sm font-bold text-brand-700"
          >
            {att?.checkIn ? 'Check In Again' : 'Mark Attendance'}
          </button>
        )}
        {isWorking && (
          <button
            onClick={() => void handleCheckOut()}
            disabled={checkingOut || queuedCheckout}
            className="w-full rounded-xl bg-white py-3 text-sm font-bold text-brand-700 disabled:opacity-60"
          >
            {queuedCheckout ? 'Saved — will sync when online' : checkingOut ? 'Checking out…' : 'Check Out'}
          </button>
        )}
        {checkOutError && <p className="mt-2 text-xs text-red-100">{checkOutError}</p>}
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

      {announcement && (() => {
        const style = ANNOUNCEMENT_STYLES[announcement.type] ?? ANNOUNCEMENT_STYLES.general;
        const Icon = style.icon;
        return (
          <div className="mb-3.5 flex items-start gap-3 rounded-xl border border-surface-light bg-surface p-3.5">
            <Icon size={17} className={`mt-0.5 flex-shrink-0 ${style.iconClass}`} />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{style.label}</p>
              <p className="text-[13px] font-semibold text-slate-100">{announcement.message}</p>
              <p className="mt-0.5 text-[11.5px] text-slate-400">
                {formatDateTime(announcement.createdAt)}
              </p>
            </div>
          </div>
        );
      })()}

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

      <AttendanceCalendarDrawer open={calendarOpen} onClose={() => setCalendarOpen(false)} />
    </div>
  );
}
