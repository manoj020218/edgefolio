import { useState, type FormEvent } from 'react';
import { authApiPost, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

interface Props {
  // Set when reached voluntarily from Profile (not the forced gate) — called after
  // a successful change so the caller can navigate back.
  onDone?: () => void;
}

// Forced gate — shown whenever user.passwordMustChange is true (fresh account,
// or after an HR-admin password reset via PasswordResetsPage). Wired in App.tsx
// ahead of the normal employee/admin routes. Also reachable voluntarily from
// Profile via the /change-password route (onDone set in that case).
export default function ChangePasswordPage({ onDone }: Props) {
  const { markPasswordChanged } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      await authApiPost('/change-password', { currentPassword, newPassword });
      markPasswordChanged();
      onDone?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col justify-center px-6 py-10">
      <h1 className="mb-1 text-2xl font-semibold text-slate-100">Set a New Password</h1>
      <p className="mb-8 text-sm text-slate-300">
        You&rsquo;re using a temporary password. Set your own before continuing.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm text-slate-300" htmlFor="current">
            Temporary password
          </label>
          <input
            id="current"
            type="password"
            className="w-full rounded-md border border-surface-light bg-surface px-3 py-2.5 text-slate-100 outline-none focus:border-brand-500"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-slate-300" htmlFor="new">
            New password
          </label>
          <input
            id="new"
            type="password"
            className="w-full rounded-md border border-surface-light bg-surface px-3 py-2.5 text-slate-100 outline-none focus:border-brand-500"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-slate-300" htmlFor="confirm">
            Confirm new password
          </label>
          <input
            id="confirm"
            type="password"
            className="w-full rounded-md border border-surface-light bg-surface px-3 py-2.5 text-slate-100 outline-none focus:border-brand-500"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-brand-500 py-2.5 font-medium text-white transition hover:bg-brand-600 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Set Password'}
        </button>
      </form>
    </div>
  );
}
