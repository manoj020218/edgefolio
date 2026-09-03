import React, { useState, useEffect } from 'react';
import { Button, Input } from '../components/atomic';
import { Lock, User, ArrowRight, UserPlus, KeyRound, ShieldCheck, Copy, Check } from 'lucide-react';
import { login, getAuthStatus, setupAdmin, resetWithRecoveryCode } from '../services/api';

// ── Shared card wrapper ───────────────────────────────────────────────────────
// Defined at module scope so React never re-creates the component type on
// LoginPage re-renders (which would unmount/remount and lose input focus).
const CardShell = ({ title, subtitle, icon: Icon, children }) => (
  <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4">
    <div className="absolute top-20 left-10 w-72 h-72 bg-sky-500 rounded-full mix-blend-multiply filter blur-3xl opacity-5 animate-pulse" />
    <div className="absolute bottom-20 right-10 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-5 animate-pulse" />

    <div className="w-full max-w-md relative z-10">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-sky-400 to-blue-600 rounded-xl shadow-lg mb-4">
          <span className="text-2xl font-bold text-white">EF</span>
        </div>
        <h1 className="text-3xl font-bold text-slate-100">EDGEFOLIO</h1>
        <p className="text-slate-400 mt-2">Offline-First Payroll Management</p>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
        <div className="px-8 py-8">
          <div className="text-center mb-6">
            <div className="w-12 h-12 bg-sky-500 rounded-lg flex items-center justify-center mx-auto mb-3">
              <Icon className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-xl font-bold text-slate-100">{title}</h2>
            {subtitle && <p className="text-slate-400 text-sm mt-1">{subtitle}</p>}
          </div>
          {children}
        </div>
      </div>

      <div className="mt-6 text-center text-sm text-slate-500">
        <p>© 2026 EDGEFOLIO by IOTSoft. All rights reserved.</p>
      </div>
    </div>
  </div>
);

