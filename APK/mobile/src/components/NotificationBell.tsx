import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useNotifications } from '../lib/notifications';

/** Round bell button with a red unread badge; opens the notifications inbox. */
export default function NotificationBell({ className = '' }: { className?: string }) {
  const { unread } = useNotifications();
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate('/notifications')}
      aria-label={unread ? `${unread} unread notifications` : 'Notifications'}
      className={`relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-surface-light bg-surface text-slate-200 ${className}`}
    >
      <Bell size={17} className={unread ? 'animate-[wiggle_1.2s_ease-in-out_2]' : ''} />
      {unread > 0 && (
        <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-surface-bg">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
}
