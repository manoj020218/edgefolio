import { useState } from 'react';
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
  status: string;
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
  | { kind: 'error'; message: string };

// Mirrors APK/android's AttendanceViewModel.onCapturedFrame flow: fetch reference
// embedding → native liveness+embedding capture → cosine match → GPS → POST.
export default function AttendancePage({ workType, onBack }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>({ kind: 'idle' });

  async function handleStart() {
    if (!user) return;

    try {
      setStep({ kind: 'checking-face' });
      const reference = await apiGet<EmbeddingResponse>(`/faces/${user.empId}/embedding`).catch((err) => {
        if (err instanceof ApiError && err.code === 'NOT_ENROLLED') {
          throw new Error('Your face isn’t enrolled yet. Contact HR.');
        }
        throw new Error('Could not load your enrolled face data.');
      });

      const captured = await FaceLiveness.capture({ timeoutMs: 5000 }).catch((err) => {
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
      setStep({ kind: 'error', message: err instanceof Error ? err.message : 'Something went wrong.' });
    }
  }

  return (
    <div className="flex min-h-full flex-col px-6 py-8">
      <button onClick={onBack} className="mb-6 self-start text-sm text-brand-500 underline">
        ← Back
      </button>

      <h1 className="mb-1 text-xl font-semibold text-slate-100">Mark Attendance</h1>
      <p className="mb-8 text-sm text-slate-300 capitalize">{workType}</p>

      {step.kind === 'idle' && (
        <button
          onClick={() => void handleStart()}
          className="rounded-md bg-brand-500 py-2.5 font-medium text-white transition hover:bg-brand-600"
        >
          Start Face Check
        </button>
      )}

      {step.kind === 'checking-face' && <p className="text-slate-300">Opening camera…</p>}
      {step.kind === 'locating' && <p className="text-slate-300">Getting your location…</p>}
      {step.kind === 'submitting' && <p className="text-slate-300">Submitting…</p>}

      {step.kind === 'done' && (
        <div className="rounded-lg border border-success bg-surface p-4">
          <p className="font-medium text-slate-100">
            {step.alreadyMarked ? 'Already marked for today.' : 'Attendance marked.'}
          </p>
          <button onClick={onBack} className="mt-3 text-sm text-brand-500 underline">
            Done
          </button>
        </div>
      )}

      {step.kind === 'error' && (
        <div className="rounded-lg border border-danger bg-surface p-4">
          <p className="text-slate-100">{step.message}</p>
          <button onClick={() => setStep({ kind: 'idle' })} className="mt-3 text-sm text-brand-500 underline">
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
