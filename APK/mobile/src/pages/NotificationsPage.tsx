import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ChevronLeft, ChevronRight, LogIn, LogOut, Megaphone, ScanFace, CheckCheck } from 'lucide-react';
import { apiGet, apiPost, ApiError } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useNotifications } from '../lib/notifications';

interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, string>;
  createdAt: string;
  read: boolean;
}

// Where tapping a notification takes you (null = nothing to open).
function targetFor(n: AppNotification, isAdmin: boolean): string | null {
  switch (n.type) {
    case 'FACE_RECAPTURE_REQUEST': return isAdmin ? '/admin/face-requests' : null;
    case 'FACE_RECAPTURE_DECISION': return '/profile/face-id';
    case 'ATTENDANCE_ALERT': return isAdmin ? '/admin' : null;
    default: return null;
  }
}

function iconFor(n: AppNotification) {
  if (n.type === 'ATTENDANCE_ALERT') {
    return n.data?.event === 'checkout'
      ? { Icon: LogOut, cls: 'bg-sky-500/15 text-sky-300' }
      : { Icon: LogIn, cls: 'bg-emerald-500/15 text-emerald-300' };
  }
  if (n.type.startsWith('FACE_RECAPTURE')) return { Icon: ScanFace, cls: 'bg-amber-400/15 text-amber-300' };
  if (n.type === 'ANNOUNCEMENT') return { Icon: Megaphone, cls: 'bg-violet-500/15 text-violet-300' };
  return { Icon: Bell, cls: 'bg-brand-500/15 text-brand-300' };
}

// Inbox of every notification sent to this user (GET /notifications) — so a missed push can still
// be found and acted on. Unread rows are highlighted; tapping marks read and opens the related screen.
export default function NotificationsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refresh } = useNotifications();
  const isAdmin = user?.role === 'hr-admin' || user?.role === 'owner';
  const [rows, setRows] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  function load(before?: string) {
    apiGet<AppNotification[]>('/notifications', { limit: 50, ...(before ? { before } : {}) })
      .then((r) => { setRows((prev) => (before ? [...(prev ?? []), ...r] : r)); setMore(r.length === 50); })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load notifications.'));
  }
  useEffect(() => load(), []);

  async function markRead(ids: string[] | 'all') {
    try {
      await apiPost('/notifications/read', ids === 'all' ? { all: true } : { ids });
      setRows((prev) => prev?.map((r) => (ids === 'all' || ids.includes(r.id) ? { ...r, read: true } : r)) ?? prev);
      refresh();
    } catch { /* not critical */ }
  }

  function open(n: AppNotification) {
    if (!n.read) void markRead([n.id]);
    const to = targetFor(n, isAdmin);
    if (to) navigate(to);
  }

  const unread = rows?.filter((r) => !r.read).length ?? 0;

  return (
    <div className="animate-enter min-h-full px-5 pb-10" style={{ paddingTop: '52px' }}>
      <div className="mb-5 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm font-medium text-slate-300">
          <ChevronLeft size={18} /> Back
        </button>
        {unread > 0 && (
          <button onClick={() => void markRead('all')} className="flex items-center gap-1.5 text-xs font-semibold text-brand-300">
            <CheckCheck size={15} /> Mark all read
          </button>
        )}
      </div>
      <h1 className="mb-1 text-xl font-bold text-slate-100">Notifications</h1>
      <p className="mb-5 text-xs text-slate-400">{unread ? `${unread} unread` : 'You’re all caught up'}</p>

      {error && <p className="text-sm text-danger">{error}</p>}
      {!rows && !error && <p className="text-sm text-slate-400">Loading…</p>}
      {rows && rows.length === 0 && (
        <div className="glass flex flex-col items-center gap-2 p-8 text-center">
          <Bell size={26} className="text-slate-500" />
          <p className="text-sm text-slate-400">No notifications yet.</p>
        </div>
      )}

      <ul className="space-y-2">
        {rows?.map((n) => {
          const { Icon, cls } = iconFor(n);
          const to = targetFor(n, isAdmin);
          return (
            <li key={n.id}>
              <button onClick={() => open(n)}
                className={`glass flex w-full items-start gap-3 p-3.5 text-left transition active:scale-[0.99] ${n.read ? 'opacity-70' : '!border-brand-500/40'}`}>
                <span className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${cls}`}>
                  <Icon size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={`truncate text-[14px] ${n.read ? 'font-medium text-slate-300' : 'font-semibold text-slate-100'}`}>{n.title}</span>
                    {!n.read && <span className="h-2 w-2 flex-shrink-0 rounded-full bg-rose-500" />}
                  </span>
                  {n.body && <span className="mt-0.5 block text-[12.5px] text-slate-400">{n.body}</span>}
                  <span className="mt-1 block text-[11px] text-slate-500">{formatDateTime(n.createdAt)}</span>
                </span>
                {to && <ChevronRight size={16} className="mt-2 flex-shrink-0 text-slate-500" />}
              </button>
            </li>
          );
        })}
      </ul>
      {more && rows && (
        <button onClick={() => load(rows[rows.length - 1].createdAt)} className="btn-ghost mt-4 w-full py-2.5 text-sm text-slate-200">
          Load older
        </button>
      )}
    </div>
  );
}
