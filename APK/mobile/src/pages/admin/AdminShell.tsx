import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Activity, BarChart3, Bell, LogOut, Users, CalendarClock, UserCircle, Building2 } from 'lucide-react';
import { isCloudModeSync } from '../../lib/api';
import { useAuth } from '../../lib/auth';

const tabs = [
  { to: '/admin', label: 'Feed', icon: Activity, end: true },
  { to: '/admin/employees', label: 'Employees', icon: Users },
  { to: '/admin/assignments', label: 'Assign', icon: CalendarClock },
  { to: '/admin/alerts', label: 'Alerts', icon: Bell },
  { to: '/admin/analytics', label: 'Stats', icon: BarChart3 },
  // Cloud mode only: company code, licence, invites, export (VPS/cloud GET /apk/company).
  { to: '/admin/company', label: 'Company', icon: Building2, cloudOnly: true },
];

interface Props {
  onSwitchToEmployee: () => void;
}

export default function AdminShell({ onSwitchToEmployee }: Props) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const visibleTabs = tabs.filter((t) => !('cloudOnly' in t) || isCloudModeSync());

  // Right after creating a company, open the Company screen once (code + invites).
  useEffect(() => {
    if (localStorage.getItem('edgefolio.justCreated') === '1') navigate('/admin/company');
  }, [navigate]);


  return (
    <div className="flex min-h-full flex-col">
      {/* AdminShell is the only shell with its own header (EmployeeShell's pages each
          render their own top content with paddingTop: '52px', the value already
          tuned against this app's status bar across every other screen) — match that
          same top inset here instead of the bare py-3 this had, which put the header
          text right under the status bar/clock. */}
      <header className="mx-3 mt-0 flex items-center justify-between rounded-3xl border border-white/[0.08] bg-white/[0.045] px-3 pb-3 pt-3 backdrop-blur-xl" style={{ marginTop: '52px' }}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-base font-extrabold text-white shadow-glow">
            {(user?.name || '?').trim().charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-bold text-[#f4f5fb]">{user?.name}</p>
            <span className="chip mt-0.5 !px-2 !py-0.5 text-[10px] capitalize">{user?.role}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onSwitchToEmployee}
            className="btn-ghost h-10 w-10 !rounded-full text-slate-200"
            aria-label="Switch to my attendance"
            title="Switch to my attendance"
          >
            <UserCircle size={20} />
          </button>
          <button
            onClick={() => void logout()}
            className="btn-ghost h-10 w-10 !rounded-full text-slate-200"
            aria-label="Sign out"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto" style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom))' }}>
        <Outlet />
      </main>

      <nav
        className="fixed inset-x-3 z-40 flex h-16 items-center gap-1 rounded-full border border-white/[0.1] bg-[#11131c]/80 p-1.5 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] backdrop-blur-2xl"
        style={{ bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}
      >
        {visibleTabs.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex h-full flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-semibold transition duration-150 active:scale-[0.96] ${
                isActive ? 'bg-brand text-white shadow-glow' : 'text-[#9aa0b8]'
              }`
            }
          >
            <Icon size={19} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
