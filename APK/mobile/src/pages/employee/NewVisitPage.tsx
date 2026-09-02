import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { apiPost, ApiError } from '../../lib/api';

export default function NewVisitPage() {
  const navigate = useNavigate();
  const [customerName, setCustomerName] = useState('');
  const [location, setLocation] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [purpose, setPurpose] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!customerName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost('/visits', {
        customerName: customerName.trim(),
        location: location.trim() || undefined,
        contactPerson: contactPerson.trim() || undefined,
        purpose: purpose.trim() || undefined,
        scheduledFor: new Date().toISOString().slice(0, 10),
      });
      navigate('/work');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add visit.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-5 pb-8" style={{ paddingTop: '52px' }}>
      <button onClick={() => navigate(-1)} className="mb-5 flex items-center gap-1 text-sm font-medium text-slate-300">
        <ChevronLeft size={18} /> Back
      </button>
      <h1 className="mb-5 text-xl font-bold text-slate-100">Add Visit</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-400">Customer Name</label>
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="w-full rounded-xl border border-surface-light bg-surface px-3 py-2.5 text-sm text-slate-100"
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-400">Location</label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Area, city"
            className="w-full rounded-xl border border-surface-light bg-surface px-3 py-2.5 text-sm text-slate-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-400">Contact Person</label>
          <input
            value={contactPerson}
            onChange={(e) => setContactPerson(e.target.value)}
            className="w-full rounded-xl border border-surface-light bg-surface px-3 py-2.5 text-sm text-slate-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-400">Purpose</label>
          <input
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            className="w-full rounded-xl border border-surface-light bg-surface px-3 py-2.5 text-sm text-slate-100"
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-2 rounded-xl bg-brand-500 py-3.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? 'Adding…' : 'Add Visit'}
        </button>
      </form>
    </div>
  );
}
