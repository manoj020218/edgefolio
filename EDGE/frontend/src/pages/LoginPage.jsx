/**
 * EDGEFOLIO - Login Page
 * Beautiful, modern authentication UI with validation
 */

import React, { useState } from 'react';
import { Button, Input, Alert, Spinner } from '../components/atomic';
import { Lock, User, ArrowRight } from 'lucide-react';
import { COLORS } from '../theme/designSystem';

export const LoginPage = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [show2FA, setShow2FA] = useState(false);
  const [totpCode, setTotpCode] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1500));

      if (email === 'admin@edgefolio.com' && password === 'password') {
        setShow2FA(true);
      } else {
        setError('Invalid credentials. Try: admin@edgefolio.com / password');
      }
    } catch (err) {
      setError('Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify2FA = () => {
    if (totpCode === '123456') {
      onLoginSuccess?.({ email, rememberMe });
    } else {
      setError('Invalid 2FA code');
    }
  };

  if (show2FA) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 shadow-2xl">
            <div className="text-center mb-8">
              <div className="w-12 h-12 bg-sky-500 rounded-lg flex items-center justify-center mx-auto mb-4">
                <Lock className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-slate-100">Two-Factor Authentication</h2>
              <p className="text-slate-400 mt-2">Enter the code from your authenticator</p>
            </div>

            <Input
              type="text"
              placeholder="000000"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.slice(0, 6))}
              label="Authentication Code"
              className="text-center text-2xl tracking-widest mb-6"
            />

            <Button
              onClick={handleVerify2FA}
              isFullWidth
              isLoading={isLoading}
              icon={ArrowRight}
              iconPosition="right"
            >
              Verify & Login
            </Button>

            <button
              onClick={() => setShow2FA(false)}
              className="w-full mt-4 text-sm text-slate-400 hover:text-slate-200 transition-colors"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4">
      {/* Animated background elements */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-sky-500 rounded-full mix-blend-multiply filter blur-3xl opacity-5 animate-pulse" />
      <div className="absolute bottom-20 right-10 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-5 animate-pulse animation-delay-2000" />

      <div className="w-full max-w-md relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-sky-400 to-blue-600 rounded-xl shadow-lg mb-4">
            <span className="text-2xl font-bold text-white">EF</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-100">EDGEFOLIO</h1>
          <p className="text-slate-400 mt-2">Offline-First Payroll Management</p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
          <div className="px-8 py-8">
            {/* Error Alert */}
            {error && (
              <Alert
                variant="danger"
                message={error}
                onClose={() => setError('')}
                className="mb-6"
              />
            )}

            {/* Form */}
            <form onSubmit={handleLogin} className="space-y-5">
              {/* Email Input */}
              <Input
                type="email"
                label="Email Address"
                placeholder="admin@edgefolio.com"
                icon={User}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                helperText="Demo: admin@edgefolio.com"
              />

              {/* Password Input */}
              <Input
                type="password"
                label="Password"
                placeholder="••••••••"
                icon={Lock}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                helperText="Demo: password"
              />

              {/* Remember Me */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="rememberMe"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-700 cursor-pointer"
                />
                <label htmlFor="rememberMe" className="ml-3 text-sm text-slate-400 cursor-pointer hover:text-slate-300">
                  Remember me
                </label>
              </div>

              {/* Submit Button */}
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

            {/* Divider */}
            <div className="flex items-center my-6">
              <div className="flex-1 border-t border-slate-700" />
              <div className="px-3 text-xs text-slate-500 uppercase tracking-wider">Or</div>
              <div className="flex-1 border-t border-slate-700" />
            </div>

            {/* Guest Mode */}
            <Button
              variant="secondary"
              isFullWidth
              onClick={() => onLoginSuccess?.({ email: 'guest', isGuest: true })}
            >
              Demo Mode (No Setup Needed)
            </Button>
          </div>

          {/* Footer Info */}
          <div className="px-8 py-4 bg-slate-900 border-t border-slate-700 text-xs text-slate-500 space-y-2">
            <p>💡 <strong>Demo Credentials:</strong></p>
            <p>Email: admin@edgefolio.com</p>
            <p>Password: password</p>
            <p>2FA Code: 123456</p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-sm text-slate-500">
          <p>© 2026 EDGEFOLIO by Jenix. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
