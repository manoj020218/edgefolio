import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Navigation, Plus, User } from 'lucide-react';
import { apiGet, apiPost, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Location } from '@jenix/cap-location';

interface Visit {
  id: string;
  customerName: string;
  location: string | null;
  contactPerson: string | null;
  purpose: string | null;
  status: 'scheduled' | 'checked_in' | 'completed';
  scheduledFor: string | null;
}

// Role-adaptive Work tab: field/sales employees (user.isFieldEmployee) see today's
// customer visits; everyone else sees a simple read-only attendance status card —
// the actual mark-attendance flow lives on Home/AttendancePage, not duplicated here.
export default function WorkPage() {
  const { user } = useAuth();

  if (!user?.isFieldEmployee) {
    return (
      <div className="px-5" style={{ paddingTop: '52px' }}>
        <h1 className="mb-4 text-xl font-bold text-slate-100">Work</h1>
        <div className="rounded-2xl border border-surface-light bg-surface p-4">
          <p className="text-sm text-slate-300">
            Your attendance is tracked from the office machine or the Home tab. There&rsquo;s nothing
            else to manage here for your role.
          </p>
        </div>
      </div>
    );
  }

  return <VisitsList />;
}

function VisitsList() {
  const navigate = useNavigate();
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    apiGet<Visit[]>('/visits/today')
      .then(setVisits)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load visits.'));
  }

  useEffect(load, []);

  async function checkIn(visit: Visit) {
    setBusyId(visit.id);
    setError(null);
    try {
      let coords: { lat?: number; lon?: number } = {};
      try {
        const perm = await Location.checkPermissions();
        if (perm.location === 'granted') {
          const loc = (await Location.getCurrentLocation()) as { latitude?: number; longitude?: number };
          coords = { lat: loc.latitude, lon: loc.longitude };
        }
      } catch {
        // GPS optional for check-in — proceed without it rather than block the visit
      }
      await apiPost(`/visits/${visit.id}/check-in`, coords);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Check-in failed.');
    } finally {
      setBusyId(null);
    }
  }

  const scheduled = visits?.filter((v) => v.status !== 'completed') ?? [];
  const completed = visits?.filter((v) => v.status === 'completed') ?? [];

  return (
    <div className="px-5" style={{ paddingTop: '52px' }}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Today&rsquo;s Visits</h1>
          {visits && (
            <p className="mt-0.5 text-xs text-slate-400">
              {scheduled.length} scheduled &middot; {completed.length} completed
            </p>
          )}
        </div>
        <button
          onClick={() => navigate('/work/new-visit')}
          className="flex items-center gap-1.5 rounded-xl border border-surface-light bg-surface px-3 py-2 text-xs font-semibold text-brand-400"
        >
          <Plus size={14} /> Add
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      {!error && !visits && <p className="text-sm text-slate-400">Loading…</p>}

      <div className="flex flex-col gap-3">
        {scheduled.map((v) => (
          <div
            key={v.id}
            className={`rounded-2xl border p-4 ${v.status === 'checked_in' ? 'border-brand-500' : 'border-surface-light'} bg-surface`}
          >
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-[15px] font-bold text-slate-100">{v.customerName}</span>
              <span
                className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                  v.status === 'checked_in' ? 'bg-brand-500/15 text-brand-400' : 'bg-surface-light text-slate-400'
                }`}
              >
                {v.status === 'checked_in' ? 'CHECKED IN' : 'UPCOMING'}
              </span>
            </div>
            {v.location && (
              <div className="mb-1.5 flex items-center gap-2 text-[13px] text-slate-300">
                <MapPin size={14} className="flex-shrink-0 text-slate-400" /> {v.location}
              </div>
            )}
            {v.contactPerson && (
              <div className="mb-3.5 flex items-center gap-2 text-[13px] text-slate-300">
                <User size={14} className="flex-shrink-0 text-slate-400" />
                {v.contactPerson}
                {v.purpose ? ` · ${v.purpose}` : ''}
              </div>
            )}
            <div className="flex gap-2">
              {v.location && (
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(v.location)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-surface-light py-2.5 text-xs font-semibold text-slate-200"
                >
                  <Navigation size={13} /> Navigate
                </a>
              )}
              {v.status === 'checked_in' ? (
                <button
                  onClick={() => navigate(`/work/visits/${v.id}`)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-500 py-2.5 text-xs font-semibold text-white"
                >
                  Complete Visit
                </button>
              ) : (
                <button
                  disabled={busyId === v.id}
                  onClick={() => void checkIn(v)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-500 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {busyId === v.id ? 'Checking in…' : 'Check In'}
                </button>
              )}
            </div>
          </div>
        ))}

        {completed.map((v) => (
          <div key={v.id} className="rounded-2xl border border-surface-light bg-surface p-4 opacity-70">
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-bold text-slate-100">{v.customerName}</span>
              <span className="rounded-full bg-success/15 px-2.5 py-1 text-[10px] font-bold text-success">COMPLETED</span>
            </div>
          </div>
        ))}

        {visits && visits.length === 0 && <p className="text-sm text-slate-400">No visits scheduled for today.</p>}
      </div>
    </div>
  );
}
