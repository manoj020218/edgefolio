import { useState, type FormEvent } from 'react';
import { setBaseUrl } from '../lib/api';

interface Props {
  onDone: (baseUrl: string) => void;
}

// First-run screen: EDGE is a Windows PC on the local network, not a fixed
// cloud hostname, so the employee (or whoever sets up the phone) enters the
// PC's LAN IP once. Shown before login until a base URL is saved.
export default function ServerSetupPage({ onDone }: Props) {
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('7001');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function handleSubmit(e: FormEvent) {
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
      await setBaseUrl(base);
      onDone(base);
    } catch {
      setError('Could not reach that address. Check the IP, port, and that both devices are on the same Wi-Fi.');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col justify-center px-6 py-10">
      <h1 className="mb-1 text-2xl font-semibold text-slate-100">Connect to EdgeFolio</h1>
      <p className="mb-8 text-sm text-slate-300">
        Enter the network address of the office computer running EdgeFolio. Ask your HR/admin if you
        don&rsquo;t know it &mdash; it&rsquo;s shown on the EdgeFolio desktop app&rsquo;s Settings page.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm text-slate-300" htmlFor="ip">
            Office computer IP address
          </label>
          <input
            id="ip"
            className="w-full rounded-md border border-surface-light bg-surface px-3 py-2.5 text-slate-100 outline-none focus:border-brand-500"
            placeholder="192.168.1.50"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-slate-300" htmlFor="port">
            Port
          </label>
          <input
            id="port"
            className="w-full rounded-md border border-surface-light bg-surface px-3 py-2.5 text-slate-100 outline-none focus:border-brand-500"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            inputMode="numeric"
          />
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
    </div>
  );
}
