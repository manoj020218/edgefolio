import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Share } from '@capacitor/share';
import { Browser } from '@capacitor/browser';
import { Building2, Copy, Check, Monitor, UserPlus, Send, Download } from 'lucide-react';
import { apiGet } from '../../lib/api';
import { useAuth } from '../../lib/auth';

interface Company {
  orgCode: string;
  companyName: string;
  licenseKey: string | null;     // owner only
  ownerEmail: string | null;
  activeEmployees: number;
  linkedToPc: boolean;
  employeesManagedIn: 'app' | 'pc';
  pcDownloadUrl: string;
  appDownloadUrl: string;
}

// Owner/HR "Company" screen (VPS/cloud GET /apk/company): what to give staff and the accountant.
export default function CompanyPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [c, setC] = useState<Company | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    localStorage.removeItem('edgefolio.justCreated');
    apiGet<Company>('/company').then(setC).catch((e) => setError(e.message));
  }, []);

  async function copy(label: string, value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(label); setTimeout(() => setCopied(null), 1500); } catch { /* ignore */ }
  }

  async function share(title: string, text: string) {
    try { await Share.share({ title, text, dialogTitle: title }); }
    catch { /* user closed the share sheet */ }
  }

  function sharePc() {
    if (!c) return;
    const lines = [
      `EdgeFolio for Windows — payroll, salary slips and HR for ${c.companyName}.`,
      `Download: ${c.pcDownloadUrl}`,
      c.licenseKey ? `Licence key: ${c.licenseKey}` : null,
      `After installing: Settings → Cloud Attendance → Connect. Phone attendance for company code ${c.orgCode} then flows into payroll automatically.`,
    ].filter(Boolean);
    void share('Install EdgeFolio for Windows', lines.join('\n'));
  }

  function shareInvite() {
    if (!c) return;
    void share('Join on EdgeFolio', [
      `Join ${c.companyName} on EdgeFolio by Jenix to mark your attendance from your phone.`,
      `1. Install the app: ${c.appDownloadUrl}`,
      `2. Open it, choose "Company code" and enter ${c.orgCode}`,
      `3. Log in with your Employee ID and the password HR gives you.`,
    ].join('\n'));
  }

  async function exportMonth() {
    setExporting(true);
    setError(null);
    try {
      const { url } = await apiGet<{ url: string }>('/reports/attendance/link', { month });
      await Browser.open({ url });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the export.');
    } finally {
      setExporting(false);
    }
  }

  if (error && !c) return <p className="p-6 text-sm text-danger">{error}</p>;
  if (!c) return <p className="p-6 text-slate-400">Loading…</p>;

  const row = 'flex items-center justify-between gap-3 rounded-xl border border-surface-light bg-surface px-4 py-3';
  const btn = 'flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-semibold transition active:scale-[0.98]';

  return (
    <div className="space-y-5 px-5 py-6">
      <div className="flex items-center gap-3">
        <Building2 className="h-6 w-6 text-brand-400" />
        <div>
          <h1 className="text-lg font-semibold text-slate-100">{c.companyName}</h1>
          <p className="text-xs text-slate-400">{c.activeEmployees} active employee{c.activeEmployees === 1 ? '' : 's'}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-brand-500/40 bg-brand-500/10 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-400">Company code — staff type this in the app</p>
        <div className="mt-1 flex items-center justify-between">
          <span className="font-mono text-3xl font-bold tracking-[0.2em] text-sky-300">{c.orgCode}</span>
          <button type="button" onClick={() => copy('code', c.orgCode)} className="rounded-lg p-2 text-slate-300" aria-label="Copy company code">
            {copied === 'code' ? <Check size={18} className="text-green-400" /> : <Copy size={18} />}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {c.licenseKey && (
          <div className={row}>
            <div className="min-w-0">
              <p className="text-xs text-slate-400">Licence key (for EdgeFolio for Windows)</p>
              <p className="truncate font-mono text-[13px] text-slate-100">{c.licenseKey}</p>
            </div>
            <button type="button" onClick={() => copy('key', c.licenseKey!)} className="rounded-lg p-2 text-slate-300" aria-label="Copy licence key">
              {copied === 'key' ? <Check size={18} className="text-green-400" /> : <Copy size={18} />}
            </button>
          </div>
        )}
        <div className={row}>
          <div className="min-w-0">
            <p className="text-xs text-slate-400">Owner login</p>
            <p className="truncate text-[13px] text-slate-100">{c.ownerEmail ? `${c.ownerEmail} (Sign in with Google)` : '—'}</p>
          </div>
        </div>
      </div>

      <div className="space-y-2.5">
        <button type="button" onClick={shareInvite} className={`${btn} bg-brand-500 text-white`}>
          <Send size={17} /> Invite employees
        </button>
        {c.employeesManagedIn === 'app' ? (
          <button type="button" onClick={() => navigate('/admin/employees/new')} className={`${btn} border border-surface-light bg-surface text-slate-100`}>
            <UserPlus size={17} /> Add employee
          </button>
        ) : (
          <p className="px-1 text-xs text-slate-400">Employees are managed in EdgeFolio for Windows on your office computer.</p>
        )}
        <button type="button" onClick={sharePc} className={`${btn} border border-surface-light bg-surface text-slate-100`}>
          <Monitor size={17} /> Send PC software link (payroll &amp; HR)
        </button>
        {c.linkedToPc && <p className="px-1 text-xs text-green-400">Connected to EdgeFolio for Windows — attendance flows into payroll.</p>}
      </div>

      <div className="space-y-2 rounded-2xl border border-surface-light bg-surface p-4">
        <p className="text-sm font-medium text-slate-100">Export attendance</p>
        <div className="flex gap-2">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
            className="flex-1 rounded-lg border border-surface-light bg-surface px-3 py-2 text-slate-100" />
          <button type="button" onClick={exportMonth} disabled={exporting || !month} className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
            <Download size={15} /> {exporting ? '…' : 'Excel (CSV)'}
          </button>
        </div>
        <p className="text-xs text-slate-500">Opens in your browser; the download link works for 10 minutes.</p>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>

      {user?.role !== 'owner' && <p className="text-xs text-slate-500">The licence key is visible to the owner only.</p>}
    </div>
  );
}
