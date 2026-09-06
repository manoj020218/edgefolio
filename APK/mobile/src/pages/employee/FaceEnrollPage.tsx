import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ShieldCheck } from 'lucide-react';
import { FaceLiveness } from '@jenix/cap-face-liveness';
import { apiGet, apiPost, ApiError } from '../../lib/api';
import { formatDateTime } from '../../lib/format';

interface StatusResponse {
  enrolled: boolean;
  enrolledAt: string | null;
}

type Step =
  | { kind: 'loading' }
  | { kind: 'enrolled'; enrolledAt: string | null }
  | { kind: 'not-enrolled' }
  | { kind: 'capturing' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string };

// Self-enrollment: the employee captures their own face here — raw photos never
// leave the device (FaceLiveness.capture() runs the TFLite model on-device),
// only the derived embedding is uploaded. This is the only enrollment path;
// there is deliberately no HR-side capture flow — HR only ever checks status
// from EDGE desktop (Settings → Employees → Face ID tab).
export default function FaceEnrollPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>({ kind: 'loading' });

  useEffect(() => {
    void loadStatus();
  }, []);

  async function loadStatus() {
    setStep({ kind: 'loading' });
    try {
      const res = await apiGet<StatusResponse>('/faces/self-enroll');
      setStep(res.enrolled ? { kind: 'enrolled', enrolledAt: res.enrolledAt } : { kind: 'not-enrolled' });
    } catch (err) {
      setStep({ kind: 'error', message: err instanceof ApiError ? err.message : 'Could not load Face ID status.' });
    }
  }

  async function handleCapture() {
    setStep({ kind: 'capturing' });
    try {
      const captured = await FaceLiveness.capture({ timeoutMs: 15000 }).catch((err) => {
        const code = (err as { code?: string })?.code;
        const messages: Record<string, string> = {
          PERMISSION_DENIED: 'Camera permission is required to set up Face ID.',
          LIVENESS_TIMEOUT: 'Liveness check timed out. Please try again.',
          EMBEDDING_FAILED: 'Face analysis failed. Please try again.',
          MODEL_MISSING: 'Face recognition isn’t set up on this build yet.',
          CANCELLED: 'Cancelled.',
        };
        throw new Error((code && messages[code]) || 'Face capture failed.');
      });

      setStep({ kind: 'submitting' });
      await apiPost('/faces/self-enroll', { embedding: captured.embedding });
      setStep({ kind: 'enrolled', enrolledAt: new Date().toISOString() });
    } catch (err) {
      setStep({ kind: 'error', message: err instanceof Error ? err.message : 'Something went wrong.' });
    }
  }

  return (
    <div className="px-5 pb-8" style={{ paddingTop: '52px' }}>
      <button onClick={() => navigate(-1)} className="mb-5 flex items-center gap-1 text-sm font-medium text-slate-300">
        <ChevronLeft size={18} /> Back
      </button>

      <h1 className="mb-2 text-xl font-bold text-slate-100">Face ID</h1>
      <p className="mb-6 text-sm text-slate-400">
        Used to mark attendance from this app. Your photo stays on this phone — only a
        non-reversible face signature is ever sent to the server.
      </p>

      {step.kind === 'loading' && <p className="text-sm text-slate-400">Loading…</p>}

      {step.kind === 'enrolled' && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-surface-light bg-surface p-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/15">
            <ShieldCheck size={28} className="text-green-400" />
          </div>
          <div>
            <p className="text-base font-semibold text-slate-100">Face ID is set up</p>
            {step.enrolledAt && (
              <p className="mt-1 text-xs text-slate-500">
                Since {formatDateTime(step.enrolledAt)}
              </p>
            )}
          </div>
          <button
            onClick={() => void handleCapture()}
            className="mt-2 rounded-xl border border-surface-light px-4 py-2.5 text-sm font-semibold text-slate-300"
          >
            Re-capture Face ID
          </button>
        </div>
      )}

      {step.kind === 'not-enrolled' && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-slate-600 bg-surface p-6 text-center">
          <p className="text-sm text-slate-300">
            Face ID isn&rsquo;t set up yet — you&rsquo;ll need it to mark attendance from this app.
          </p>
          <button
            onClick={() => void handleCapture()}
            className="w-full rounded-xl bg-brand-500 py-3.5 text-sm font-bold text-white"
          >
            Set Up Face ID
          </button>
        </div>
      )}

      {step.kind === 'capturing' && <p className="text-sm text-slate-300">Opening camera…</p>}
      {step.kind === 'submitting' && <p className="text-sm text-slate-300">Saving…</p>}

      {step.kind === 'error' && (
        <div className="rounded-2xl border border-danger bg-surface p-4">
          <p className="text-sm text-slate-100">{step.message}</p>
          <button onClick={() => void loadStatus()} className="mt-3 text-sm font-semibold text-brand-500">
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
