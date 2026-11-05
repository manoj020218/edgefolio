import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Lock, User } from 'lucide-react';
import { apiGet, ApiError, isCloudModeSync, cachedOrgCodeSync, resetConnection } from '../lib/api';
import GoogleCompanySignIn from '../components/GoogleCompanySignIn';
import { useAuth } from '../lib/auth';
import ForgotPasswordPage from './ForgotPasswordPage';
import AppLogo from '../components/AppLogo';

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
    <div className="animate-enter flex min-h-full flex-col justify-center px-7 py-10">
      <div className="mb-10 flex flex-col items-center">
        <AppLogo />
        <h1 className="mb-1.5 text-[26px] font-extrabold leading-tight text-[#f4f5fb]">Welcome to <span className="text-gradient">EdgeFolio</span></h1>
        <p className="text-[13px] text-[#9aa0b8]">Sign in to mark attendance &amp; view your pay</p>
      </div>

      {step === 'empCode' && (
        <form onSubmit={handleCheckEmpCode} className="space-y-3.5">
          <div className="flex items-center gap-3 glass !rounded-2xl px-4 py-3.5 focus-within:border-brand-500/70 focus-within:ring-2 focus-within:ring-brand-500/50">
            <User size={18} className="flex-shrink-0 text-[#5d6380]" />
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
            className="w-full btn-primary py-3.5 text-[15px] disabled:opacity-50"
          >
            {busy ? 'Checking…' : 'Continue'}
            {!busy && <ArrowRight size={17} />}
          </button>
          <button
            type="button"
            onClick={() => setStep('forgot')}
            className="w-full pt-1 text-center text-[13px] font-semibold text-brand-300"
          >
            Forgot password?
          </button>
          {isCloudModeSync() && (
            <GoogleCompanySignIn
              disabled={busy}
              onSignedIn={() => navigate('/', { replace: true })}
              onError={setError}
            />
          )}
          <p className="pt-3 text-center text-[12px] text-slate-500">
            {isCloudModeSync() ? `Company code ${cachedOrgCodeSync() ?? ''}` : 'Office computer'}
            {' · '}
            <button
              type="button"
              className="font-medium text-brand-400"
              onClick={async () => { await resetConnection(); window.location.reload(); }}
            >
              Change company / server
            </button>
          </p>
        </form>
      )}

      {step === 'password' && (
        <form onSubmit={handleLogin} className="space-y-3.5">
          <div className="flex items-center justify-between glass !rounded-2xl px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/20 text-[13px] font-bold text-brand-300">
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
          <div className="flex items-center gap-3 glass !rounded-2xl px-4 py-3.5 focus-within:border-brand-500/70 focus-within:ring-2 focus-within:ring-brand-500/50">
            <Lock size={18} className="flex-shrink-0 text-[#5d6380]" />
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
            className="w-full btn-primary py-3.5 text-[15px] disabled:opacity-50"
          >
            {busy ? 'Signing in…' : 'Sign In'}
            {!busy && <ArrowRight size={17} />}
          </button>
        </form>
      )}
    </div>
  );
}
