import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

interface LoginCheckResponse {
  allowed: boolean;
  reason?: 'EMPLOYEE_NOT_FOUND' | 'LOGIN_BLOCKED';
  role?: string;
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<'empCode' | 'password'>('empCode');
  const [empCode, setEmpCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCheckEmpCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const code = empCode.trim();
    if (!code) return;

    setBusy(true);
    try {
      const res = await apiGet<LoginCheckResponse>('/login-check', { empCode: code });
      if (!res.allowed) {
        setError(
          res.reason === 'LOGIN_BLOCKED'
            ? 'Mobile access is disabled for this Employee ID. Contact HR.'
            : 'Employee ID not found.',
        );
        return;
      }
      setStep('password');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!password) return;

    setBusy(true);
    try {
      await login(empCode.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col justify-center px-6 py-10">
      <h1 className="mb-1 text-2xl font-semibold text-slate-100">EdgeFolio</h1>
      <p className="mb-8 text-sm text-slate-300">Sign in with your Employee ID.</p>

      {step === 'empCode' && (
        <form onSubmit={handleCheckEmpCode} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-slate-300" htmlFor="empCode">
              Employee ID
            </label>
            <input
              id="empCode"
              className="w-full rounded-md border border-surface-light bg-surface px-3 py-2.5 text-slate-100 outline-none focus:border-brand-500"
              placeholder="EMP003"
              value={empCode}
              onChange={(e) => setEmpCode(e.target.value)}
              autoCapitalize="characters"
              autoCorrect="off"
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-brand-500 py-2.5 font-medium text-white transition hover:bg-brand-600 disabled:opacity-50"
          >
            {busy ? 'Checking…' : 'Continue'}
          </button>
        </form>
      )}

      {step === 'password' && (
        <form onSubmit={handleLogin} className="space-y-4">
          <p className="text-sm text-slate-300">
            Employee ID: <span className="font-medium text-slate-100">{empCode}</span>{' '}
            <button
              type="button"
              className="text-brand-500 underline"
              onClick={() => {
                setStep('empCode');
                setPassword('');
                setError(null);
              }}
            >
              change
            </button>
          </p>
          <div>
            <label className="mb-1 block text-sm text-slate-300" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="w-full rounded-md border border-surface-light bg-surface px-3 py-2.5 text-slate-100 outline-none focus:border-brand-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-brand-500 py-2.5 font-medium text-white transition hover:bg-brand-600 disabled:opacity-50"
          >
            {busy ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      )}
    </div>
  );
}
