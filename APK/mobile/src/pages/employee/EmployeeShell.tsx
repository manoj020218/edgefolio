import { NavLink, Outlet } from 'react-router-dom';
import { Home as HomeIcon, Briefcase, ClipboardCheck, UserCircle } from 'lucide-react';

const tabs = [
  { to: '/', label: 'Home', icon: HomeIcon, end: true },
  { to: '/work', label: 'Work', icon: Briefcase },
  { to: '/requests', label: 'Requests', icon: ClipboardCheck },
  { to: '/profile', label: 'Profile', icon: UserCircle },
];

export interface EmployeeShellContext {
  isAdmin: boolean;
  onSwitchToAdmin: () => void;
}

interface Props {
  isAdmin: boolean;
  onSwitchToAdmin: () => void;
}

// Bottom nav for the employee side of the app. Unlike AdminShell, no persistent
// header — each page (Home, Work, Requests, Profile) renders its own top content,
// matching the design mockup. isAdmin/onSwitchToAdmin are only meaningful when an
// hr-admin/owner account is viewing this shell (see App.tsx's viewMode) — passed
// through via Outlet context so ProfilePage can render a "Switch to Admin" item
// without every other page needing to know about it.
export default function EmployeeShell({ isAdmin, onSwitchToAdmin }: Props) {
  return (
    <div className="flex min-h-full flex-col">
      <main className="flex-1 overflow-y-auto" style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom))' }}>
        <Outlet context={{ isAdmin, onSwitchToAdmin } satisfies EmployeeShellContext} />
      </main>

      <nav
        className="fixed inset-x-3 z-40 flex h-16 items-center gap-1 rounded-full border border-white/[0.1] bg-[#11131c]/80 p-1.5 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] backdrop-blur-2xl"
        style={{ bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}
      >
        {tabs.map(({ to, label, icon: Icon, end }) => (
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
