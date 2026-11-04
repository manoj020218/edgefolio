import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Bell, Calendar, CalendarDays, CloudOff, Download, PartyPopper, RefreshCw, ClipboardList, Umbrella, CalendarCheck } from 'lucide-react';
import { apiGet, apiPost, rootApiGet, isCloudModeSync } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useAuth } from '../../lib/auth';
import { useNetworkStatus } from '../../lib/network';
import { enqueue } from '../../lib/offlineQueue';
import { celebrate } from '../../lib/feedback';
import AttendanceCalendarDrawer from '../../components/AttendanceCalendarDrawer';
import NotificationBell from '../../components/NotificationBell';

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
  // Cloud mode also allows office punches (see App.tsx AttendanceRoute).
  const canMarkFromPhone = status?.workType === 'tour' || status?.workType === 'wfh' || (status?.workType === 'office' && isCloudModeSync());

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
      celebrate('offline');
      setCheckingOut(false);
      return;
    }

    try {
      await apiPost('/attendance/checkout', { timestamp });
      celebrate('success');
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
    <div className="animate-enter flex min-h-full flex-col px-5 pb-4" style={{ paddingTop: '52px' }}>
      <div className="mb-3.5 flex items-center justify-between">
        <button onClick={() => navigate('/profile')} className="flex items-center gap-3 text-left">
          <div className="relative h-[42px] w-[42px] flex-shrink-0">
            {faceEnrolled === true && (
              <div
                className="absolute -inset-[3px] animate-spin rounded-full"
                style={{
                  background: 'conic-gradient(from 0deg, transparent 0%, #a5b4fc 12%, transparent 28%)',
                  animationDuration: '2.4s',
                }}
              />
            )}
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-brand text-[15px] font-bold text-white ring-2 ring-surface-bg">
              {user?.name?.[0] ?? '?'}
            </div>
            {faceEnrolled === false && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 ring-2 ring-surface-bg">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
              </span>
            )}
          </div>
          <div>
            <p className="text-xs text-[#9aa0b8]">{greeting()}</p>
            <p className="text-base font-extrabold tracking-tight text-[#f4f5fb]">{user?.name}</p>
          </div>
        </button>
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={() => setCalendarOpen(true)} className="glass !rounded-2xl px-3 py-1.5 text-right active:scale-[0.97]">
            <p className="text-sm font-bold tabular-nums text-[#f4f5fb]">
              {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })}
            </p>
            <p className="text-xs text-slate-400">
              {now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Kolkata' })}
            </p>
          </button>
          <NotificationBell className="!h-10 !w-10" />
          <button
            onClick={() => setCalendarOpen(true)}
            className="btn-ghost h-10 w-10 flex-shrink-0 !rounded-full text-slate-200"
          >
            <CalendarDays size={16} />
          </button>
        </div>
      </div>

      {/* EDGE is a PC on the local network, not a cloud service — this reflects
          whether it actually answered just now, not just whether the phone has
          any network at all (see lib/network.tsx). */}
      <div
        className={`mb-3.5 flex w-fit max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
          netStatus === 'offline'
            ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
            : 'border-white/[0.08] bg-white/[0.045] text-[#9aa0b8]'
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
            <span className="h-2 w-2 flex-shrink-0 rounded-full bg-success shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <span>Online</span>
          </>
        )}
      </div>

      {/* Check-in card */}
      <div className="animate-enter delay-1 relative mb-3.5 overflow-hidden rounded-4xl bg-brand p-5 shadow-glow">
        <div className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-white/15" />
        <div className="pointer-events-none absolute -bottom-16 -left-8 h-40 w-40 rounded-full bg-white/10" />
        <div className="relative mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 rounded-full bg-black/25 px-3 py-1.5">
            <span className={`h-2 w-2 rounded-full ${isWorking ? 'animate-pulse-ring bg-success' : 'bg-slate-300'}`} />
            <span className="text-[11px] font-bold tracking-wider text-white">
              {isWorking ? 'WORKING' : att?.checkOut ? 'CHECKED OUT' : 'NOT CHECKED IN'}
            </span>
          </div>
        </div>
        {att?.checkIn ? (
          <div className="relative mb-4 flex items-end justify-between">
            <div>
              <p className="label-caps mb-0.5 !text-white/80">CHECKED IN AT</p>
              <p className="text-4xl font-extrabold tabular-nums tracking-tight text-white">{att.checkIn}</p>
            </div>
            <div className="text-right">
              <p className="label-caps mb-0.5 !text-white/80">HOURS TODAY</p>
              <p className="text-4xl font-extrabold tabular-nums tracking-tight text-white">{att.hoursWorked.toFixed(1)}h</p>
            </div>
          </div>
        ) : (
          <p className="relative mb-4 text-sm text-white/90">
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
            className="relative w-full rounded-full bg-white py-3.5 text-sm font-bold text-brand-700 shadow-lg transition duration-150 active:scale-[0.97]"
          >
            {att?.checkIn ? 'Check In Again' : 'Mark Attendance'}
          </button>
        )}
        {isWorking && (
          <button
            onClick={() => void handleCheckOut()}
            disabled={checkingOut || queuedCheckout}
            className="relative w-full rounded-full bg-white py-3.5 text-sm font-bold text-brand-700 shadow-lg transition duration-150 active:scale-[0.97] disabled:opacity-60"
          >
            {queuedCheckout ? 'Saved — will sync when online' : checkingOut ? 'Checking out…' : 'Check Out'}
          </button>
        )}
        {checkOutError && <p className="relative mt-2 text-xs text-red-100">{checkOutError}</p>}
      </div>

      {/* quick stats */}
      <div className="mb-3.5 grid grid-cols-3 gap-2">
        <div className="glass animate-enter delay-2 p-3 text-center">
          <div className="mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-xl bg-warning/15 text-warning"><ClipboardList size={16} /></div>
          <p className="text-lg font-extrabold tabular-nums text-[#f4f5fb]">{pendingCount ?? '—'}</p>
          <p className="text-[10px] text-[#9aa0b8]">Pending tasks</p>
        </div>
        <div className="glass animate-enter delay-3 p-3 text-center">
          <div className="mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-xl bg-info/15 text-info"><Umbrella size={16} /></div>
          <p className="text-lg font-extrabold tabular-nums text-[#f4f5fb]">
            {leave ? `${leave.casual} / ${leave.sick}` : '—'}
          </p>
          <p className="text-[10px] text-[#9aa0b8]">CL / SL left</p>
        </div>
        <div className="glass animate-enter delay-4 p-3 text-center">
          <div className="mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-xl bg-success/15 text-success"><CalendarCheck size={16} /></div>
          <p className="text-lg font-extrabold tabular-nums text-[#f4f5fb]">{leave?.annual ?? '—'}</p>
          <p className="text-[10px] text-[#9aa0b8]">Annual left</p>
        </div>
      </div>

      {announcement && (() => {
        const style = ANNOUNCEMENT_STYLES[announcement.type] ?? ANNOUNCEMENT_STYLES.general;
        const Icon = style.icon;
        return (
          <div className="glass animate-enter delay-5 mb-3.5 flex items-start gap-3 p-3.5">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white/[0.08]">
              <Icon size={17} className={style.iconClass} />
            </div>
            <div>
              <p className="label-caps">{style.label}</p>
              <p className="text-[13px] font-semibold text-slate-100">{announcement.message}</p>
              <p className="mt-0.5 text-[11.5px] text-slate-400">
                {formatDateTime(announcement.createdAt)}
              </p>
            </div>
          </div>
        );
      })()}

      {nextHoliday && (
        <div className="glass animate-enter delay-5 flex items-center gap-3 p-3.5">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-purple-400/15">
            <Calendar size={17} className="text-purple-400" />
          </div>
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
