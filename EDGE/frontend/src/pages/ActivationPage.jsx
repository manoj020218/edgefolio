import React, { useState } from 'react';
import { Key, Building2, Copy, Check, ArrowRight, UserPlus } from 'lucide-react';
import { Button, Input } from '../components/atomic';
import { activateLicense, signupTrial } from '../services/api';

// ── Shared card wrapper (module scope — never inside a component) ─────────────
const CardShell = ({ title, subtitle, icon: Icon, children }) => (
  <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4">
    <div className="absolute top-20 left-10 w-72 h-72 bg-sky-500 rounded-full mix-blend-multiply filter blur-3xl opacity-5 animate-pulse" />
    <div className="absolute bottom-20 right-10 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-5 animate-pulse" />

    <div className="w-full max-w-lg relative z-10">
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

// ── Trial signup tab ──────────────────────────────────────────────────────────
const TrialTab = ({ onSuccess }) => {
  const [form, setForm] = useState({ companyName: '', contactName: '', phone: '', email: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [issued, setIssued] = useState(null); // { licenseKey, expiresAt }
  const [copied, setCopied] = useState(false);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleCopy = () => {
    navigator.clipboard.writeText(issued.licenseKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await signupTrial(form);
      setIssued({ licenseKey: res.data.licenseKey, expiresAt: res.data.expiresAt });
    } catch (err) {
      setError(err.message || 'Signup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (issued) {
    return (
      <div className="space-y-5">
        <div className="bg-green-900/30 border border-green-700 rounded-lg p-4 text-center">
          <p className="text-green-300 font-semibold mb-1">Trial activated!</p>
          <p className="text-slate-400 text-xs">
            Valid until {issued.expiresAt ? new Date(issued.expiresAt).toLocaleDateString('en-IN') : '180 days'}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-slate-300 text-sm font-semibold">Your License Key</p>
          <div className="bg-slate-900 border border-sky-700 rounded-lg p-3 flex items-center gap-3">
            <span className="flex-1 font-mono text-sky-300 text-sm tracking-wider break-all">
              {issued.licenseKey}
            </span>
            <button
              onClick={handleCopy}
              className="flex-shrink-0 p-2 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
              title="Copy license key"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <div className="bg-amber-900/30 border border-amber-700/60 rounded-lg px-3 py-2">
            <p className="text-amber-300 text-xs font-semibold">Save this key somewhere safe.</p>
            <p className="text-amber-400/80 text-xs mt-0.5">
              You will need it to re-activate if you reinstall EDGEFOLIO on this machine.
            </p>
          </div>
        </div>

        <Button
          type="button"
          isFullWidth
          variant="primary"
          icon={ArrowRight}
          iconPosition="right"
          onClick={onSuccess}
        >
          Continue to Setup
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}

      <Input
        label="Company Name"
        placeholder="Your Company Ltd."
        icon={Building2}
        value={form.companyName}
        onChange={set('companyName')}
        required
      />
      <Input
        label="Your Name"
        placeholder="Full name"
        icon={UserPlus}
        value={form.contactName}
        onChange={set('contactName')}
        required
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Phone"
          placeholder="9876543210"
          value={form.phone}
          onChange={set('phone')}
          required
        />
        <Input
          type="email"
          label="Email"
          placeholder="you@company.com"
          value={form.email}
          onChange={set('email')}
          required
        />
      </div>

      <Button type="submit" isFullWidth isLoading={loading} icon={ArrowRight} iconPosition="right">
        {loading ? 'Creating trial...' : 'Start 180-Day Free Trial'}
      </Button>
      <p className="text-slate-500 text-xs text-center">
        No credit card required. 180 days, up to 25 employees.
      </p>
    </form>
  );
};

// ── Activate key tab ──────────────────────────────────────────────────────────
const ActivateTab = ({ onSuccess }) => {
  const [licenseKey, setLicenseKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await activateLicense(licenseKey.trim().toUpperCase());
      onSuccess();
    } catch (err) {
      setError(err.message || 'Activation failed. Please check your license key.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}

      <Input
        label="License Key"
        placeholder="EF-XXXX-XXXX-XXXX-XXXX"
        icon={Key}
        value={licenseKey}
        onChange={(e) => setLicenseKey(e.target.value)}
        required
      />

      <Button type="submit" isFullWidth isLoading={loading} icon={ArrowRight} iconPosition="right">
        {loading ? 'Activating...' : 'Activate License'}
      </Button>
      <p className="text-slate-500 text-xs text-center">
        Purchase a license or contact support at +91 72402 26566.
      </p>
    </form>
  );
};

// ── Tab button (module scope — never define components inside components) ─────
const TabBtn = ({ id, activeTab, onSelect, label }) => (
  <button
    type="button"
    onClick={() => onSelect(id)}
    className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
      activeTab === id
        ? 'bg-sky-500 text-white'
        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
    }`}
  >
    {label}
  </button>
);

// ── Main ActivationPage ───────────────────────────────────────────────────────
export const ActivationPage = ({ onActivated }) => {
  const [tab, setTab] = useState('trial'); // 'trial' | 'activate'

  return (
    <CardShell
      title="Activate EDGEFOLIO"
      subtitle="One-time online activation — then works fully offline"
      icon={Key}
    >
      {/* Tab switcher */}
      <div className="flex gap-2 bg-slate-900 rounded-lg p-1 mb-6">
        <TabBtn id="trial"    activeTab={tab} onSelect={setTab} label="Start Free Trial" />
        <TabBtn id="activate" activeTab={tab} onSelect={setTab} label="Enter License Key" />
      </div>

      {tab === 'trial' ? (
        <TrialTab onSuccess={onActivated} />
      ) : (
        <ActivateTab onSuccess={onActivated} />
      )}
    </CardShell>
  );
};

export default ActivationPage;
