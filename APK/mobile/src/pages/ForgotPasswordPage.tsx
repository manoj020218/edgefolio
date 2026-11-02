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
      <div className="animate-enter flex min-h-full flex-col justify-center px-6 py-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-3xl bg-brand text-3xl font-extrabold text-white shadow-glow">
            E
          </div>
          <h1 className="mb-1.5 text-[26px] font-extrabold leading-tight text-[#f4f5fb]">Request <span className="text-gradient">sent</span></h1>
          <p className="max-w-[300px] text-[13px] leading-relaxed text-[#9aa0b8]">Your HR-admin has been notified. They&rsquo;ll share a temporary password with you directly.</p>
        </div>
        <button onClick={onBack} className="btn-ghost w-full py-3.5 text-[15px]">
          ← Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="animate-enter flex min-h-full flex-col justify-center px-6 py-10">
      <button onClick={onBack} className="mb-4 self-start text-sm font-semibold text-brand-300">
        ← Back
      </button>

      <div className="mb-8 flex flex-col items-center text-center">
        <div className="mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-3xl bg-brand text-3xl font-extrabold text-white shadow-glow">
          E
        </div>
        <h1 className="mb-1.5 text-[26px] font-extrabold leading-tight text-[#f4f5fb]">Forgot <span className="text-gradient">Password</span></h1>
        <p className="max-w-[300px] text-[13px] leading-relaxed text-[#9aa0b8]">Enter your Employee ID or email. Your HR-admin will approve the request and share a temporary password with you.</p>
      </div>

      <form onSubmit={handleSubmit} className="glass space-y-4 p-5">
        <input
          className="input"
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
          className="w-full btn-primary py-3.5 text-[15px] disabled:opacity-50"
        >
          {busy ? 'Submitting…' : 'Request Reset'}
        </button>
      </form>
    </div>
  );
}
