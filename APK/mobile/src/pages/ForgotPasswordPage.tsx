import { useState, type FormEvent } from 'react';
import { authApiPost, ApiError } from '../lib/api';

interface Props {
  onBack: () => void;
}

// Employee self-service: submits their Employee ID or email, which creates a
// pending password_reset_requests row. An HR-admin approves it from
// PasswordResetsPage, generating a temp password to relay to the employee
// (SMS/verbally) — there's no automated delivery channel here.
export default function ForgotPasswordPage({ onBack }: Props) {
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!identifier.trim()) return;

    setBusy(true);
    try {
      // Server param is named empId for legacy reasons but accepts Employee ID,
      // email, or internal id — see authController.js forgotPasswordHandler.
      await authApiPost('/forgot-password', { empId: identifier.trim() });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit request.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex min-h-full flex-col justify-center px-6 py-10">
        <h1 className="mb-2 text-xl font-semibold text-slate-100">Request sent</h1>
        <p className="mb-8 text-sm text-slate-300">
          Your HR-admin has been notified. They&rsquo;ll share a temporary password with you
          directly.
        </p>
        <button onClick={onBack} className="text-sm text-brand-500 underline">
          ← Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col justify-center px-6 py-10">
      <button onClick={onBack} className="mb-6 self-start text-sm text-brand-500 underline">
        ← Back
      </button>

      <h1 className="mb-1 text-xl font-semibold text-slate-100">Forgot Password</h1>
      <p className="mb-8 text-sm text-slate-300">
        Enter your Employee ID or email. Your HR-admin will approve the request and share a
        temporary password with you.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          className="w-full rounded-md border border-surface-light bg-surface px-3 py-2.5 text-slate-100 outline-none focus:border-brand-500"
          placeholder="Employee ID or email"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          autoFocus
        />

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-brand-500 py-2.5 font-medium text-white transition hover:bg-brand-600 disabled:opacity-50"
        >
          {busy ? 'Submitting…' : 'Request Reset'}
        </button>
      </form>
    </div>
  );
}
