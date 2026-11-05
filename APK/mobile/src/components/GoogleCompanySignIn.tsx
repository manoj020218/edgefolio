import { useState } from 'react';
import { Building2, ChevronRight, X } from 'lucide-react';
import { ApiError, cloudGoogleLogin, setCloudMode, type CloudSession } from '../lib/api';
import { googleIdToken } from '../lib/google';
import { useAuth } from '../lib/auth';

interface Props {
  label?: string;
  // Called after the company is saved and the session started.
  onSignedIn: (s: CloudSession) => void;
  // NO_ACCOUNT: this Google email is on no company. Default shows the server's message.
  onNoAccount?: (message: string) => void;
  onError?: (message: string | null) => void;
  disabled?: boolean;
}

// "Sign in with Google" that finds the company from the Google email — no company code needed
// (VPS/cloud POST /apk/auth/google). Works for owners, HR and any employee whose email is on
// their employee record. Several companies → the user picks one.
export default function GoogleCompanySignIn({ label = 'Sign in with Google', onSignedIn, onNoAccount, onError, disabled }: Props) {
  const { startSession } = useAuth();
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState<{ idToken: string; list: { orgCode: string; companyName: string }[] } | null>(null);

  async function finish(s: CloudSession) {
    await setCloudMode(s.orgCode);
    await startSession(s.token, s.user);
    onSignedIn(s);
  }

  async function run(idToken: string, orgCode?: string) {
    const res = await cloudGoogleLogin(idToken, orgCode);
    if ('chooseCompany' in res) { setChoices({ idToken, list: res.chooseCompany }); return; }
    setChoices(null);
    await finish(res);
  }

  async function start() {
    onError?.(null);
    setBusy(true);
    try {
      await run(await googleIdToken());
    } catch (err) {
      const msg = err instanceof Error && err.message ? err.message : 'Google sign-in failed.';
      if (err instanceof ApiError && err.code === 'NO_ACCOUNT' && onNoAccount) onNoAccount(msg);
      else onError?.(msg);
    } finally {
      setBusy(false);
    }
  }

  async function pick(orgCode: string) {
    if (!choices) return;
    setBusy(true);
    try {
      await run(choices.idToken, orgCode);
    } catch (err) {
      setChoices(null);
      onError?.(err instanceof Error && err.message ? err.message : 'Sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={busy || disabled}
        onClick={() => void start()}
        className="flex w-full items-center justify-center gap-2.5 rounded-full bg-white py-3.5 text-[14px] font-semibold text-slate-800 shadow-lg transition duration-150 active:scale-[0.97] disabled:opacity-50"
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.3 5.7c4.3-4 6.8-9.9 7-17.1z"/>
          <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z"/>
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.9 2.3-8.6 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/>
        </svg>
        {busy ? 'Signing in…' : label}
      </button>

      {choices && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={() => setChoices(null)}>
          <div className="glass w-full max-w-md space-y-3 !rounded-b-none p-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-bold text-slate-100">Choose your company</p>
              <button type="button" onClick={() => setChoices(null)} className="btn-ghost h-8 w-8 !rounded-full" aria-label="Close"><X size={16} /></button>
            </div>
            <p className="text-xs text-slate-400">This Google account is on more than one company.</p>
            <ul className="space-y-2">
              {choices.list.map((c) => (
                <li key={c.orgCode}>
                  <button type="button" disabled={busy} onClick={() => void pick(c.orgCode)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-left active:scale-[0.98] disabled:opacity-50">
                    <Building2 size={18} className="text-brand-300" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-slate-100">{c.companyName}</span>
                      <span className="font-mono text-xs text-slate-400">{c.orgCode}</span>
                    </span>
                    <ChevronRight size={16} className="text-slate-500" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
