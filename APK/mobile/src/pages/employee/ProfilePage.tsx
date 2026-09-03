import { Link } from 'react-router-dom';
import { ChevronRight, Contact, FileText, Fingerprint, Headphones, KeyRound, LogOut, Wallet } from 'lucide-react';
import { useAuth } from '../../lib/auth';

const items = [
  { to: '/profile/detail', label: 'Detailed Profile', hint: 'Personal details, address, emergency contact', icon: Contact },
  { to: '/profile/face-id', label: 'Face ID', hint: 'Set up face recognition for attendance', icon: Fingerprint },
  { to: '/profile/pay', label: 'Pay Settings', hint: 'Salary structure, payslips, attendance history', icon: Wallet },
  { to: '/profile/documents', label: 'Documents', hint: 'Appointment letter, ID card, certificates & more', icon: FileText },
  { to: '/profile/help', label: 'Help & Support', hint: 'Contact HR, IT support, raise a ticket', icon: Headphones },
  { to: '/change-password', label: 'Change Password', hint: null, icon: KeyRound },
];

export default function ProfilePage() {
  const { user, logout } = useAuth();

  return (
    <div className="px-5" style={{ paddingTop: '52px' }}>
      <h1 className="mb-4 text-xl font-bold text-slate-100">Settings</h1>

      <div className="mb-5 flex items-center gap-3.5 rounded-2xl border border-surface-light bg-gradient-to-br from-surface to-surface-bg p-4.5">
        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xl font-bold text-white">
          {user?.name?.[0] ?? '?'}
        </div>
        <div className="min-w-0">
          <p className="text-base font-bold text-slate-100">{user?.name}</p>
          <p className="mt-0.5 truncate text-xs text-slate-400">
            {user?.empCode} · {user?.department} · {user?.designation}
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-2.5">
        {items.map(({ to, label, hint, icon: Icon }) => (
          <Link key={to} to={to} className="flex items-center gap-3.5 rounded-2xl border border-surface-light bg-surface p-4">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-500/15">
              <Icon size={18} className="text-brand-400" />
            </div>
            <div className="flex-1">
              <p className="text-[14.5px] font-semibold text-slate-100">{label}</p>
              {hint && <p className="mt-0.5 text-[11.5px] text-slate-400">{hint}</p>}
            </div>
            <ChevronRight size={16} className="text-slate-500" />
          </Link>
        ))}
      </div>

      <button
        onClick={() => void logout()}
        className="flex w-full items-center gap-2.5 rounded-2xl border border-danger/25 bg-danger/10 p-4"
      >
        <LogOut size={17} className="text-red-400" />
        <span className="text-sm font-semibold text-red-400">Log Out</span>
      </button>
    </div>
  );
}
