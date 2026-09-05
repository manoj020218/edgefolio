import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { FaceLiveness, cosineSimilarity, matchesFace } from '@jenix/cap-face-liveness';
import { Location } from '@jenix/cap-location';
import { apiGet, apiPost, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

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
  | { kind: 'done'; alreadyMarked: boolean }
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
      const res = await apiPost<AttendanceResponse>('/attendance', {
        empId: user.empId,
        workType,
        timestamp: new Date().toISOString(),
        similarity,
        liveness: 'PASSED',
        location: { lat: loc.latitude, lon: loc.longitude, accuracy: loc.accuracy },
      });

      setStep({ kind: 'done', alreadyMarked: res.alreadyMarked });
    } catch (err) {
      if (err && typeof err === 'object' && 'notEnrolled' in err) {
        setStep({ kind: 'not-enrolled' });
        return;
      }
      setStep({ kind: 'error', message: err instanceof Error ? err.message : 'Something went wrong.' });
    }
  }

  if (step.kind === 'done') {
    return <AttendanceSuccess alreadyMarked={step.alreadyMarked} onDone={onBack} />;
  }

  return (
    <div className="flex min-h-full flex-col px-6 py-8">
      <button onClick={onBack} className="mb-6 self-start text-sm text-brand-500 underline">
        ← Back
      </button>

      <h1 className="mb-1 text-xl font-semibold text-slate-100">Mark Attendance</h1>
      <p className="mb-8 text-sm text-slate-300 capitalize">{workType}</p>

      {step.kind === 'idle' && <p className="text-slate-300">Opening camera…</p>}
      {step.kind === 'checking-face' && <p className="text-slate-300">Opening camera…</p>}
      {step.kind === 'locating' && <p className="text-slate-300">Getting your location…</p>}
      {step.kind === 'submitting' && <p className="text-slate-300">Submitting…</p>}

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
function AttendanceSuccess({ alreadyMarked, onDone }: { alreadyMarked: boolean; onDone: () => void }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShow(true));
    const timer = setTimeout(onDone, 1600);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [onDone]);

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 text-center">
      <div
        className={`flex h-24 w-24 items-center justify-center rounded-full bg-success/15 transition-all duration-500 ease-out ${
          show ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
        }`}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success">
          <Check size={32} className="text-white" strokeWidth={3} />
        </div>
      </div>
      <p className="mt-5 text-lg font-bold text-slate-100">
        {alreadyMarked ? 'Already Checked In' : 'Attendance Marked!'}
      </p>
      <p className="mt-1 text-sm text-slate-400">
        {new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}
      </p>
    </div>
  );
}
