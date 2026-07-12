import React from 'react';
import { AlertTriangle, X, ExternalLink } from 'lucide-react';

// Shown when an API call returns code LICENSE_READONLY or LICENSE_EMPLOYEE_LIMIT.
// Usage: <LicenseErrorModal code={errCode} message={errMsg} onClose={() => setErr(null)} />
export function LicenseErrorModal({ code, message, onClose }) {
  if (!code) return null;

  const isReadonly = code === 'LICENSE_READONLY';
  const isLimit    = code === 'LICENSE_EMPLOYEE_LIMIT';

  if (!isReadonly && !isLimit) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-900/40 border border-red-700 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="text-slate-100 font-semibold">
                {isReadonly ? 'License Expired' : 'Employee Limit Reached'}
              </h3>
              <p className="text-slate-400 text-xs mt-0.5">
                {isReadonly ? 'Read-only mode active' : 'Plan upgrade required'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message */}
        <p className="text-slate-300 text-sm">{message}</p>

        {/* CTA */}
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-400">
          {isReadonly
            ? 'Your license has expired. You can still view reports and export data. To resume full access, renew your license.'
            : 'You have reached the maximum number of active employees for your plan. Upgrade to add more.'}
        </div>

        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors"
          >
            Dismiss
          </button>
          <a
            href="https://wa.me/917240226566"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition-colors"
          >
            Contact Support <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}

export default LicenseErrorModal;
