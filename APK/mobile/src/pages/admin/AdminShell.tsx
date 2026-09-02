import { NavLink, Outlet } from 'react-router-dom';
import { Activity, BarChart3, Bell, LogOut, Users, CalendarClock } from 'lucide-react';
import { useAuth } from '../../lib/auth';

const tabs = [
  { to: '/admin', label: 'Feed', icon: Activity, end: true },
  { to: '/admin/employees', label: 'Employees', icon: Users },
  { to: '/admin/assignments', label: 'Assign', icon: CalendarClock },
  { to: '/admin/alerts', label: 'Alerts', icon: Bell },
  { to: '/admin/analytics', label: 'Stats', icon: BarChart3 },
];

export default function AdminShell() {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-surface-light px-4 py-3">
        <div>
          <p className="text-sm font-medium text-slate-100">{user?.name}</p>
          <p className="text-xs capitalize text-slate-400">{user?.role}</p>
        </div>
        <button
          onClick={() => void logout()}
          className="rounded-md p-2 text-slate-300 hover:bg-surface hover:text-slate-100"
          aria-label="Sign out"
        >
          <LogOut size={20} />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto" style={{ paddingBottom: 'calc(64px + env(safe-area-inset-bottom))' }}>
        <Outlet />
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 flex border-t border-surface-light bg-surface"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {tabs.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-2 text-xs ${
                isActive ? 'text-brand-500' : 'text-slate-400'
              }`
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
