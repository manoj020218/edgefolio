import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Share } from '@capacitor/share';
import { Browser } from '@capacitor/browser';
import { Building2, Copy, Check, Monitor, UserPlus, Send, Download, Clock, CalendarDays, ChevronRight, Pencil, X } from 'lucide-react';
import { apiGet, apiPatch, isCloudModeSync } from '../../lib/api';
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
  const [editName, setEditName] = useState<string | null>(null);   // non-null = editing
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  async function saveName() {
    const name = (editName ?? '').trim();
    if (name.length < 2) { setNameError('Enter the company name'); return; }
    setSavingName(true);
    setNameError(null);
    try {
      const r = await apiPatch<{ companyName: string }>('/company', { companyName: name });
      setC((prev) => (prev ? { ...prev, companyName: r.companyName } : prev));
      setEditName(null);
    } catch (e) {
      setNameError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSavingName(false);
    }
  }

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

  // App-only company: every invite is personal - "Invite employee" creates the Employee ID and a
  // temporary password and its message carries them. PC-managed company: HR issues logins in
  // EdgeFolio for Windows, so this shares the app link + company code only.
  function shareInvite() {
    if (!c) return;
    if (c.employeesManagedIn === 'app') { navigate('/admin/employees/new'); return; }
    void share('Join on EdgeFolio', [
      `Join ${c.companyName} on EdgeFolio by Jenix to mark your attendance from your phone.`,
      `1. Install the app: ${c.appDownloadUrl}`,
      `2. Open it, choose "Company code" and enter ${c.orgCode}`,
      `3. Log in with the Employee ID and password your HR sends you.`,
    ].join('\n'));
  }

  // excel: UTF-8 with BOM, Employee IDs kept as text. csv: plain UTF-8 (no BOM) for payroll software.
  // Both: ISO 8601 times with offset, worked minutes + hours (2 dp), night shifts on one row.
  async function exportMonth(format: 'excel' | 'csv') {
    setExporting(true);
    setError(null);
    try {
      const { url } = await apiGet<{ url: string }>('/reports/attendance/link', { month, format });
      await Browser.open({ url });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the export.');
    } finally {
      setExporting(false);
    }
  }

  if (error && !c) return <p className="p-6 text-sm text-danger">{error}</p>;
  if (!c) return <p className="p-6 text-slate-400">Loading…</p>;

  const row = 'flex items-center justify-between gap-3 glass px-4 py-3';
  const btn = 'flex w-full items-center justify-center gap-2.5 rounded-2xl py-3.5 text-[14px] font-semibold transition duration-150 active:scale-[0.97]';

  return (
    <div className="animate-enter space-y-5 px-5 py-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand shadow-glow"><Building2 className="h-5 w-5 text-white" /></div>
        {editName === null ? (
          <>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-extrabold text-[#f4f5fb]">{c.companyName}</h1>
              <p className="text-xs text-slate-400">{c.activeEmployees} active employee{c.activeEmployees === 1 ? '' : 's'}</p>
            </div>
            {user?.role === 'owner' && !c.linkedToPc && (
              <button type="button" onClick={() => { setEditName(c.companyName); setNameError(null); }} className="btn-ghost h-9 w-9 !rounded-full text-slate-200" aria-label="Edit company name">
                <Pencil size={15} />
              </button>
            )}
          </>
        ) : (
          <div className="min-w-0 flex-1 space-y-2">
            <input className="input !py-2.5" value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={120} autoFocus aria-label="Company name" />
            {nameError && <p className="text-xs text-danger">{nameError}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditName(null)} className="btn-ghost flex-1 py-2 text-xs"><X size={13} /> Cancel</button>
              <button type="button" disabled={savingName} onClick={() => void saveName()} className="btn-primary flex-1 py-2 text-sm disabled:opacity-50">{savingName ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        )}
      </div>
      {c.linkedToPc && user?.role === 'owner' && (
        <p className="-mt-3 px-1 text-[11.5px] text-slate-500">Company name comes from EdgeFolio on the office PC — change it there.</p>
      )}

      <div className="rounded-4xl bg-brand p-[1.5px] shadow-glow">
       <div className="rounded-[26.5px] bg-[#0d0f18]/95 p-5 backdrop-blur-xl">
        <p className="label-caps">Company code — staff type this in the app</p>
        <div className="mt-1 flex items-center justify-between">
          <span className="font-mono text-5xl font-extrabold tracking-[0.18em] text-gradient">{c.orgCode}</span>
          <button type="button" onClick={() => copy('code', c.orgCode)} className="btn-ghost h-10 w-10 !rounded-full text-slate-200" aria-label="Copy company code">
            {copied === 'code' ? <Check size={18} className="text-success" /> : <Copy size={18} />}
          </button>
        </div>
       </div>
      </div>

      <div className="space-y-2">
        {c.licenseKey && (
          <div className={row}>
            <div className="min-w-0">
              <p className="label-caps">Licence key (for EdgeFolio for Windows)</p>
              <p className="truncate font-mono text-[13px] text-slate-100">{c.licenseKey}</p>
            </div>
            <button type="button" onClick={() => copy('key', c.licenseKey!)} className="btn-ghost h-9 w-9 flex-shrink-0 !rounded-full text-slate-200" aria-label="Copy licence key">
              {copied === 'key' ? <Check size={18} className="text-success" /> : <Copy size={18} />}
            </button>
          </div>
        )}
        <div className={row}>
          <div className="min-w-0">
            <p className="label-caps">Owner login</p>
            <p className="truncate text-[13px] text-slate-100">{c.ownerEmail ? `${c.ownerEmail} (Sign in with Google)` : '—'}</p>
          </div>
        </div>
      </div>

      <div className="space-y-2.5">
        <button type="button" onClick={shareInvite} className={`${btn} btn-primary`}>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20">
            {c.employeesManagedIn === 'app' ? <UserPlus size={15} /> : <Send size={15} />}
          </span>
          {c.employeesManagedIn === 'app' ? 'Invite employee' : 'Invite employees'}
        </button>
        {c.employeesManagedIn === 'app' ? (
          <p className="px-1 text-xs text-slate-400">Type the employee&rsquo;s name &mdash; the app creates their Employee ID and a temporary password, then sends the app link, company code and login in one message.</p>
        ) : (
          <p className="px-1 text-xs text-slate-400">Employees are managed in EdgeFolio for Windows on your office computer.</p>
        )}
        <button type="button" onClick={sharePc} className={`${btn} btn-ghost`}>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500/25 text-brand-300"><Monitor size={15} /></span> Send PC software link (payroll &amp; HR)
        </button>
        {c.linkedToPc && <p className="px-1 text-xs text-success">Connected to EdgeFolio for Windows — attendance flows into payroll.</p>}
      </div>

      {isCloudModeSync() && (
        <div className="space-y-2">
          <button type="button" onClick={() => navigate('/admin/shifts')} className={`${row} w-full text-left active:scale-[0.98]`}>
            <span className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/25 text-brand-300"><Clock size={15} /></span>
              <span className="text-[14px] font-semibold text-slate-100">Shifts &amp; working hours</span>
            </span>
            <ChevronRight size={16} className="text-slate-500" />
          </button>
          <button type="button" onClick={() => navigate('/admin/holidays')} className={`${row} w-full text-left active:scale-[0.98]`}>
            <span className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-500/20 text-purple-300"><CalendarDays size={15} /></span>
              <span className="text-[14px] font-semibold text-slate-100">Holidays</span>
            </span>
            <ChevronRight size={16} className="text-slate-500" />
          </button>
        </div>
      )}

      <div className="space-y-2 glass p-4">
        <p className="text-sm font-bold text-[#f4f5fb]">Export attendance</p>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="input !py-2.5" />
        <div className="flex gap-2">
          <button type="button" onClick={() => void exportMonth('excel')} disabled={exporting || !month} className="btn-primary flex-1 gap-1.5 px-3 py-2.5 text-sm disabled:opacity-50">
            <Download size={15} /> {exporting ? '…' : 'Excel'}
          </button>
          <button type="button" onClick={() => void exportMonth('csv')} disabled={exporting || !month} className="btn-ghost flex-1 gap-1.5 px-3 py-2.5 text-sm disabled:opacity-50">
            <Download size={15} /> CSV (for software)
          </button>
        </div>
        <p className="text-xs text-slate-500">Times include the time zone (ISO 8601). A night shift (e.g. 8 PM–4 AM) is one row on the day it started. The link works for 10 minutes.</p>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>

      {user?.role !== 'owner' && <p className="text-xs text-slate-500">The licence key is visible to the owner only.</p>}
    </div>
  );
}
