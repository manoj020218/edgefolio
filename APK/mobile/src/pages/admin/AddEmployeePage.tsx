import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Share } from '@capacitor/share';
import { Send, Copy, Check } from 'lucide-react';
import { apiPost } from '../../lib/api';
import { useAuth } from '../../lib/auth';

interface Created {
  empId: string;
  empCode: string;
  name: string;
  appRole: string;
  tempPassword: string;
  orgCode: string;
  appDownloadUrl: string;
}

// Add an employee to an app-only company (VPS/cloud POST /apk/employees). Shows the one-time
// temporary password and a ready-made invite to send them.
export default function AddEmployeePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [empCode, setEmpCode] = useState('');
  const [department, setDepartment] = useState('');
  const [role, setRole] = useState<'employee' | 'hr-admin' | 'owner'>('employee');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('Enter the employee’s name'); return; }
    setBusy(true);
    try {
      setCreated(await apiPost<Created>('/employees', {
        name: name.trim(), empCode: empCode.trim() || undefined, department: department.trim() || undefined, appRole: role,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the employee.');
    } finally {
      setBusy(false);
    }
  }

  async function sendInvite() {
    if (!created) return;
    try {
      await Share.share({
        title: 'Your EdgeFolio login',
        dialogTitle: `Send login to ${created.name}`,
        text: [
          `Hi ${created.name}, mark your attendance from your phone with EdgeFolio by Jenix.`,
          `1. Install the app: ${created.appDownloadUrl}`,
          `2. Choose "Company code" and enter ${created.orgCode}`,
          `3. Employee ID: ${created.empCode}`,
          `   Temporary password: ${created.tempPassword} (you'll set your own after logging in)`,
        ].join('\n'),
      });
    } catch { /* closed */ }
  }

  const input = 'w-full input !py-2.5';

  if (created) {
    return (
      <div className="animate-enter space-y-5 px-5 py-6">
        <h1 className="text-lg font-semibold text-slate-100">{created.name} added</h1>
        <div className="space-y-2 glass p-4">
          <p className="text-xs text-slate-400">Employee ID</p>
          <p className="font-mono text-lg text-slate-100">{created.empCode}</p>
          <p className="pt-2 text-xs text-slate-400">Temporary password — shown only now</p>
          <div className="flex items-center justify-between">
            <p className="font-mono text-lg text-amber-300">{created.tempPassword}</p>
            <button type="button" aria-label="Copy password" className="rounded-lg p-2 text-slate-300"
              onClick={async () => { try { await navigator.clipboard.writeText(created.tempPassword); setCopied(true); } catch { /* ignore */ } }}>
              {copied ? <Check size={18} className="text-green-400" /> : <Copy size={18} />}
            </button>
          </div>
        </div>
        <button type="button" onClick={sendInvite} className="flex w-full items-center justify-center gap-2 btn-primary py-3 font-semibold text-white">
          <Send size={17} /> Send login to {created.name}
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={() => { setCreated(null); setName(''); setEmpCode(''); setDepartment(''); setCopied(false); }}
            className="flex-1 input !py-2.5 text-sm">Add another</button>
          <button type="button" onClick={() => navigate('/admin/company')} className="flex-1 input !py-2.5 text-sm">Done</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-5 py-6">
      <h1 className="text-lg font-semibold text-slate-100">Add employee</h1>
      <div>
        <label className="mb-1 block text-sm text-slate-300" htmlFor="nm">Name</label>
        <input id="nm" className={input} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-sm text-slate-300" htmlFor="ec">Employee ID (optional)</label>
        <input id="ec" className={input} value={empCode} onChange={(e) => setEmpCode(e.target.value)} placeholder="Left empty: E0001, E0002…" autoCapitalize="characters" />
      </div>
      <div>
        <label className="mb-1 block text-sm text-slate-300" htmlFor="dp">Department (optional)</label>
        <input id="dp" className={input} value={department} onChange={(e) => setDepartment(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-sm text-slate-300" htmlFor="rl">Role</label>
        <select id="rl" className={input} value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
          <option value="employee">Employee</option>
          <option value="hr-admin">HR admin</option>
          {user?.role === 'owner' && <option value="owner">Owner</option>}
        </select>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="submit" disabled={busy} className="w-full btn-primary py-3 font-semibold text-white disabled:opacity-50">
        {busy ? 'Adding…' : 'Add employee'}
      </button>
    </form>
  );
}
