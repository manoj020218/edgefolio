import { useState, type FormEvent } from 'react';
import { ApiError, cloudSignup, setCloudMode, CLOUD_BASE_URL } from '../lib/api';
import { googleIdToken } from '../lib/google';
import { useAuth } from '../lib/auth';

interface Props {
  onDone: (baseUrl: string) => void;   // switches the app to Cloud mode, signed in
  onBack: () => void;
}

// New company, app only — no office PC needed. Google sign-in identifies the owner; the cloud
// registers the company on the IoT billing platform and signs the owner in
// (VPS/cloud/src/routes/owner.js POST /apk/signup). Nothing about pricing is shown.
export default function CreateCompanyPage({ onDone, onBack }: Props) {
  const { startSession } = useAuth();
  const [idToken, setIdToken] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [useKey, setUseKey] = useState(false);
  const [licenseKey, setLicenseKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogle() {
    setError(null);
    setBusy(true);
    try {
      setIdToken(await googleIdToken());
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Google sign-in was cancelled.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!idToken) return;
    setError(null);
    if (!companyName.trim()) { setError('Enter your company name'); return; }
    if (!useKey && !/^\+?[\d\s-]{7,16}$/.test(phone.trim())) { setError('Enter a valid mobile number'); return; }
    if (useKey && !licenseKey.trim()) { setError('Enter your licence key'); return; }
    setBusy(true);
    try {
      const s = await cloudSignup({
        idToken, companyName: companyName.trim(), ownerName: ownerName.trim() || undefined,
        phone: useKey ? undefined : phone.trim(), licenseKey: useKey ? licenseKey.trim().toUpperCase() : undefined,
      });
      await setCloudMode(s.orgCode);
      await startSession(s.token, s.user);
      localStorage.setItem('edgefolio.justCreated', '1');   // land on the Company screen once
      onDone(CLOUD_BASE_URL);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      if (code === 'LICENCE_EXISTS') setUseKey(true);
      setError(err instanceof Error ? err.message : 'Could not create the company. Please try again.');
      if (code === 'Google sign-in was not accepted' || code === 'LICENCE_EMAIL_MISMATCH') setIdToken(null);
    } finally {
      setBusy(false);
    }
  }

  const input = 'input';
  const primary = 'w-full btn-primary py-3.5 text-[15px] disabled:opacity-50';

  return (
    <div className="animate-enter flex min-h-full flex-col justify-center px-6 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-3xl bg-brand text-3xl font-extrabold text-white shadow-glow">
          E
        </div>
        <h1 className="mb-1.5 text-[26px] font-extrabold leading-tight text-[#f4f5fb]">Create your <span className="text-gradient">company</span></h1>
        <p className="max-w-[300px] text-[13px] leading-relaxed text-[#9aa0b8]">Set up attendance for your team in a minute. No office computer needed — you can add EdgeFolio for Windows later for payroll and HR.</p>
      </div>

      {!idToken ? (
        <div className="space-y-4">
          <button type="button" onClick={handleGoogle} disabled={busy} className="flex w-full items-center justify-center gap-2.5 rounded-full bg-white py-3.5 text-[15px] font-semibold text-slate-800 shadow-lg transition duration-150 active:scale-[0.97] disabled:opacity-50">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.3 5.7c4.3-4 6.8-9.9 7-17.1z"/>
              <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z"/>
              <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.9 2.3-8.6 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/>
            </svg>
            {busy ? 'Opening Google…' : 'Continue with Google'}
          </button>
          <p className="text-xs text-slate-400">Your Google account becomes the owner login for this company.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="glass space-y-4 p-5">
          <div>
            <label className="label-caps mb-1.5 ml-1 block" htmlFor="cn">Company name</label>
            <input id="cn" className={input} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Sharma Constructions" />
          </div>
          <div>
            <label className="label-caps mb-1.5 ml-1 block" htmlFor="on">Your name</label>
            <input id="on" className={input} value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="As on your Google account" />
          </div>
          {!useKey ? (
            <div>
              <label className="label-caps mb-1.5 ml-1 block" htmlFor="ph">Mobile number</label>
              <input id="ph" className={input} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="98XXXXXXXX" />
            </div>
          ) : (
            <div>
              <label className="label-caps mb-1.5 ml-1 block" htmlFor="lk">EdgeFolio licence key</label>
              <input id="lk" className={`${input} font-mono uppercase`} value={licenseKey} onChange={(e) => setLicenseKey(e.target.value)} placeholder="EF-XXXX-XXXX-XXXX-XXXX" autoCapitalize="characters" />
              <p className="mt-1 text-xs text-slate-400">Shown in EdgeFolio for Windows under Settings → License, or in your sign-up email.</p>
            </div>
          )}
          <button type="button" className="text-xs font-semibold text-brand-300" onClick={() => { setUseKey(!useKey); setError(null); }}>
            {useKey ? 'I don’t have a licence key' : 'I already have an EdgeFolio licence key'}
          </button>

          {error && <p className="text-sm text-danger">{error}</p>}
          <button type="submit" disabled={busy} className={primary}>{busy ? 'Creating…' : 'Create company'}</button>
        </form>
      )}

      {error && !idToken && <p className="mt-3 text-sm text-danger">{error}</p>}
      <button type="button" onClick={onBack} className="mt-6 text-center text-sm font-medium text-[#9aa0b8]">Back</button>
    </div>
  );
}
