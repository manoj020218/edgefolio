import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Info } from 'lucide-react';
import { apiGet, apiPatch, ApiError } from '../../lib/api';

interface Profile {
  gender: string | null;
  dateOfBirth: string | null;
  bloodGroup: string | null;
  anniversaryDate: string | null;
  currentAddress: string | null;
  permanentAddress: string | null;
  vehicleNumber: string | null;
  emergencyContactName: string | null;
  emergencyContactRelation: string | null;
  emergencyContactPhone: string | null;
}

const BLANK: Profile = {
  gender: null, dateOfBirth: null, bloodGroup: null, anniversaryDate: null,
  currentAddress: null, permanentAddress: null, vehicleNumber: null,
  emergencyContactName: null, emergencyContactRelation: null, emergencyContactPhone: null,
};

function field(label: string, key: keyof Profile, profile: Profile, setProfile: (p: Profile) => void, type = 'text') {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-400">{label}</label>
      <input
        type={type}
        value={profile[key] ?? ''}
        onChange={(e) => setProfile({ ...profile, [key]: e.target.value })}
        className="w-full rounded-xl border border-surface-light bg-surface px-3 py-2.5 text-sm text-slate-100"
      />
    </div>
  );
}

export default function DetailProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiGet<Profile>('/profile')
      .then(setProfile)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load profile.'));
  }, []);

  async function handleSave() {
    if (!profile) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await apiPatch('/profile', profile);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save profile.');
    } finally {
      setBusy(false);
    }
  }

  const p = profile ?? BLANK;
  const set = (next: Profile) => setProfile(next);

  return (
    <div className="px-5 pb-8" style={{ paddingTop: '52px' }}>
      <button onClick={() => navigate(-1)} className="mb-5 flex items-center gap-1 text-sm font-medium text-slate-300">
        <ChevronLeft size={18} /> Back
      </button>
      <h1 className="mb-3 text-xl font-bold text-slate-100">Detailed Profile</h1>

      <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-brand-700 bg-brand-500/10 p-3">
        <Info size={15} className="mt-0.5 flex-shrink-0 text-sky-300" />
        <p className="text-xs text-sky-200">Everything below is optional — fill in what you&rsquo;d like on record.</p>
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      {!profile && !error && <p className="text-sm text-slate-400">Loading…</p>}

      {profile && (
        <div className="flex flex-col gap-5">
          <div>
            <p className="mb-2.5 text-[11px] font-bold tracking-wide text-slate-500">PERSONAL</p>
            <div className="grid grid-cols-2 gap-3">
              {field('Gender', 'gender', p, set)}
              {field('Blood Group', 'bloodGroup', p, set)}
              {field('Date of Birth', 'dateOfBirth', p, set, 'date')}
              {field('Anniversary', 'anniversaryDate', p, set, 'date')}
            </div>
          </div>

          <div>
            <p className="mb-2.5 text-[11px] font-bold tracking-wide text-slate-500">ADDRESS</p>
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-400">Current Address</label>
                <textarea
                  value={p.currentAddress ?? ''}
                  onChange={(e) => set({ ...p, currentAddress: e.target.value })}
                  rows={2}
                  className="w-full rounded-xl border border-surface-light bg-surface px-3 py-2.5 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-400">Permanent Address</label>
                <textarea
                  value={p.permanentAddress ?? ''}
                  onChange={(e) => set({ ...p, permanentAddress: e.target.value })}
                  rows={2}
                  className="w-full rounded-xl border border-surface-light bg-surface px-3 py-2.5 text-sm text-slate-100"
                />
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2.5 text-[11px] font-bold tracking-wide text-slate-500">VEHICLE &amp; EMERGENCY CONTACT</p>
            <div className="flex flex-col gap-3">
              {field('Vehicle Number', 'vehicleNumber', p, set)}
              <div className="grid grid-cols-2 gap-3">
                {field('Emergency Contact Name', 'emergencyContactName', p, set)}
                {field('Relation', 'emergencyContactRelation', p, set)}
              </div>
              {field('Emergency Contact Phone', 'emergencyContactPhone', p, set, 'tel')}
            </div>
          </div>

          {saved && <p className="text-sm text-success">Saved.</p>}

          <button
            disabled={busy}
            onClick={() => void handleSave()}
            className="rounded-xl bg-brand-500 py-3.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      )}
    </div>
  );
}
