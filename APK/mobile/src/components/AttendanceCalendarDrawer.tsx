import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, LogIn, LogOut, X } from 'lucide-react';
import { apiGet } from '../lib/api';

interface DayRecord {
  date: string; // YYYY-MM-DD
  status: string; // present | absent | leave | ...
  checkIn: string | null;
  checkOut: string | null;
  hoursWorked: number;
  leaveType: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const DOT_CLASS: Record<string, string> = {
  present: 'bg-green-400',
  absent: 'bg-red-400',
  leave: 'bg-orange-400',
};

const STATUS_LABEL: Record<string, string> = {
  present: 'Present',
  absent: 'Absent',
  leave: 'On Leave',
};

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function AttendanceCalendarDrawer({ open, onClose }: Props) {
  const [cursor, setCursor] = useState(() => new Date());
  const [records, setRecords] = useState<Record<string, DayRecord>>({});
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const key = monthKey(cursor);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelected(null);
    apiGet<DayRecord[]>('/attendance-calendar', { month: key })
      .then((rows) => {
        const map: Record<string, DayRecord> = {};
        rows.forEach((r) => { map[r.date] = r; });
        setRecords(map);
      })
      .catch(() => setRecords({}))
      .finally(() => setLoading(false));
  }, [open, key]);

  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const out: Array<{ day: number; date: string } | null> = [];
    for (let i = 0; i < firstWeekday; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      out.push({ day: d, date: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
    }
    return out;
  }, [cursor]);

  const selectedRecord = selected ? records[selected] : null;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 flex max-h-[85vh] w-full flex-col rounded-t-3xl bg-surface-bg px-5 pb-6 pt-3 shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-surface-light" />

        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-100">Attendance</h2>
          <button onClick={onClose} className="rounded-full bg-surface p-1.5 text-slate-400">
            <X size={16} />
          </button>
        </div>

        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
            className="rounded-full bg-surface p-2 text-slate-300"
          >
            <ChevronLeft size={16} />
          </button>
          <p className="text-[14.5px] font-semibold text-slate-100">
            {cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
          </p>
          <button
            onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
            className="rounded-full bg-surface p-2 text-slate-300"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="mb-1.5 grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((w, i) => (
            <p key={i} className="text-[11px] font-semibold text-slate-500">{w}</p>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 overflow-y-auto">
          {cells.map((cell, i) => {
            if (!cell) return <div key={i} />;
            const rec = records[cell.date];
            const isSelected = selected === cell.date;
            return (
              <button
                key={cell.date}
                onClick={() => rec && setSelected(isSelected ? null : cell.date)}
                disabled={!rec}
                className={`flex flex-col items-center gap-1 rounded-xl py-1.5 ${
                  isSelected ? 'bg-brand-500/20' : ''
                }`}
              >
                <span className={`text-[13px] ${rec ? 'font-semibold text-slate-100' : 'text-slate-600'}`}>
                  {cell.day}
                </span>
                <span
                  className={`h-1.5 w-1.5 rounded-full ${rec ? DOT_CLASS[rec.status] ?? 'bg-slate-500' : ''}`}
                />
              </button>
            );
          })}
        </div>

        {loading && <p className="mt-3 text-center text-[12px] text-slate-500">Loading…</p>}

        {selectedRecord && (
          <div className="mt-4 rounded-2xl border border-surface-light bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[13.5px] font-semibold text-slate-100">
                {new Date(selectedRecord.date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
              </p>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white ${DOT_CLASS[selectedRecord.status] ?? 'bg-slate-500'}`}>
                {STATUS_LABEL[selectedRecord.status] ?? selectedRecord.status}
              </span>
            </div>
            {selectedRecord.status === 'leave' ? (
              <p className="text-[12.5px] text-slate-400">
                {selectedRecord.leaveType ? `${selectedRecord.leaveType} leave` : 'On leave'}
              </p>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <LogIn size={15} className="text-green-400" />
                  <div>
                    <p className="text-[10.5px] text-slate-500">CHECK IN</p>
                    <p className="text-[13.5px] font-semibold text-slate-100">{selectedRecord.checkIn ?? '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <LogOut size={15} className="text-red-400" />
                  <div>
                    <p className="text-[10.5px] text-slate-500">CHECK OUT</p>
                    <p className="text-[13.5px] font-semibold text-slate-100">{selectedRecord.checkOut ?? '—'}</p>
                  </div>
                </div>
                <div>
                  <p className="text-[10.5px] text-slate-500">HOURS</p>
                  <p className="text-[13.5px] font-semibold text-slate-100">{selectedRecord.hoursWorked.toFixed(1)}h</p>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center justify-center gap-5">
          <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="h-2 w-2 rounded-full bg-green-400" /> Present
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="h-2 w-2 rounded-full bg-red-400" /> Absent
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="h-2 w-2 rounded-full bg-orange-400" /> Leave
          </span>
        </div>
      </div>
    </div>
  );
}
