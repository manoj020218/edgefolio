import React, { useState, useEffect } from 'react';
import { Button, Input } from '../components/atomic';
import { Lock, User, ArrowRight, UserPlus } from 'lucide-react';
import { login, getAuthStatus, setupAdmin } from '../services/api';

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
        <p>© 2026 EDGEFOLIO by Jenix. All rights reserved.</p>
      </div>
    </div>
  </div>
);

export const LoginPage = ({ onLoginSuccess }) => {
  // 'loading' | 'setup' | 'login'
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
      const { token, user } = res.data;
      onLoginSuccess?.(user, token);
    } catch (err) {
      setSetupError(err.message || 'Setup failed. Please try again.');
    } finally {
      setSetupLoading(false);
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
      </form>
    </CardShell>
  );
};

export default LoginPage;
