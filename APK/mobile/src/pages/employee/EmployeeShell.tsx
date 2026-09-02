import { NavLink, Outlet } from 'react-router-dom';
import { Home as HomeIcon, Briefcase, ClipboardCheck, UserCircle } from 'lucide-react';

const tabs = [
  { to: '/', label: 'Home', icon: HomeIcon, end: true },
  { to: '/work', label: 'Work', icon: Briefcase },
  { to: '/requests', label: 'Requests', icon: ClipboardCheck },
  { to: '/profile', label: 'Profile', icon: UserCircle },
];

// Bottom nav for the employee side of the app. Unlike AdminShell, no persistent
// header — each page (Home, Work, Requests, Profile) renders its own top content,
// matching the design mockup.
export default function EmployeeShell() {
  return (
    <div className="flex min-h-full flex-col">
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
