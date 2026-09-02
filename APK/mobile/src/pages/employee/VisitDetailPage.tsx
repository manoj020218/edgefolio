import { useRef, useState, type PointerEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Upload } from 'lucide-react';
import { apiPost, ApiError } from '../../lib/api';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Minimal but real signature capture — canvas + pointer events, exported as PNG
// base64. No library needed for something this small.
function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasStroke, setHasStroke] = useState(false);

  function getCtx() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.strokeStyle = '#7dd3fc';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
    }
    return ctx;
  }

  function pointerPos(e: PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handleDown(e: PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    const ctx = getCtx();
    const { x, y } = pointerPos(e);
    ctx?.beginPath();
    ctx?.moveTo(x, y);
  }

  function handleMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = getCtx();
    const { x, y } = pointerPos(e);
    ctx?.lineTo(x, y);
    ctx?.stroke();
    if (!hasStroke) setHasStroke(true);
  }

  function handleUp() {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current?.toDataURL('image/png') ?? null);
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
    onChange(null);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-surface-light bg-surface">
      <canvas
        ref={canvasRef}
        width={320}
        height={110}
        className="block w-full touch-none"
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerLeave={handleUp}
      />
      <div className="flex items-center justify-between border-t border-surface-light px-3.5 py-2">
        <span className="text-xs text-slate-500">Customer signs above</span>
        {hasStroke && (
          <button type="button" onClick={clear} className="text-xs font-semibold text-brand-400">
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

export default function VisitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [remarks, setRemarks] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleComplete() {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      const photoBase64 = photoFile ? await fileToBase64(photoFile) : undefined;
      await apiPost(`/visits/${id}/complete`, {
        remarks: remarks.trim() || undefined,
        photoBase64,
        signatureBase64: signature ?? undefined,
      });
      navigate('/work');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not complete visit.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-5 pb-8" style={{ paddingTop: '52px' }}>
      <button onClick={() => navigate(-1)} className="mb-5 flex items-center gap-1 text-sm font-medium text-slate-300">
        <ChevronLeft size={18} /> Back
      </button>
      <h1 className="mb-5 text-xl font-bold text-slate-100">Complete Visit</h1>

      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-semibold text-slate-400">Visit Remarks</label>
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          rows={3}
          placeholder="What happened at this visit?"
          className="w-full rounded-xl border border-surface-light bg-surface px-3 py-2.5 text-sm text-slate-100"
        />
      </div>

      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-semibold text-slate-400">Photo</label>
        <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-slate-600 bg-surface p-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-500/15">
            <Upload size={18} className="text-brand-400" />
          </div>
          <span className="text-sm font-semibold text-slate-100">{photoFile ? photoFile.name : 'Add site photo'}</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      <div className="mb-6">
        <label className="mb-1.5 block text-xs font-semibold text-slate-400">Customer Signature</label>
        <SignaturePad onChange={setSignature} />
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      <button
        disabled={busy}
        onClick={() => void handleComplete()}
        className="w-full rounded-xl bg-brand-500 py-3.5 text-sm font-bold text-white disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Mark Visit Complete'}
      </button>
    </div>
  );
}
