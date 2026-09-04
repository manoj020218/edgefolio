import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Lock, User } from 'lucide-react';
import { apiGet, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import ForgotPasswordPage from './ForgotPasswordPage';

interface LoginCheckResponse {
  allowed: boolean;
  reason?: 'EMPLOYEE_NOT_FOUND' | 'LOGIN_BLOCKED';
  role?: string;
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<'empCode' | 'password' | 'forgot'>('empCode');
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

  if (step === 'forgot') {
    return <ForgotPasswordPage onBack={() => setStep('empCode')} />;
  }

  return (
    <div className="flex min-h-full flex-col justify-center px-7 py-10">
      <div className="mb-10 flex flex-col items-center">
        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-[26px] bg-gradient-to-br from-brand-500 to-brand-700 text-3xl font-bold text-white shadow-lg shadow-brand-900/40">
          E
        </div>
        <h1 className="mb-1 text-[22px] font-bold text-slate-100">Welcome to EdgeFolio</h1>
        <p className="text-[13px] text-slate-400">Sign in to mark attendance &amp; view your pay</p>
      </div>

      {step === 'empCode' && (
        <form onSubmit={handleCheckEmpCode} className="space-y-3.5">
          <div className="flex items-center gap-3 rounded-2xl border border-surface-light bg-surface px-4 py-3.5 focus-within:border-brand-500">
            <User size={18} className="flex-shrink-0 text-slate-500" />
            <input
              id="empCode"
              className="w-full bg-transparent text-[15px] text-slate-100 outline-none placeholder:text-slate-500"
              placeholder="Employee ID or email"
              value={empCode}
              onChange={(e) => setEmpCode(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              autoFocus
            />
          </div>
          {error && <p className="px-1 text-[13px] text-danger">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-brand-900/30 transition active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? 'Checking…' : 'Continue'}
            {!busy && <ArrowRight size={17} />}
          </button>
          <button
            type="button"
            onClick={() => setStep('forgot')}
            className="w-full pt-1 text-center text-[13px] font-medium text-brand-400"
          >
            Forgot password?
          </button>
        </form>
      )}

      {step === 'password' && (
        <form onSubmit={handleLogin} className="space-y-3.5">
          <div className="flex items-center justify-between rounded-2xl border border-surface-light bg-surface px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/15 text-[13px] font-bold text-brand-400">
                {empCode[0]?.toUpperCase() ?? '?'}
              </div>
              <span className="text-[14px] font-medium text-slate-100">{empCode}</span>
            </div>
            <button
              type="button"
              className="text-[12.5px] font-semibold text-brand-400"
              onClick={() => {
                setStep('empCode');
                setPassword('');
                setError(null);
              }}
            >
              Change
            </button>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-surface-light bg-surface px-4 py-3.5 focus-within:border-brand-500">
            <Lock size={18} className="flex-shrink-0 text-slate-500" />
            <input
              id="password"
              type="password"
              className="w-full bg-transparent text-[15px] text-slate-100 outline-none placeholder:text-slate-500"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          {error && <p className="px-1 text-[13px] text-danger">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-brand-900/30 transition active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? 'Signing in…' : 'Sign In'}
            {!busy && <ArrowRight size={17} />}
          </button>
        </form>
      )}
    </div>
  );
}
