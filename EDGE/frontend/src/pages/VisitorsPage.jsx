import React, { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Search, ScanFace, Link2 } from 'lucide-react'
import { Button, Alert, Modal } from '../components/atomic'
import { PunchPhoto } from '../components/shared/PunchPhoto'
import { getU5Visitors, getU5VisitorPhoto, getMachineImportRecords } from '../services/api'

// Temp workers created by visitor auto-ID (a U5 marked as a visitor machine turns unknown
// faces into IDs like "TW-1001"). No name needed: find people by face, open one to see
// every punch with its photo. Linking to an employee (for payroll) stays in Machine Import.

function VisitorFace({ code, fallbackPhotoId, size = 96 }) {
  const [src, setSrc] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    setSrc(null); setFailed(false)
    getU5VisitorPhoto(code)
      .then((res) => { if (alive) setSrc(res.data?.dataUrl || null) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [code])
  if (failed && fallbackPhotoId) return <PunchPhoto id={fallbackPhotoId} size={size} title={code} />
  const box = { width: size, height: Math.round(size * 1.25) }
  if (!src) return <div style={box} className={`rounded-lg bg-slate-800 border border-slate-700 ${failed ? '' : 'animate-pulse'}`} />
  return <img src={src} alt={code} style={box} className="rounded-lg object-cover border border-slate-600" />
}

function groupByDate(records) {
  const days = {}
  for (const r of records) {
    if (!days[r.punch_date]) days[r.punch_date] = []
    days[r.punch_date].push(r)
  }
  return Object.entries(days)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, rows]) => {
      const sorted = rows.slice().sort((x, y) => String(x.punch_time).localeCompare(String(y.punch_time)))
      return { date, rows: sorted, first: sorted[0]?.punch_time, last: sorted[sorted.length - 1]?.punch_time }
    })
}

export function VisitorsPage() {
  const [visitors, setVisitors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(null)          // visitor object
  const [punches, setPunches] = useState([])
  const [punchesLoading, setPunchesLoading] = useState(false)

  const load = async () => {
    setLoading(true); setError('')
    try { const res = await getU5Visitors(); setVisitors(res.data || []) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const openVisitor = async (v) => {
    setOpen(v); setPunches([]); setPunchesLoading(true)
    try { const res = await getMachineImportRecords({ machineEmpId: v.code, limit: 1000 }); setPunches(res.data || []) }
    catch (e) { setError(e.message) }
    finally { setPunchesLoading(false) }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return visitors
    return visitors.filter((v) => [v.code, v.name, v.linkedEmployee].some((s) => String(s || '').toLowerCase().includes(q)))
  }, [visitors, query])

  const days = useMemo(() => groupByDate(punches), [punches])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2"><ScanFace className="w-6 h-6 text-sky-400" />Visitors</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Temporary workers given an ID automatically by a visitor machine. Click a face to see their attendance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ID or name"
              className="w-48 bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-slate-100 text-sm focus:border-sky-500 focus:outline-none" />
          </div>
          <Button size="sm" variant="secondary" icon={RefreshCw} onClick={load}>Refresh</Button>
        </div>
      </div>

      {error && <Alert variant="danger" message={error} onClose={() => setError('')} />}

      {loading ? (
        <div className="py-16 text-center text-slate-400">Loading visitors…</div>
      ) : visitors.length === 0 ? (
        <div className="py-16 text-center text-slate-400 space-y-1">
          <p className="text-slate-300 font-medium">No visitors yet.</p>
          <p className="text-sm">Mark a U5 as a visitor machine in Settings → U5 Machines. Unknown faces at that machine then get an ID automatically.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-slate-400">No visitor matches “{query}”.</div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
          {filtered.map((v) => (
            <button key={v.code} type="button" onClick={() => openVisitor(v)}
              className="text-left bg-slate-900/60 border border-slate-700 hover:border-sky-500 rounded-xl p-3 flex flex-col items-center gap-2 transition-colors">
              <VisitorFace code={v.code} fallbackPhotoId={v.latestPhotoId} />
              <div className="w-full text-center">
                <p className="text-slate-100 font-mono font-semibold text-sm truncate">{v.code}</p>
                {v.linkedEmployee
                  ? <p className="text-green-400 text-xs truncate flex items-center justify-center gap-1"><Link2 className="w-3 h-3" />{v.linkedEmployee}</p>
                  : <p className="text-slate-500 text-xs">not linked</p>}
                <p className="text-slate-400 text-xs mt-1">{v.daysThisMonth || 0} day{v.daysThisMonth === 1 ? '' : 's'} this month</p>
                <p className="text-slate-500 text-[11px] truncate">last: {v.lastPunch || '—'}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      <Modal isOpen={!!open} onClose={() => setOpen(null)} title={open ? `Visitor ${open.code}` : ''} size="lg">
        {open && (
          <div className="space-y-4">
            <div className="flex gap-4 items-start">
              <VisitorFace code={open.code} fallbackPhotoId={open.latestPhotoId} size={110} />
              <div className="text-sm space-y-1">
                <p className="text-slate-100 font-mono font-semibold text-lg">{open.code}</p>
                <p className="text-slate-400">Name on machine: <span className="text-slate-200">{open.name || '—'}</span></p>
                <p className="text-slate-400">Linked employee: <span className={open.linkedEmployee ? 'text-green-400' : 'text-slate-500'}>{open.linkedEmployee || 'not linked (link it in Attendance → Import → Machine Import)'}</span></p>
                <p className="text-slate-400">Days present: <span className="text-slate-200">{open.daysTotal || 0}</span> total, <span className="text-slate-200">{open.daysThisMonth || 0}</span> this month</p>
                <p className="text-slate-400">ID given: <span className="text-slate-200">{open.enrolledAt || '—'}</span></p>
              </div>
            </div>

            {punchesLoading ? (
              <div className="py-8 text-center text-slate-400">Loading attendance…</div>
            ) : days.length === 0 ? (
              <div className="py-8 text-center text-slate-400">No punches yet — they appear after the next recognised visit.</div>
            ) : (
              <div className="max-h-96 overflow-y-auto pr-1 space-y-2">
                {days.map((d) => (
                  <div key={d.date} className="bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-slate-100 font-medium">{d.date}</span>
                      <span className="text-slate-400 text-xs font-mono">
                        {d.first}{d.last && d.last !== d.first ? ` → ${d.last}` : ''} · {d.rows.length} punch{d.rows.length === 1 ? '' : 'es'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {d.rows.map((p) => (
                        <div key={p.id} className="flex flex-col items-center gap-0.5">
                          {p.photo_path ? <PunchPhoto id={p.id} size={44} title={`${open.code} ${d.date} ${p.punch_time}`} />
                            : <div className="w-[44px] h-[55px] rounded bg-slate-800 border border-slate-700" title="No photo" />}
                          <span className="text-slate-400 text-[11px] font-mono">{String(p.punch_time || '').slice(0, 5)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

export default VisitorsPage
