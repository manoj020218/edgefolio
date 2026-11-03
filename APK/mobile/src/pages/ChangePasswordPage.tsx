import { useState, type FormEvent } from 'react';
import { authApiPost, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import AppLogo from '../components/AppLogo';

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
    <div className="animate-enter flex min-h-full flex-col justify-center px-6 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <AppLogo />
        <h1 className="mb-1.5 text-[26px] font-extrabold leading-tight text-[#f4f5fb]">Set a New <span className="text-gradient">Password</span></h1>
        <p className="max-w-[300px] text-[13px] leading-relaxed text-[#9aa0b8]">You&rsquo;re using a temporary password. Set your own before continuing.</p>
      </div>

      <form onSubmit={handleSubmit} className="glass space-y-4 p-5">
        <div>
          <label className="label-caps mb-1.5 ml-1 block" htmlFor="current">
            Temporary password
          </label>
          <input
            id="current"
            type="password"
            className="input"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <label className="label-caps mb-1.5 ml-1 block" htmlFor="new">
            New password
          </label>
          <input
            id="new"
            type="password"
            className="input"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>

        <div>
          <label className="label-caps mb-1.5 ml-1 block" htmlFor="confirm">
            Confirm new password
          </label>
          <input
            id="confirm"
            type="password"
            className="input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full btn-primary py-3.5 text-[15px] disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Set Password'}
        </button>
      </form>
    </div>
  );
}
