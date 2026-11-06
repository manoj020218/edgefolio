import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, LogIn, LogOut, X } from 'lucide-react';
import { apiGetFull } from '../lib/api';

type Status = 'present' | 'incomplete' | 'leave' | 'holiday' | 'weekly_off' | 'absent';

interface DayRecord {
  date: string; // YYYY-MM-DD
  status: Status;
  checkIn: string | null;
  checkOut: string | null;
  overnight?: boolean;
  grossMinutes?: number;
  breakMinutes?: number;
  netMinutes?: number;
  netHours?: number;
  worked_on_off_day?: boolean;
  holidayName?: string | null;
  leaveType?: string | null;
  late?: boolean;
  lateMinutes?: number;
  early?: boolean;
  earlyMinutes?: number;
}

interface Summary {
  present: number;
  incomplete: number;
  absent: number;
  leave: number;
  holidays: number;
  weeklyOffs: number;
  netMinutes: number;
  netHours: number;
  lateDays?: number;
  lateMinutes?: number;
  earlyDays?: number;
  earlyMinutes?: number;
}

interface ShiftMeta {
  id?: number | string;
  name: string;
  start: string;
  end: string;
  breakStart?: string | null;
  breakEnd?: string | null;
  breakPaid?: boolean;
  weeklyOff?: number[];
}

interface MonthData {
  days: Record<string, DayRecord>;
  summary: Summary | null;
  shift: ShiftMeta | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Admins can view another employee's calendar. */
  empId?: string | number;
}

const DOT: Record<Status, string> = {
  present: 'bg-green-400',
  incomplete: 'bg-orange-400',
  absent: 'bg-red-400',
  leave: 'bg-blue-400',
  holiday: 'bg-purple-400',
  weekly_off: 'bg-slate-500',
};

const LABEL: Record<Status, string> = {
  present: 'Present',
  incomplete: 'Incomplete',
  absent: 'Absent',
  leave: 'On leave',
  holiday: 'Holiday',
  weekly_off: 'Weekly off',
};

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function dateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Accepts "HH:MM", "HH:MM:SS" or an ISO timestamp.
function fmtTime(v: string | null | undefined): string {
  if (!v) return '—';
  if (v.includes('T')) {
    const d = new Date(v);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
    }
  }
  return v.slice(0, 5);
}