export const LoginPage = ({ onLoginSuccess }) => {
  // 'loading' | 'setup' | 'recovery-code' | 'login' | 'recover'
  const [mode, setMode] = useState('loading');

  // Login form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Setup form state
  const [setupEmail, setSetupEmail] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirm, setSetupConfirm] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState('');

  // Recovery-code-shown-once step (right after setup)
  const [pendingLogin, setPendingLogin] = useState(null) // { user, token } — held until they confirm they saved the code
  const [shownRecoveryCode, setShownRecoveryCode] = useState('');
  const [recoveryCopied, setRecoveryCopied] = useState(false);
  const [recoveryConfirmed, setRecoveryConfirmed] = useState(false);

  // Forgot-password (recovery code) form state
  const [recoverEmail, setRecoverEmail] = useState('');
  const [recoverCode, setRecoverCode] = useState('');
  const [recoverNewPassword, setRecoverNewPassword] = useState('');
  const [recoverConfirm, setRecoverConfirm] = useState('');
  const [recoverLoading, setRecoverLoading] = useState(false);
  const [recoverError, setRecoverError] = useState('');
  const [recoverSuccess, setRecoverSuccess] = useState('');

  // On mount, check whether first-admin setup is needed
  useEffect(() => {
    getAuthStatus()
      .then((res) => {
        setMode(res.data?.setupRequired ? 'setup' : 'login');
      })
      .catch(() => {
        // If the status call fails (backend offline), still show login
        setMode('login');
      });
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const res = await login(email, password);
      const { token, user } = res.data;
      onLoginSuccess?.(user, token);
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetup = async (e) => {
    e.preventDefault();
    setSetupError('');

    if (setupPassword !== setupConfirm) {
      setSetupError('Passwords do not match');
      return;
    }
    if (setupPassword.length < 8) {
      setSetupError('Password must be at least 8 characters');
      return;
    }

    setSetupLoading(true);
    try {
      const res = await setupAdmin(setupEmail, setupPassword);
      const { token, user, recoveryCode } = res.data;
      // Hold off on actually logging in — this is the ONLY time the recovery
      // code will ever be shown. Force it onto its own screen with an
      // explicit confirmation before letting them into the app.
      setShownRecoveryCode(recoveryCode);
      setPendingLogin({ user, token });
      setMode('recovery-code');
    } catch (err) {
      setSetupError(err.message || 'Setup failed. Please try again.');
    } finally {
      setSetupLoading(false);
    }
  };

  const handleConfirmRecoveryCode = () => {
    if (pendingLogin) onLoginSuccess?.(pendingLogin.user, pendingLogin.token);
  };

  const handleCopyRecoveryCode = () => {
    navigator.clipboard?.writeText(shownRecoveryCode).then(() => {
      setRecoveryCopied(true);
      setTimeout(() => setRecoveryCopied(false), 2000);
    }).catch(() => {});
  };

  const handleRecover = async (e) => {
    e.preventDefault();
    setRecoverError(''); setRecoverSuccess('');

    if (recoverNewPassword !== recoverConfirm) {
      setRecoverError('Passwords do not match');
      return;
    }
    if (recoverNewPassword.length < 8) {
      setRecoverError('Password must be at least 8 characters');
      return;
    }

    setRecoverLoading(true);
    try {
      await resetWithRecoveryCode(recoverEmail, recoverCode, recoverNewPassword);
      setRecoverSuccess('Password reset. You can sign in now with your new password.');
      setEmail(recoverEmail);
      setPassword('');
      setRecoverCode(''); setRecoverNewPassword(''); setRecoverConfirm('');
    } catch (err) {
      setRecoverError(err.message || 'Reset failed. Check your email and recovery code.');
    } finally {
      setRecoverLoading(false);
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (mode === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-slate-400 text-sm">Loading EDGEFOLIO...</div>
      </div>
    );
  }

  // ── First-run: Create Admin Account ──────────────────────────────────────
  if (mode === 'setup') {
    return (
      <CardShell
        title="Create Admin Account"
        subtitle="First-time setup — create your administrator login"
        icon={UserPlus}
      >
        {setupError && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
            {setupError}
          </div>
        )}

        <form onSubmit={handleSetup} className="space-y-5">
          <Input
            type="email"
            label="Admin Email"
            placeholder="admin@yourcompany.com"
            icon={User}
            value={setupEmail}
            onChange={(e) => setSetupEmail(e.target.value)}
            required
          />

          <Input
            type="password"
            label="Password"
            placeholder="Min. 8 characters"
            icon={Lock}
            value={setupPassword}
            onChange={(e) => setSetupPassword(e.target.value)}
            required
          />

          <Input
            type="password"
            label="Confirm Password"
            placeholder="Re-enter your password"
            icon={Lock}
            value={setupConfirm}
            onChange={(e) => setSetupConfirm(e.target.value)}
            required
          />

          <Button
            type="submit"
            isFullWidth
            isLoading={setupLoading}
            icon={ArrowRight}
            iconPosition="right"
          >
            {setupLoading ? 'Creating account...' : 'Create Account & Sign In'}
          </Button>
        </form>
      </CardShell>
    );
  }

  // ── Recovery code shown once, right after setup ──────────────────────────
  if (mode === 'recovery-code') {
    return (
      <CardShell
        title="Save Your Recovery Code"
        subtitle="This is the only way back in if you ever forget your password"
        icon={ShieldCheck}
      >
        <div className="space-y-5">
          <div className="p-4 bg-amber-900/20 border border-amber-700/40 rounded-lg text-amber-300 text-sm">
            EDGEFOLIO runs offline, so there's no "email me a reset link." This code is the
            <strong> only</strong> way to get back into your admin account if you forget your
            password — it will never be shown again. Save it somewhere safe (a password manager,
            a printed copy) before continuing.
          </div>

          <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 flex items-center justify-between gap-3">
            <code className="text-xl font-mono tracking-wider text-sky-400 select-all">{shownRecoveryCode}</code>
            <button
              type="button"
              onClick={handleCopyRecoveryCode}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 flex-shrink-0"
            >
              {recoveryCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              {recoveryCopied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <label className="flex items-start gap-2.5 text-sm text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={recoveryConfirmed}
              onChange={(e) => setRecoveryConfirmed(e.target.checked)}
              className="mt-0.5"
            />
            I've saved this recovery code somewhere safe
          </label>

          <Button
            isFullWidth
            disabled={!recoveryConfirmed}
            icon={ArrowRight}
            iconPosition="right"
            onClick={handleConfirmRecoveryCode}
          >
            Continue to EDGEFOLIO
          </Button>
        </div>
      </CardShell>
    );
  }

  // ── Forgot Password (recovery code) ───────────────────────────────────────
  if (mode === 'recover') {
    return (
      <CardShell
        title="Reset Password"
        subtitle="Use the recovery code you saved during setup"
        icon={KeyRound}
      >
        {recoverError && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
            {recoverError}
          </div>
        )}
        {recoverSuccess && (
          <div className="mb-4 p-3 bg-green-900/30 border border-green-700 rounded-lg text-green-300 text-sm">
            {recoverSuccess}
          </div>
        )}

        <form onSubmit={handleRecover} className="space-y-5">
          <Input
            type="email"
            label="Email Address"
            placeholder="your@email.com"
            icon={User}
            value={recoverEmail}
            onChange={(e) => setRecoverEmail(e.target.value)}
            required
          />

          <Input
            type="text"
            label="Recovery Code"
            placeholder="XXXX-XXXX-XXXX-XXXX"
            icon={KeyRound}
            value={recoverCode}
            onChange={(e) => setRecoverCode(e.target.value)}
            required
          />

          <Input
            type="password"
            label="New Password"
            placeholder="Min. 8 characters"
            icon={Lock}
            value={recoverNewPassword}
            onChange={(e) => setRecoverNewPassword(e.target.value)}
            required
          />

          <Input
            type="password"
            label="Confirm New Password"
            placeholder="Re-enter your new password"
            icon={Lock}
            value={recoverConfirm}
            onChange={(e) => setRecoverConfirm(e.target.value)}
            required
          />

          <Button
            type="submit"
            isFullWidth
            isLoading={recoverLoading}
            icon={ArrowRight}
            iconPosition="right"
          >
            {recoverLoading ? 'Resetting...' : 'Reset Password'}
          </Button>

          <button
            type="button"
            onClick={() => { setMode('login'); setRecoverError(''); setRecoverSuccess(''); }}
            className="w-full text-center text-sm text-slate-400 hover:text-slate-200"
          >
            ← Back to Sign In
          </button>
        </form>

        <p className="mt-5 text-xs text-slate-500 text-center">
          Lost your recovery code too? Contact support — WhatsApp +91 72402 26566 or
          iotsoft.in@gmail.com.
        </p>
      </CardShell>
    );
  }

  // ── Normal Login ──────────────────────────────────────────────────────────
  return (
    <CardShell
      title="Sign In"
      subtitle={null}
      icon={Lock}
    >
      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-5">
        <Input
          type="email"
          label="Email Address"
          placeholder="your@email.com"
          icon={User}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <Input
          type="password"
          label="Password"
          placeholder="••••••••"
          icon={Lock}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <Button
          type="submit"
          isFullWidth
          isLoading={isLoading}
          icon={ArrowRight}
          iconPosition="right"
        >
          {isLoading ? 'Signing in...' : 'Sign In'}
        </Button>

        <button
          type="button"
          onClick={() => { setMode('recover'); setRecoverEmail(email); setError(''); }}
          className="w-full text-center text-sm text-sky-400 hover:text-sky-300"
        >
          Forgot password?
        </button>
      </form>
    </CardShell>
  );
};

export default LoginPage;
