import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiPost, ApiError } from '../../lib/api';

type BroadcastType = 'sos' | 'holiday' | 'event' | 'general';

const TYPES: { value: BroadcastType; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'event', label: 'Event' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'sos', label: 'SOS (urgent)' },
];

export default function BroadcastPage() {
  const navigate = useNavigate();
  const [type, setType] = useState<BroadcastType>('general');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<number | null>(null);

  async function send() {
    if (!message.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<{ id: string; sentTo: number }>('/broadcast', { type, message: message.trim() });
      setSentTo(res.sentTo);
      setMessage('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Broadcast failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-4 py-4">
      <button onClick={() => navigate(-1)} className="mb-4 text-sm text-brand-500 underline">
        ← Back
      </button>

      <h1 className="mb-4 text-lg font-semibold text-slate-100">Broadcast</h1>

      {sentTo !== null && (
        <p className="mb-4 rounded-md border border-success bg-surface p-3 text-sm text-slate-100">
          Sent to {sentTo} device{sentTo === 1 ? '' : 's'}.
        </p>
      )}
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      <div className="mb-3 flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => setType(t.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              type === t.value ? 'bg-brand-500 text-white' : 'bg-surface-light text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Message for all employees…"
        rows={5}
        className="mb-4 w-full rounded-md border border-surface-light bg-surface px-3 py-2 text-sm text-slate-100"
      />

      <button
        disabled={busy || !message.trim()}
        onClick={() => void send()}
        className="w-full rounded-md bg-brand-500 py-2.5 font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Sending…' : 'Send Broadcast'}
      </button>
    </div>
  );
}
