import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2, MapPin } from 'lucide-react';
import { FaceLiveness, cosineSimilarity, matchesFace } from '@jenix/cap-face-liveness';
import { Location } from '@jenix/cap-location';
import { apiGet, apiPost, ApiError } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useAuth } from '../lib/auth';
import { enqueue } from '../lib/offlineQueue';

interface Props {
  workType: 'tour' | 'wfh';
  onBack: () => void;
}

interface EmbeddingResponse {
  empId: string;
  embedding: number[];
  updatedAt: string;
}

interface AttendanceResponse {
  eventId?: string;
  alreadyMarked: boolean;
  checkedInAt?: string;
}

type Step =
  | { kind: 'idle' }
  | { kind: 'checking-face' }
  | { kind: 'locating' }
  | { kind: 'submitting' }
  | { kind: 'done'; alreadyMarked: boolean; offline: boolean }
  | { kind: 'not-enrolled' }
  | { kind: 'error'; message: string };

// Mirrors APK/android's AttendanceViewModel.onCapturedFrame flow: fetch reference
// embedding → native liveness+embedding capture → cosine match → GPS → POST.
export default function AttendancePage({ workType, onBack }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>({ kind: 'idle' });

  // Open the camera the instant this screen mounts — Home's "Mark Attendance"
  // tap is the user's intent to start, a second "Start Face Check" tap here
  // was pure friction with no permission-priming or business logic riding on
  // it. useEffect (not called inline) so a re-render never re-triggers it.
  useEffect(() => {
    void handleStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleStart() {
    if (!user) return;

    try {
      setStep({ kind: 'checking-face' });
      const reference = await apiGet<EmbeddingResponse>(`/faces/${user.empId}/embedding`).catch((err) => {
        if (err instanceof ApiError && err.code === 'NOT_ENROLLED') {
          throw { notEnrolled: true };
        }
        throw new Error('Could not load your enrolled face data.');
      });

      const captured = await FaceLiveness.capture({ timeoutMs: 15000, referenceEmbedding: reference.embedding }).catch((err) => {
        const code = (err as { code?: string })?.code;
        const messages: Record<string, string> = {
          PERMISSION_DENIED: 'Camera permission is required to mark attendance.',
          LIVENESS_TIMEOUT: 'Liveness check timed out. Please try again.',
          EMBEDDING_FAILED: 'Face analysis failed. Please try again.',
          MODEL_MISSING: 'Face recognition isn’t set up on this build yet.',
          CANCELLED: 'Cancelled.',
        };
        throw new Error((code && messages[code]) || 'Face capture failed.');
      });

      const similarity = cosineSimilarity(captured.embedding, reference.embedding);
      if (!matchesFace(captured.embedding, reference.embedding)) {
        setStep({ kind: 'error', message: `Face not recognised (${Math.round(similarity * 100)}%). Please try again.` });
        return;
      }

      setStep({ kind: 'locating' });
      const permStatus = await Location.checkPermissions();
      if (permStatus.location !== 'granted') {
        const requested = await Location.requestPermissions();
        if (requested.location !== 'granted') {
          setStep({ kind: 'error', message: 'Location permission is required to mark attendance.' });
          return;
        }
      }
      // cap-location's getCurrentLocation() is loosely typed (Record<string, unknown>)
      // on the plugin side — narrow it here rather than in the shared plugin.
      const loc = (await Location.getCurrentLocation()) as {
        latitude?: number;
        longitude?: number;
        accuracy?: number;
      };
      if (loc.latitude == null || loc.longitude == null) {
        setStep({ kind: 'error', message: 'GPS unavailable. Enable location and retry.' });
        return;
      }

      setStep({ kind: 'submitting' });
      const timestamp = new Date().toISOString();
      const attendancePayload = {
        empId: user.empId,
        workType,
        timestamp,
        similarity,
        liveness: 'PASSED' as const,
        location: { lat: loc.latitude, lon: loc.longitude, accuracy: loc.accuracy },
      };
      try {
        const res = await apiPost<AttendanceResponse>('/attendance', attendancePayload);
        setStep({ kind: 'done', alreadyMarked: res.alreadyMarked, offline: false });
      } catch (submitErr) {
        if (submitErr instanceof ApiError) throw submitErr; // a real rejection from a reachable EDGE — handled below
        // Not an ApiError — the request never reached EDGE at all (its PC is
        // off, out of wifi range, or the app's closed). Face + GPS already
        // succeeded fully offline (no network needed for either) — save this
        // the same way rather than losing the capture and making the user
        // redo it; NetworkStatusProvider replays it once EDGE answers again.
        await enqueue({ kind: 'checkin', id: crypto.randomUUID(), queuedAt: timestamp, payload: attendancePayload });
        setStep({ kind: 'done', alreadyMarked: false, offline: true });
      }
    } catch (err) {
      if (err && typeof err === 'object' && 'notEnrolled' in err) {
        setStep({ kind: 'not-enrolled' });
        return;
      }
      setStep({ kind: 'error', message: err instanceof Error ? err.message : 'Something went wrong.' });
    }
  }

  if (step.kind === 'done') {
    return <AttendanceSuccess alreadyMarked={step.alreadyMarked} offline={step.offline} onDone={onBack} />;
  }

  // The native camera Activity takes a beat to launch — until it does, this
  // route's own header would otherwise flash on screen for that gap. Render
  // nothing but the matching background for idle/checking-face so there's
  // nothing visible to flash.
  if (step.kind === 'idle' || step.kind === 'checking-face') {
    return <div className="min-h-full bg-surface-bg" />;
  }

  // Face check already passed here — GPS and the final submit are automatic
  // background steps, not decisions for the user, so they get the same
  // full-screen, header-free treatment as the success screen. The Android
  // location-permission system dialog sits on top of this for a moment the
  // first time; the radar animation keeps something reassuring visible
  // underneath rather than a bare "Getting your location…" line.
  if (step.kind === 'locating') {
    return (
      <div className="flex min-h-full flex-col items-center justify-center px-6 text-center">
        <div className="relative flex h-24 w-24 items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500/30" />
          <span className="absolute inline-flex h-16 w-16 animate-ping rounded-full bg-brand-500/25 [animation-delay:300ms]" />
          <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700">
            <MapPin size={24} className="text-white" />
          </div>
        </div>
        <p className="mt-6 text-base font-semibold text-slate-100">Getting your location…</p>
        <p className="mt-1 text-sm text-slate-400">Confirming you&rsquo;re at the right place</p>
      </div>
    );
  }

  if (step.kind === 'submitting') {
    return (
      <div className="flex min-h-full flex-col items-center justify-center px-6 text-center">
        <Loader2 size={36} className="animate-spin text-brand-500" />
        <p className="mt-5 text-base font-semibold text-slate-100">Submitting attendance…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col px-6 py-8">
      <button onClick={onBack} className="mb-6 self-start text-sm text-brand-500 underline">
        ← Back
      </button>

      <h1 className="mb-1 text-xl font-semibold text-slate-100">Mark Attendance</h1>
      <p className="mb-8 text-sm text-slate-300 capitalize">{workType}</p>

      {step.kind === 'not-enrolled' && (
        <div className="rounded-lg border border-danger bg-surface p-4">
          <p className="text-slate-100">Face ID isn&rsquo;t set up on this account yet.</p>
          <button onClick={() => navigate('/profile/face-id')} className="mt-3 text-sm text-brand-500 underline">
            Set up Face ID
          </button>
        </div>
      )}

      {step.kind === 'error' && (
        <div className="rounded-lg border border-danger bg-surface p-4">
          <p className="text-slate-100">{step.message}</p>
          <button onClick={() => void handleStart()} className="mt-3 text-sm text-brand-500 underline">
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

// Full-screen celebratory takeover instead of a "Done" tap — checkmark pops
// in, then auto-returns to Home. One less tap on the single most frequent
// action in the app.
function AttendanceSuccess({
  alreadyMarked,
  offline,
  onDone,
}: {
  alreadyMarked: boolean;
  offline: boolean;
  onDone: () => void;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShow(true));
    // Give the offline case a beat longer — there's an extra line of text to
    // read ("will sync automatically") that the normal success screen doesn't have.
    const timer = setTimeout(onDone, offline ? 2400 : 1600);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDone]);

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 text-center">
      <div
        className={`flex h-24 w-24 items-center justify-center rounded-full ${offline ? 'bg-amber-500/15' : 'bg-success/15'} transition-all duration-500 ease-out ${
          show ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
        }`}
      >
        <div className={`flex h-16 w-16 items-center justify-center rounded-full ${offline ? 'bg-amber-500' : 'bg-success'}`}>
          <Check size={32} className="text-white" strokeWidth={3} />
        </div>
      </div>
      <p className="mt-5 text-lg font-bold text-slate-100">
        {offline ? 'Saved — Offline' : alreadyMarked ? 'Already Checked In' : 'Attendance Marked!'}
      </p>
      <p className="mt-1 text-sm text-slate-400">{formatDateTime(new Date())}</p>
      {offline && (
        <p className="mt-3 max-w-[240px] text-xs text-amber-300">
          Couldn&rsquo;t reach EDGE right now — this will sync automatically once you&rsquo;re back in range.
        </p>
      )}
    </div>
  );
}
