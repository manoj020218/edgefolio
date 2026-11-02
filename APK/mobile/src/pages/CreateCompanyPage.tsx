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

  const input = 'w-full rounded-md border border-surface-light bg-surface px-3 py-2.5 text-slate-100 outline-none focus:border-brand-500';
  const primary = 'w-full rounded-md bg-brand-500 py-2.5 font-medium text-white transition hover:bg-brand-600 disabled:opacity-50';

  return (
    <div className="flex min-h-full flex-col justify-center px-6 py-10">
      <h1 className="mb-1 text-2xl font-semibold text-slate-100">Create your company</h1>
      <p className="mb-6 text-sm text-slate-300">
        Set up attendance for your team in a minute. No office computer needed — you can add EdgeFolio for Windows later
        for payroll and HR.
      </p>

      {!idToken ? (
        <div className="space-y-4">
          <button type="button" onClick={handleGoogle} disabled={busy} className={`${primary} flex items-center justify-center gap-2`}>
            {busy ? 'Opening Google…' : 'Continue with Google'}
          </button>
          <p className="text-xs text-slate-400">Your Google account becomes the owner login for this company.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-slate-300" htmlFor="cn">Company name</label>
            <input id="cn" className={input} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Sharma Constructions" />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-300" htmlFor="on">Your name</label>
            <input id="on" className={input} value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="As on your Google account" />
          </div>
          {!useKey ? (
            <div>
              <label className="mb-1 block text-sm text-slate-300" htmlFor="ph">Mobile number</label>
              <input id="ph" className={input} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="98XXXXXXXX" />
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-sm text-slate-300" htmlFor="lk">EdgeFolio licence key</label>
              <input id="lk" className={`${input} font-mono uppercase`} value={licenseKey} onChange={(e) => setLicenseKey(e.target.value)} placeholder="EF-XXXX-XXXX-XXXX-XXXX" autoCapitalize="characters" />
              <p className="mt-1 text-xs text-slate-400">Shown in EdgeFolio for Windows under Settings → License, or in your sign-up email.</p>
            </div>
          )}
          <button type="button" className="text-xs font-medium text-brand-400" onClick={() => { setUseKey(!useKey); setError(null); }}>
            {useKey ? 'I don’t have a licence key' : 'I already have an EdgeFolio licence key'}
          </button>

          {error && <p className="text-sm text-danger">{error}</p>}
          <button type="submit" disabled={busy} className={primary}>{busy ? 'Creating…' : 'Create company'}</button>
        </form>
      )}

      {error && !idToken && <p className="mt-3 text-sm text-danger">{error}</p>}
      <button type="button" onClick={onBack} className="mt-6 text-center text-sm text-slate-400">Back</button>
    </div>
  );
}
