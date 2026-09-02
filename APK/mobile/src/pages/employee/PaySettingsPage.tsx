import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Download } from 'lucide-react';
import { apiGet, ApiError } from '../../lib/api';

interface Payslip {
  id: string;
  month: string;
  gross: number;
  netSalary: number;
  status: string;
}

interface AttendanceMonth {
  month: string;
  present: number;
}

function formatMonth(m: string): string {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export default function PaySettingsPage() {
  const navigate = useNavigate();
  const [payslips, setPayslips] = useState<Payslip[] | null>(null);
  const [attendance, setAttendance] = useState<AttendanceMonth[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Payslip[]>('/payslips').then(setPayslips).catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load payslips.'));
    apiGet<AttendanceMonth[]>('/attendance-history').then(setAttendance).catch(() => {});
  }, []);

  const latest = payslips?.[0];

  return (
    <div className="px-5 pb-8" style={{ paddingTop: '52px' }}>
      <button onClick={() => navigate(-1)} className="mb-5 flex items-center gap-1 text-sm font-medium text-slate-300">
        <ChevronLeft size={18} /> Back
      </button>
      <h1 className="mb-5 text-xl font-bold text-slate-100">Pay Settings</h1>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {latest && (
        <div className="mb-5 rounded-2xl border border-surface-light bg-surface p-4.5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-slate-300">Latest Payslip</span>
            <span className="text-[11px] text-slate-500">{formatMonth(latest.month)}</span>
          </div>
          <div className="mb-1 flex items-center justify-between text-sm text-slate-300">
            <span>Gross</span>
            <span className="text-slate-100">&#8377;{latest.gross.toLocaleString('en-IN')}</span>
          </div>
          <div className="my-3 h-px bg-surface-light" />
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-100">Net Pay</span>
            <span className="text-lg font-bold text-success">&#8377;{latest.netSalary.toLocaleString('en-IN')}</span>
          </div>
        </div>
      )}

      <p className="mb-2.5 text-[11px] font-bold tracking-wide text-slate-500">PAYSLIPS</p>
      <div className="mb-5 flex flex-col gap-2">
        {!payslips && !error && <p className="text-sm text-slate-400">Loading…</p>}
        {payslips?.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-xl border border-surface-light bg-surface p-3.5">
            <span className="text-[13.5px] font-medium text-slate-100">{formatMonth(p.month)}</span>
            <Download size={16} className="text-brand-400" />
          </div>
        ))}
        {payslips && payslips.length === 0 && <p className="text-sm text-slate-400">No payslips yet.</p>}
      </div>

      <p className="mb-2.5 text-[11px] font-bold tracking-wide text-slate-500">ATTENDANCE HISTORY</p>
      <div className="flex flex-col gap-2">
        {attendance?.map((a) => (
          <div key={a.month} className="flex items-center justify-between rounded-xl border border-surface-light bg-surface p-3.5">
            <span className="text-[13.5px] font-medium text-slate-100">{formatMonth(a.month)}</span>
            <span className="text-xs text-slate-400">
              <span className="text-success">{a.present} present</span>
            </span>
          </div>
        ))}
        {attendance && attendance.length === 0 && <p className="text-sm text-slate-400">No attendance history yet.</p>}
      </div>
    </div>
  );
}
