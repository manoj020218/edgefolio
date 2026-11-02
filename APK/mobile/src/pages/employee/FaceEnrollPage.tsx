import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ShieldCheck } from 'lucide-react';
import { FaceLiveness } from '@jenix/cap-face-liveness';
import { apiGet, apiPost, ApiError } from '../../lib/api';
import { formatDateTime } from '../../lib/format';

interface Recapture {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'used' | 'expired';
  reason: string | null;
  requestedAt: string;
  decidedAt: string | null;
  expiresAt: string | null;
}

interface StatusResponse {
  enrolled: boolean;
  enrolledAt: string | null;
  // Older servers don't send these — treat as "re-capture allowed" (previous behaviour).
  recapture?: Recapture | null;
  canEnroll?: boolean;
}

type Step =
  | { kind: 'loading' }
  | { kind: 'enrolled'; enrolledAt: string | null; recapture: Recapture | null; canEnroll: boolean }
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
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [requestError, setRequestError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function sendRequest() {
    setSending(true);
    setRequestError(null);
    try {
      await apiPost('/faces/recapture-request', { reason: reason.trim() || undefined });
      setAsking(false);
      setReason('');
      await loadStatus();
    } catch (err) {
      setRequestError(err instanceof ApiError ? err.message : 'Could not send the request.');
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  async function loadStatus() {
    setStep({ kind: 'loading' });
    try {
      const res = await apiGet<StatusResponse>('/faces/self-enroll');
      setStep(res.enrolled
        ? { kind: 'enrolled', enrolledAt: res.enrolledAt, recapture: res.recapture ?? null, canEnroll: res.canEnroll ?? true }
        : { kind: 'not-enrolled' });
    } catch (err) {
      setStep({ kind: 'error', message: err instanceof ApiError ? err.message : 'Could not load Face ID status.' });
    }
  }

  async function handleCapture() {
    setStep({ kind: 'capturing' });
    try {
      const captured = await FaceLiveness.capture({ timeoutMs: 45000 }).catch((err) => {
        const code = (err as { code?: string })?.code;
        const messages: Record<string, string> = {
          PERMISSION_DENIED: 'Camera permission is required to set up Face ID.',
          LIVENESS_TIMEOUT: 'We could not see a blink. Face the light, blink slowly, and try again.',
          EMBEDDING_FAILED: 'Face analysis failed. Please try again.',
          MODEL_MISSING: 'Face recognition isn’t set up on this build yet.',
          CANCELLED: 'Cancelled.',
        };
        throw new Error((code && messages[code]) || 'Face capture failed.');
      });

      setStep({ kind: 'submitting' });
      await apiPost('/faces/self-enroll', { embedding: captured.embedding });
      await loadStatus();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'RECAPTURE_NOT_APPROVED') {
        await loadStatus();
        setRequestError(err.message);
        return;
      }
      setStep({ kind: 'error', message: err instanceof Error ? err.message : 'Something went wrong.' });
    }
  }

  return (
    <div className="animate-enter px-5 pb-8" style={{ paddingTop: '52px' }}>
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
        <div className="flex flex-col items-center gap-4 glass p-6 text-center">
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
          {/* Re-capture is HR-approved only (fraud guard): request → approval → one re-capture in 24 h. */}
          {step.canEnroll ? (
            <div className="w-full">
              <p className="mb-2 text-xs text-green-300">
                Re-capture approved{step.recapture?.expiresAt ? ` — use it before ${formatDateTime(step.recapture.expiresAt)}` : ''}.
              </p>
              <button onClick={() => void handleCapture()} className="w-full btn-primary py-3 text-sm font-bold text-white">
                Re-capture Face ID now
              </button>
            </div>
          ) : step.recapture?.status === 'pending' ? (
            <p className="w-full rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">
              Re-capture requested {formatDateTime(step.recapture.requestedAt)} — waiting for HR approval.
              You&rsquo;ll get a notification when they decide.
            </p>
          ) : asking ? (
            <div className="w-full space-y-2 text-left">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={300}
                rows={2}
                placeholder="Why do you need to re-capture? (e.g. new glasses, beard)"
                className="input w-full text-sm"
              />
              <div className="flex gap-2">
                <button disabled={sending} onClick={() => void sendRequest()} className="btn-primary flex-1 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                  {sending ? 'Sending…' : 'Send request'}
                </button>
                <button onClick={() => setAsking(false)} className="btn-ghost flex-1 py-2.5 text-sm font-semibold text-slate-200">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="w-full">
              {step.recapture?.status === 'rejected' && (
                <p className="mb-2 text-xs text-slate-400">Your last re-capture request was declined.</p>
              )}
              {step.recapture?.status === 'expired' && (
                <p className="mb-2 text-xs text-slate-400">Your approval expired before it was used.</p>
              )}
              <button
                onClick={() => { setAsking(true); setRequestError(null); }}
                className="w-full rounded-xl border border-surface-light px-4 py-2.5 text-sm font-semibold text-slate-300"
              >
                Request re-capture from HR
              </button>
            </div>
          )}
          {requestError && <p className="w-full text-xs text-danger">{requestError}</p>}
        </div>
      )}

      {step.kind === 'not-enrolled' && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-slate-600 glass p-6 text-center">
          <p className="text-sm text-slate-300">
            Face ID isn&rsquo;t set up yet — you&rsquo;ll need it to mark attendance from this app.
          </p>
          <button
            onClick={() => void handleCapture()}
            className="w-full btn-primary py-3.5 text-sm font-bold text-white"
          >
            Set Up Face ID
          </button>
        </div>
      )}

      {step.kind === 'capturing' && <p className="text-sm text-slate-300">Opening camera…</p>}
      {step.kind === 'submitting' && <p className="text-sm text-slate-300">Saving…</p>}

      {step.kind === 'error' && (
        <div className="glass !border-danger p-4">
          <p className="text-sm text-slate-100">{step.message}</p>
          <button onClick={() => void loadStatus()} className="mt-3 text-sm font-semibold text-brand-400">
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
