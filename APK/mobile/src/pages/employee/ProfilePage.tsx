import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { BadgeCheck, CheckCircle2, ChevronRight, Contact, DownloadCloud, FileText, Fingerprint, Globe, Headphones, KeyRound, LogOut, Wallet } from 'lucide-react';
import { apiGet } from '../../lib/api';
import { useAuth } from '../../lib/auth';

const items = [
  { to: '/profile/detail', label: 'Detailed Profile', hint: 'Personal details, address, emergency contact', icon: Contact },
  { to: '/profile/face-id', label: 'Face ID', hint: 'Set up face recognition for attendance', icon: Fingerprint },
  { to: '/profile/attendance-card', label: 'Attendance Card', hint: 'Monthly present/absent/leave summary', icon: BadgeCheck },
  { to: '/profile/pay', label: 'Pay Settings', hint: 'Salary structure, payslips, attendance history', icon: Wallet },
  { to: '/profile/documents', label: 'Documents', hint: 'Appointment letter, ID card, certificates & more', icon: FileText },
  { to: '/profile/help', label: 'Help & Support', hint: 'Contact HR, IT support, raise a ticket', icon: Headphones },
  { to: '/change-password', label: 'Change Password', hint: null, icon: KeyRound },
];

interface ApkConfig {
  min_apk_version: string;
}

// Compares "1.0.2" > "1.0.1"-style version strings segment by segment.
function versionIsOlder(current: string, minimum: string): boolean {
  const a = current.split('.').map(Number);
  const b = minimum.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) return x < y;
  }
  return false;
}

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<'unknown' | 'current' | 'outdated'>('unknown');

  useEffect(() => {
    CapApp.getInfo()
      .then((info) => setAppVersion(info.version))
      .catch(() => setAppVersion(null));
  }, []);

  async function handleCheckForUpdates() {
    setChecking(true);
    try {
      const cfg = await apiGet<ApkConfig>('/config');
      if (appVersion && versionIsOlder(appVersion, cfg.min_apk_version)) {
        setUpdateStatus('outdated');
      } else {
        setUpdateStatus('current');
      }
    } catch {
      setUpdateStatus('unknown');
    } finally {
      setChecking(false);
    }
  }

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

        <div className="flex items-center gap-3.5 rounded-2xl border border-surface-light bg-surface p-4">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-500/15">
            <Globe size={18} className="text-brand-400" />
          </div>
          <div className="flex-1">
            <p className="text-[14.5px] font-semibold text-slate-100">Time Zone</p>
            <p className="mt-0.5 text-[11.5px] text-slate-400">All attendance is recorded in India Standard Time</p>
          </div>
          <span className="rounded-full bg-brand-500/15 px-2.5 py-1 text-[11px] font-semibold text-brand-400">
            India (IST)
          </span>
        </div>

        <div className="rounded-2xl border border-surface-light bg-surface p-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-500/15">
              <DownloadCloud size={18} className="text-brand-400" />
            </div>
            <div className="flex-1">
              <p className="text-[14.5px] font-semibold text-slate-100">Version</p>
              <p className="mt-0.5 text-[11.5px] text-slate-400">
                {appVersion ? `EdgeFolio v${appVersion}` : 'Loading…'}
              </p>
            </div>
            <button
              onClick={() => void handleCheckForUpdates()}
              disabled={checking || !appVersion}
              className="rounded-lg bg-brand-500/15 px-3 py-1.5 text-[12px] font-semibold text-brand-400 disabled:opacity-60"
            >
              {checking ? 'Checking…' : 'Check for Updates'}
            </button>
          </div>
          {updateStatus === 'current' && (
            <p className="mt-3 flex items-center gap-1.5 text-[12px] font-medium text-green-400">
              <CheckCircle2 size={14} /> You're on the latest version.
            </p>
          )}
          {updateStatus === 'outdated' && (
            <p className="mt-3 text-[12px] font-medium text-amber-400">
              A newer version is available. Please contact your admin for the update.
            </p>
          )}
          {updateStatus === 'unknown' && checking === false && appVersion === null && (
            <p className="mt-3 text-[12px] text-slate-500">Could not load app version.</p>
          )}
        </div>
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
