import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, HeadphonesIcon, Laptop, MessageSquareWarning, ShieldQuestion, Wallet } from 'lucide-react';
import { apiGet, apiPost, ApiError } from '../../lib/api';

type Category = 'hr' | 'complaint' | 'it' | 'payroll' | 'grievance';

const CATEGORIES: { key: Category; label: string; icon: typeof HeadphonesIcon; hint?: string }[] = [
  { key: 'hr', label: 'Contact HR', icon: HeadphonesIcon },
  { key: 'complaint', label: 'Raise a Complaint / Query', icon: MessageSquareWarning },
  { key: 'it', label: 'IT Support', icon: Laptop },
  { key: 'payroll', label: 'Payroll Query', icon: Wallet },
  { key: 'grievance', label: 'Anonymous Grievance', icon: ShieldQuestion, hint: 'Your identity is not shared with HR' },
];

interface Ticket {
  id: string;
  category: Category;
  subject: string;
  status: 'open' | 'in_progress' | 'resolved';
  createdAt: string;
}

export default function HelpSupportPage() {
  const navigate = useNavigate();
  const [composing, setComposing] = useState<Category | null>(null);
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiGet<Ticket[]>('/support-tickets')
      .then(setTickets)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load tickets.'));
  }

  useEffect(load, []);

  if (composing) {
    return <ComposeTicket category={composing} onBack={() => setComposing(null)} onSubmitted={() => { setComposing(null); load(); }} />;
  }

  return (
    <div className="px-5 pb-8" style={{ paddingTop: '52px' }}>
      <button onClick={() => navigate(-1)} className="mb-5 flex items-center gap-1 text-sm font-medium text-slate-300">
        <ChevronLeft size={18} /> Back
      </button>
      <h1 className="mb-5 text-xl font-bold text-slate-100">Help &amp; Support</h1>

      <div className="mb-5 flex flex-col gap-2.5">
        {CATEGORIES.map(({ key, label, icon: Icon, hint }) => (
          <button
            key={key}
            onClick={() => setComposing(key)}
            className="flex items-center gap-3.5 rounded-2xl border border-surface-light bg-surface p-4 text-left"
          >
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-500/15">
              <Icon size={18} className="text-brand-400" />
            </div>
            <div className="flex-1">
              <p className="text-[14.5px] font-semibold text-slate-100">{label}</p>
              {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
            </div>
            <ChevronRight size={16} className="text-slate-500" />
          </button>
        ))}
      </div>

      <p className="mb-2.5 text-[11px] font-bold tracking-wide text-slate-500">MY TICKETS</p>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex flex-col gap-2">
        {tickets?.map((t) => (
          <div key={t.id} className="rounded-xl border border-surface-light bg-surface p-3.5">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[13.5px] font-semibold text-slate-100">{t.subject}</span>
              <span
                className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                  t.status === 'resolved'
                    ? 'bg-success/15 text-success'
                    : t.status === 'in_progress'
                      ? 'bg-brand-500/15 text-brand-400'
                      : 'bg-warning/15 text-warning'
                }`}
              >
                {t.status.replace('_', ' ').toUpperCase()}
              </span>
            </div>
            <p className="text-[11.5px] text-slate-400">{new Date(t.createdAt).toLocaleDateString('en-IN')}</p>
          </div>
        ))}
        {tickets && tickets.length === 0 && <p className="text-sm text-slate-400">No tickets yet.</p>}
      </div>
    </div>
  );
}

function ComposeTicket({ category, onBack, onSubmitted }: { category: Category; onBack: () => void; onSubmitted: () => void }) {
  const label = CATEGORIES.find((c) => c.key === category)?.label ?? category;
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost('/support-tickets', { category, subject: subject.trim(), message: message.trim(), anonymous });
      onSubmitted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-5 pb-8" style={{ paddingTop: '52px' }}>
      <button onClick={onBack} className="mb-5 flex items-center gap-1 text-sm font-medium text-slate-300">
        <ChevronLeft size={18} /> Back
      </button>
      <h1 className="mb-5 text-xl font-bold text-slate-100">{label}</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-400">Subject</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-xl border border-surface-light bg-surface px-3 py-2.5 text-sm text-slate-100"
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-400">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            className="w-full rounded-xl border border-surface-light bg-surface px-3 py-2.5 text-sm text-slate-100"
          />
        </div>

        {category === 'grievance' && (
          <label className="flex items-center gap-2.5 text-sm text-slate-300">
            <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="h-4 w-4" />
            Submit anonymously (your identity won&rsquo;t be attached to this ticket)
          </label>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-2 rounded-xl bg-brand-500 py-3.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Submit'}
        </button>
      </form>
    </div>
  );
}
