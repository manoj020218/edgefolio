import { useState, type FormEvent } from 'react';
import { setBaseUrl, setCloudMode, clearOrgCode, checkCompanyCode, CLOUD_BASE_URL } from '../lib/api';

interface Props {
  onDone: (baseUrl: string) => void;
  onCreateCompany?: () => void;   // new company, app only (CreateCompanyPage)
}

// First-run screen. Two ways to connect:
// - Company code (EdgeFolio Cloud, default): works from anywhere. The code is shown on the
//   EdgeFolio desktop app under Settings → Cloud Attendance.
// - Office computer (Wi-Fi): the phone talks straight to the EdgeFolio PC on the office network
//   (the original LAN mode, unchanged).
export default function ServerSetupPage({ onDone, onCreateCompany }: Props) {
  const [mode, setMode] = useState<'cloud' | 'lan'>('cloud');
  const [code, setCode] = useState('');
  const [company, setCompany] = useState<string | null>(null);
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('7001');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function handleCloud(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(trimmed)) {
      setError('Enter the 6-character company code');
      return;
    }
    setChecking(true);
    try {
      const { companyName } = await checkCompanyCode(trimmed);
      if (company === null) {
        // First press: show which company this is, so a typo can't connect to the wrong one.
        setCompany(companyName || trimmed);
        return;
      }
      await setCloudMode(trimmed);
      onDone(CLOUD_BASE_URL);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setError(/not found/i.test(msg) ? 'That company code was not found. Check it with your HR/admin.' : msg || 'Could not reach EdgeFolio Cloud. Check your internet connection.');
      setCompany(null);
    } finally {
      setChecking(false);
    }
  }

  async function handleLan(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedIp = ip.trim();
    if (!trimmedIp) {
      setError('Enter the office computer’s network address');
      return;
    }
    const root = `http://${trimmedIp}:${port || '7001'}`;
    const base = `${root}/api/v1`;
    setChecking(true);
    try {
      // EDGE/backend/server.js only exposes an unauthenticated health check at
      // plain /health — /api/v1/health sits behind requireAuth and always 401s
      // for this pre-login check.
      const res = await fetch(`${root}/health`);
      if (!res.ok) throw new Error('Server did not respond');
      await clearOrgCode();
      await setBaseUrl(base);
      onDone(base);
    } catch {
      setError('Could not reach that address. Check the IP, port, and that both devices are on the same Wi-Fi.');
    } finally {
      setChecking(false);
    }
  }

  const input = 'w-full rounded-md border border-surface-light bg-surface px-3 py-2.5 text-slate-100 outline-none focus:border-brand-500';
  const tab = (active: boolean) =>
    `flex-1 rounded-md py-2 text-sm font-medium transition ${active ? 'bg-brand-500 text-white' : 'text-slate-300'}`;

  return (
    <div className="flex min-h-full flex-col justify-center px-6 py-10">
      <h1 className="mb-1 text-2xl font-semibold text-slate-100">Connect to EdgeFolio</h1>
      <p className="mb-6 text-sm text-slate-300">Ask your HR/admin which one your company uses.</p>

      <div className="mb-6 flex gap-1 rounded-lg bg-surface p-1">
        <button type="button" className={tab(mode === 'cloud')} onClick={() => { setMode('cloud'); setError(null); }}>Company code</button>
        <button type="button" className={tab(mode === 'lan')} onClick={() => { setMode('lan'); setError(null); }}>Office computer</button>
      </div>

      {mode === 'cloud' ? (
        <form onSubmit={handleCloud} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-slate-300" htmlFor="code">Company code</label>
            <input
              id="code"
              className={`${input} font-mono text-lg uppercase tracking-widest`}
              placeholder="ABC123"
              maxLength={6}
              value={code}
              onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setCompany(null); }}
              autoCapitalize="characters"
              autoCorrect="off"
            />
            <p className="mt-1 text-xs text-slate-400">Shown in the EdgeFolio desktop app under Settings → Cloud Attendance. Works from anywhere.</p>
          </div>

          {company !== null && (
            <div className="rounded-md border border-brand-500/50 bg-brand-500/10 px-3 py-2.5">
              <p className="text-xs text-slate-400">Company</p>
              <p className="font-medium text-slate-100">{company}</p>
            </div>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={checking}
            className="w-full rounded-md bg-brand-500 py-2.5 font-medium text-white transition hover:bg-brand-600 disabled:opacity-50"
          >
            {checking ? 'Checking…' : company !== null ? 'Yes, this is my company' : 'Continue'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleLan} className="space-y-4">
          <p className="text-sm text-slate-300">
            Only works on the office Wi-Fi. The address is shown on the EdgeFolio desktop app&rsquo;s Settings page.
          </p>
          <div>
            <label className="mb-1 block text-sm text-slate-300" htmlFor="ip">Office computer IP address</label>
            <input id="ip" className={input} placeholder="192.168.1.50" value={ip} onChange={(e) => setIp(e.target.value)} autoCapitalize="none" autoCorrect="off" />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-300" htmlFor="port">Port</label>
            <input id="port" className={input} value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={checking}
            className="w-full rounded-md bg-brand-500 py-2.5 font-medium text-white transition hover:bg-brand-600 disabled:opacity-50"
          >
            {checking ? 'Checking…' : 'Connect'}
          </button>
        </form>
      )}

      {onCreateCompany && (
        <p className="mt-8 text-center text-sm text-slate-400">
          New company?{' '}
          <button type="button" onClick={onCreateCompany} className="font-medium text-brand-400">Create it here</button>
        </p>
      )}
    </div>
  );
}
