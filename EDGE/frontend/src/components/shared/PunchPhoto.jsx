import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getMachineImportPhoto } from '../../services/api';

// Thumbnail of a U5 punch snapshot (staging row id). Loads lazily through the API client
// (the photo endpoint needs the auth header, so a plain <img src> can't fetch it); click to
// enlarge. Renders a neutral placeholder when there is no photo or it has been cleaned up.
export function PunchPhoto({ id, size = 40, title = 'Punch photo' }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setSrc(null); setFailed(false);
    if (!id) return undefined;
    getMachineImportPhoto(id)
      .then((res) => { if (alive) setSrc(res.data?.dataUrl || null); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [id]);

  const box = { width: size, height: Math.round(size * 1.25) };
  if (!id || failed) {
    return <div style={box} className="rounded bg-slate-800 border border-slate-700 flex-shrink-0" title="No photo" />;
  }
  if (!src) {
    return <div style={box} className="rounded bg-slate-800 border border-slate-700 animate-pulse flex-shrink-0" />;
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={`${title} — click to enlarge`}
        className="flex-shrink-0 rounded overflow-hidden border border-slate-600 hover:border-sky-500">
        <img src={src} alt={title} style={box} className="object-cover" />
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <img src={src} alt={title} className="max-h-[90vh] max-w-[90vw] rounded-lg shadow-2xl" />
        </div>,
        document.body,
      )}
    </>
  );
}
