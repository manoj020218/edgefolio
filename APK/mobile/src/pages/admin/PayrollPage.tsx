import { useEffect, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { apiGet, ApiError } from '../../lib/api';

interface PayrollRun {
  runId: string;
  monthKey: string;
  monthLabel: string;
  year: number;
  status: string;
  totalEmployees: number;
  processed: number;
  totalAmount: number;
  processedDate: string | null;
  processedBy: string | null;
}

interface Payslip {
  payslipId: string;
  empCode: string | null;
  employeeId: string;
  employeeName: string;
  month: string;
  basicSalary: number;
  gross: number;
  netSalary: number;
  status: string;
}

interface RunDetails {
  run: PayrollRun;
  payslips: Payslip[];
}

const money = (n: number) => `₹${n.toLocaleString('en-IN')}`;

// Read-only mobile view onto the same payrollEngine data desktop's PayrollPage.jsx
// uses — analysis only. Running/approving payroll and generating the bank payment
// file stay desktop-only (see EDGE/backend/controllers/apkController.js's handler
// comment for why).
export default function PayrollPage() {
  const [runs, setRuns] = useState<PayrollRun[] | null>(null);
  const [selected, setSelected] = useState<RunDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingRun, setLoadingRun] = useState(false);

  useEffect(() => {
    apiGet<PayrollRun[]>('/payroll')
      .then(setRuns)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load payroll runs.'));
  }, []);

  function openRun(runId: string) {
    setLoadingRun(true);
    setError(null);
    apiGet<RunDetails>(`/payroll/${runId}`)
      .then(setSelected)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this payroll run.'))
      .finally(() => setLoadingRun(false));
  }

  if (selected) {
    return (
      <div className="px-4 py-4">
        <button
          onClick={() => setSelected(null)}
          className="mb-3 flex items-center gap-1 text-sm text-slate-400"
        >
          <ChevronLeft size={16} /> Back to runs
        </button>

        <h1 className="mb-1 text-lg font-semibold text-slate-100">{selected.run.monthLabel}</h1>
        <p className="mb-4 text-xs capitalize text-slate-400">
          {selected.run.status} · {selected.run.totalEmployees} employees · {money(selected.run.totalAmount)}
        </p>

        <ul className="space-y-2">
          {selected.payslips.map((p) => (
            <li key={p.payslipId} className="rounded-lg border border-surface-light bg-surface p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-100">{p.employeeName}</p>
                  <p className="text-xs text-slate-400">{p.empCode || '—'}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-slate-100">{money(p.netSalary)}</p>
                  <p className="text-xs capitalize text-slate-500">{p.status}</p>
                </div>
              </div>
            </li>
          ))}
          {selected.payslips.length === 0 && (
            <p className="text-sm text-slate-400">No payslips in this run.</p>
          )}
        </ul>
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      <h1 className="mb-4 text-lg font-semibold text-slate-100">Payroll</h1>

      {error && <p className="text-sm text-danger">{error}</p>}
      {!error && !runs && <p className="text-sm text-slate-400">Loading…</p>}
      {loadingRun && <p className="text-sm text-slate-400">Loading run…</p>}

      {runs && (
        <ul className="space-y-2">
          {runs.map((r) => (
            <li key={r.runId}>
              <button
                onClick={() => openRun(r.runId)}
                className="w-full rounded-lg border border-surface-light bg-surface p-3 text-left"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-100">{r.monthLabel}</p>
                    <p className="text-xs text-slate-400">{r.totalEmployees} employees</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-100">{money(r.totalAmount)}</p>
                    <p className="text-xs capitalize text-slate-500">{r.status}</p>
                  </div>
                </div>
              </button>
            </li>
          ))}
          {runs.length === 0 && <p className="text-sm text-slate-400">No payroll runs yet.</p>}
        </ul>
      )}
    </div>
  );
}
