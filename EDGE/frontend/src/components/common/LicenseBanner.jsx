import React, { useState, useEffect } from 'react';
import { AlertTriangle, X, ExternalLink } from 'lucide-react';
import { getLicenseStatus } from '../../services/api';

// LicenseBanner renders inside MainLayout (above page content).
// Shows: amber for expiring, red for grace/readonly.
// Does NOT show for valid/unlicensed (handled by ActivationPage gate in App.jsx).
export function LicenseBanner() {
  const [licenseInfo, setLicenseInfo] = useState(null);

  useEffect(() => {
    getLicenseStatus()
      .then((res) => setLicenseInfo(res.data))
      .catch(() => {});
  }, []);

  if (!licenseInfo) return null;

  const { state, daysLeft } = licenseInfo;

  if (state === 'expiring') {
    return (
      <BannerBar variant="amber">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        <span>
          License expires in <strong>{daysLeft} day{daysLeft !== 1 ? 's' : ''}</strong>. Renew now to avoid interruption.
        </span>
        <a
          href="https://wa.me/917240226566"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto flex items-center gap-1 underline font-semibold whitespace-nowrap"
        >
          Renew <ExternalLink className="w-3 h-3" />
        </a>
      </BannerBar>
    );
  }

  if (state === 'grace' || state === 'readonly') {
    const msg = state === 'grace'
      ? 'License has expired — grace period active. Renew immediately.'
      : 'License expired. App is in read-only mode. Export your data and renew.';
    return (
      <BannerBar variant="red">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        <span>{msg}</span>
        <a
          href="https://wa.me/917240226566"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto flex items-center gap-1 underline font-semibold whitespace-nowrap"
        >
          WhatsApp +91 72402 26566 <ExternalLink className="w-3 h-3" />
        </a>
      </BannerBar>
    );
  }

  return null;
}

function BannerBar({ variant, children }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const colorClass = variant === 'amber'
    ? 'bg-amber-900/80 border-amber-700 text-amber-200'
    : 'bg-red-900/80 border-red-700 text-red-200';

  return (
    <div className={`flex items-center gap-3 px-4 py-2 text-sm border-b ${colorClass}`}>
      {children}
      <button
        onClick={() => setDismissed(true)}
        className="flex-shrink-0 ml-2 p-0.5 rounded hover:opacity-70"
        title="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default LicenseBanner;
