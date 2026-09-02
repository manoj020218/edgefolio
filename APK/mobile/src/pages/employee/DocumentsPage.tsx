import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, FileText, Upload } from 'lucide-react';
import { apiGet, apiPost, ApiError } from '../../lib/api';

interface Doc {
  id: string;
  source: 'company' | 'self';
  category: string;
  title: string;
  createdAt: string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function DocumentsPage() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function load() {
    apiGet<Doc[]>('/documents')
      .then(setDocs)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load documents.'));
  }

  useEffect(load, []);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fileBase64 = await fileToBase64(file);
      await apiPost('/documents', { title: file.name, category: 'personal', fileBase64 });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  const company = docs?.filter((d) => d.source === 'company') ?? [];
  const self = docs?.filter((d) => d.source === 'self') ?? [];

  return (
    <div className="px-5 pb-8" style={{ paddingTop: '52px' }}>
      <button onClick={() => navigate(-1)} className="mb-5 flex items-center gap-1 text-sm font-medium text-slate-300">
        <ChevronLeft size={18} /> Back
      </button>
      <h1 className="mb-5 text-xl font-bold text-slate-100">Documents</h1>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      {!docs && !error && <p className="text-sm text-slate-400">Loading…</p>}

      {docs && (
        <>
          <p className="mb-2.5 text-[11px] font-bold tracking-wide text-slate-500">FROM YOUR COMPANY</p>
          <div className="mb-5 flex flex-col gap-2">
            {company.map((d) => (
              <div key={d.id} className="flex items-center gap-3 rounded-xl border border-surface-light bg-surface p-3.5">
                <FileText size={17} className="flex-shrink-0 text-brand-400" />
                <span className="flex-1 text-[13.5px] font-medium text-slate-100">{d.title}</span>
              </div>
            ))}
            {company.length === 0 && <p className="text-sm text-slate-400">Nothing here yet.</p>}
          </div>

          <p className="mb-2.5 text-[11px] font-bold tracking-wide text-slate-500">MY UPLOADS</p>
          <div className="mb-4 flex flex-col gap-2">
            {self.map((d) => (
              <div key={d.id} className="flex items-center gap-3 rounded-xl border border-surface-light bg-surface p-3.5">
                <FileText size={17} className="flex-shrink-0 text-slate-400" />
                <div className="flex-1">
                  <p className="text-[13.5px] font-medium text-slate-100">{d.title}</p>
                  <p className="text-[11px] text-slate-500">Uploaded {new Date(d.createdAt).toLocaleDateString('en-IN')}</p>
                </div>
              </div>
            ))}
            {self.length === 0 && <p className="text-sm text-slate-400">No uploads yet.</p>}
          </div>

          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-600 py-3.5">
            <Upload size={15} className="text-brand-400" />
            <span className="text-sm font-semibold text-brand-400">{uploading ? 'Uploading…' : 'Upload a document'}</span>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleUpload(f);
              }}
            />
          </label>
        </>
      )}
    </div>
  );
}