function fmtMinutes(min: number | undefined | null): string {
  const m = Math.max(0, Math.round(min ?? 0));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

export default function AttendanceCalendarDrawer({ open, onClose, empId }: Props) {
  const [cursor, setCursor] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [cache, setCache] = useState<Record<string, MonthData>>({});
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const touchX = useRef<number | null>(null);
  const touchY = useRef<number | null>(null);
  const sheetTouchY = useRef<number | null>(null);

  const today = new Date();
  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());
  const currentMonth = monthKey(today);
  const key = monthKey(cursor);
  const atCurrent = key >= currentMonth;
  const cacheKey = `${empId ?? 'me'}|${key}`;
  const data = cache[cacheKey];

  useEffect(() => {
    if (!open || cache[cacheKey]) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    apiGetFull<DayRecord[]>('/attendance-calendar', empId != null ? { month: key, empId } : { month: key })
      .then(({ data: rows, meta }) => {
        if (cancelled) return;
        const days: Record<string, DayRecord> = {};
        (rows ?? []).forEach((r) => { days[r.date] = r; });
        const m = (meta ?? {}) as { summary?: Summary; shift?: ShiftMeta };
        setCache((c) => ({ ...c, [cacheKey]: { days, summary: m.summary ?? null, shift: m.shift ?? null } }));
      })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cacheKey]);

  useEffect(() => { if (!open) setSelected(null); }, [open]);

  const cells = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const first = new Date(y, m, 1).getDay();
    const count = new Date(y, m + 1, 0).getDate();
    const out: Array<{ day: number; date: string } | null> = [];
    for (let i = 0; i < first; i++) out.push(null);
    for (let d = 1; d <= count; d++) out.push({ day: d, date: dateKey(y, m, d) });
    return out;
  }, [cursor]);

  function go(delta: number) {
    if (delta > 0 && atCurrent) return;
    setSelected(null);
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  }

  function onGridTouchStart(e: React.TouchEvent) {
    touchX.current = e.touches[0].clientX;
    touchY.current = e.touches[0].clientY;
  }
  function onGridTouchEnd(e: React.TouchEvent) {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    const dy = e.changedTouches[0].clientY - (touchY.current ?? 0);
    touchX.current = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
  }

  function onHandleTouchStart(e: React.TouchEvent) { sheetTouchY.current = e.touches[0].clientY; }
  function onHandleTouchEnd(e: React.TouchEvent) {
    if (sheetTouchY.current == null) return;
    const dy = e.changedTouches[0].clientY - sheetTouchY.current;
    sheetTouchY.current = null;
    if (dy > 60) onClose();
  }

  if (!open) return null;

  const s = data?.summary;
  const sel = selected ? data?.days[selected] : null;
  const shift = data?.shift;
  const chips: Array<[string, string | number, string]> = s
    ? [
        ['Present', s.present, 'text-green-400'],
        ['Incomplete', s.incomplete, 'text-orange-400'],
        ['Absent', s.absent, 'text-red-400'],
        ['Leave', s.leave, 'text-blue-400'],
        ['Holidays', s.holidays, 'text-purple-400'],
        ['Weekly off', s.weeklyOffs, 'text-slate-400'],
        ...(s.lateDays != null ? [['Late', s.lateDays, 'text-amber-400'] as [string, number, string]] : []),
        ...(s.earlyDays != null ? [['Early', s.earlyDays, 'text-amber-400'] as [string, number, string]] : []),
        ['Net hours', (s.netHours ?? s.netMinutes / 60).toFixed(1), 'text-brand-300'],
      ]
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="animate-enter relative z-10 flex max-h-[90vh] w-full flex-col rounded-t-4xl border-t border-white/[0.1] bg-surface-raised px-5 pb-6 pt-2 shadow-2xl">
        <div className="-mx-5 flex justify-center px-5 pb-3 pt-1" onTouchStart={onHandleTouchStart} onTouchEnd={onHandleTouchEnd}>
          <div className="h-1.5 w-10 rounded-full bg-surface-light" />
        </div>

        <div className="mb-2 flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-100">Attendance</h2>
            {shift && (
              <p className="truncate text-[11.5px] text-slate-400">
                {shift.name} · {shift.start}–{shift.end}
              </p>
            )}
          </div>
          <button onClick={onClose} className="rounded-full glass p-1.5 text-slate-400" aria-label="Close"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto">
          <div className="mb-3 flex items-center justify-between">
            <button onClick={() => go(-1)} className="rounded-full glass p-2 text-slate-300" aria-label="Previous month"><ChevronLeft size={16} /></button>
            <p className="text-[14.5px] font-semibold text-slate-100">
              {cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
            </p>
            <button onClick={() => go(1)} disabled={atCurrent} className="rounded-full glass p-2 text-slate-300 disabled:opacity-30" aria-label="Next month"><ChevronRight size={16} /></button>
          </div>

          {chips.length > 0 && (
            <div className="mb-3 grid grid-cols-4 gap-1.5">
              {chips.map(([label, val, color]) => (
                <div key={label} className="glass !rounded-xl px-2 py-1.5 text-center">
                  <p className={`text-[15px] font-bold tabular-nums ${color}`}>{val}</p>
                  <p className="text-[10px] text-slate-500">{label}</p>
                </div>
              ))}
            </div>
          )}

          <div onTouchStart={onGridTouchStart} onTouchEnd={onGridTouchEnd}>
            <div className="mb-1.5 grid grid-cols-7 gap-1 text-center">
              {WEEKDAYS.map((w, i) => <p key={i} className="text-[11px] font-semibold text-slate-500">{w}</p>)}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {cells.map((cell, i) => {
                if (!cell) return <div key={`b${i}`} />;
                const rec = data?.days[cell.date];
                const future = cell.date > todayKey;
                const isToday = cell.date === todayKey;
                const isSel = selected === cell.date;
                return (
                  <button
                    key={cell.date}
                    onClick={() => rec && setSelected(isSel ? null : cell.date)}
                    disabled={!rec}
                    className={`flex flex-col items-center gap-1 rounded-xl py-1.5 ${isSel ? 'bg-brand-500/20' : ''} ${isToday ? 'ring-1 ring-brand-400' : ''}`}
                  >
                    <span className={`text-[13px] ${future ? 'text-slate-600' : 'font-semibold text-slate-100'}`}>{cell.day}</span>
                    <span
                      className={`h-2 w-2 rounded-full ${
                        rec && !future
                          ? `${DOT[rec.status] ?? 'bg-slate-500'} ${rec.worked_on_off_day ? 'ring-2 ring-offset-1 ring-green-300 ring-offset-[#12141f]' : ''}`
                          : ''
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {loading && <p className="mt-3 text-center text-[12px] text-slate-500">Loading…</p>}
          {failed && !data && <p className="mt-3 text-center text-[12px] text-danger">Could not load this month.</p>}

          {sel && (
            <div className="mt-4 glass p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[13.5px] font-semibold text-slate-100">
                  {new Date(`${sel.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
                </p>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white ${DOT[sel.status] ?? 'bg-slate-500'}`}>
                  {LABEL[sel.status] ?? sel.status}{sel.worked_on_off_day ? ' · worked' : ''}
                </span>
              </div>
              {sel.holidayName && <p className="mb-2 text-[12.5px] text-purple-300">{sel.holidayName}</p>}
              {sel.status === 'leave' && !sel.checkIn && (
                <p className="text-[12.5px] text-slate-400">{sel.leaveType ? `${sel.leaveType} leave` : 'On leave'}</p>
              )}
              {(sel.checkIn || sel.checkOut) && (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <LogIn size={15} className="text-green-400" />
                      <div>
                        <p className="text-[10.5px] text-slate-500">CHECK IN</p>
                        <p className="text-[13.5px] font-semibold text-slate-100">{fmtTime(sel.checkIn)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <LogOut size={15} className="text-red-400" />
                      <div>
                        <p className="text-[10.5px] text-slate-500">CHECK OUT</p>
                        <p className="text-[13.5px] font-semibold text-slate-100">
                          {fmtTime(sel.checkOut)}
                          {sel.overnight && sel.checkOut && <span className="ml-1 text-[10.5px] font-normal text-slate-400">+1 day</span>}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10.5px] text-slate-500">NET HOURS</p>
                      <p className="text-[13.5px] font-semibold text-slate-100">{sel.checkIn && sel.checkOut ? fmtMinutes(sel.netMinutes ?? (sel.netHours ?? 0) * 60) : '—'}</p>
                    </div>
                  </div>
                  {sel.checkIn && sel.checkOut && (sel.breakMinutes ?? 0) > 0 && (
                    <p className="mt-2 text-[11.5px] text-slate-400">Break deducted: {sel.breakMinutes} min</p>
                  )}
                  {((sel.lateMinutes ?? 0) > 0 || (sel.earlyMinutes ?? 0) > 0) && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(sel.lateMinutes ?? 0) > 0 && <span className="chip !border-amber-400/40 !text-amber-300">Late {sel.lateMinutes} min</span>}
                      {(sel.earlyMinutes ?? 0) > 0 && <span className="chip !border-amber-400/40 !text-amber-300">Left early {sel.earlyMinutes} min</span>}
                    </div>
                  )}
                  {sel.status === 'incomplete' && <p className="mt-2 text-[11.5px] text-orange-300">Only one punch recorded.</p>}
                </>
              )}
              {!sel.checkIn && !sel.checkOut && sel.status !== 'leave' && !sel.holidayName && (
                <p className="text-[12.5px] text-slate-400">
                  {sel.status === 'weekly_off' ? 'Weekly off day' : sel.status === 'absent' ? 'No attendance recorded' : LABEL[sel.status]}
                </p>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1.5">
            {(Object.keys(LABEL) as Status[]).map((k) => (
              <span key={k} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <span className={`h-2 w-2 rounded-full ${DOT[k]}`} /> {LABEL[k]}
              </span>
            ))}
            <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <span className="h-2 w-2 rounded-full bg-green-400 ring-2 ring-green-300 ring-offset-1 ring-offset-[#12141f]" /> Worked on off-day
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
