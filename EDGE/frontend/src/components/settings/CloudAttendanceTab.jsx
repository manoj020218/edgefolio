import React, { useEffect, useState } from 'react'
import { Cloud, RefreshCw, Plus, Trash2, Copy, CheckCircle } from 'lucide-react'
import { Button, Input, Alert } from '../atomic'
import { getCloudSyncStatus, connectCloudSync, disconnectCloudSync, runCloudSyncNow, saveCloudOffices } from '../../services/api'

// Settings → Cloud Attendance. Connects this PC to EdgeFolio Cloud so employees can mark attendance
// from the phone app anywhere; their punches flow into EdgeFolio attendance every 2 minutes.
// Backend: services/cloudSyncService.js. No pricing wording here, ever (free early access).

function timeAgo(iso) {
  if (!iso) return 'never'
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  return new Date(iso).toLocaleString()
}

function describe(r) {
  if (!r) return null
  if (r.ok === false) return null
  const parts = []
  if (r.punches) parts.push(`${r.punches} punch${r.punches === 1 ? '' : 'es'} received`)
  if (r.employees) parts.push(`${r.employees.activeCount} employees sent`)
  if (r.reference) parts.push('company details sent')
  return parts.length ? parts.join(' · ') : 'up to date'
}

export function CloudAttendanceTab() {
  const [st, setSt] = useState(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  const [offices, setOffices] = useState([])
  const [enforce, setEnforce] = useState(false)
  const [officesDirty, setOfficesDirty] = useState(false)

  const apply = (s) => {
    setSt(s)
    if (!officesDirty) {
      setOffices((s.offices || []).map((o) => ({ ...o, lat: o.lat ?? '', lng: o.lng ?? '', radiusM: o.radiusM ?? '' })))
      setEnforce(Boolean(s.enforceGeofence))
    }
  }
  const load = async () => {
    try { const r = await getCloudSyncStatus(); apply(r.data.data) } catch (e) { setErr(e.response?.data?.error || e.message) }
  }
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const act = (name, fn) => async () => {
    setBusy(name); setErr('')
    try { const r = await fn(); const d = r.data.data; apply(d.status || d) }
    catch (e) { setErr(e.response?.data?.error || e.message) }
    finally { setBusy('') }
  }

  const updateOffice = (i, field, value) => { setOfficesDirty(true); setOffices((list) => list.map((o, j) => (j === i ? { ...o, [field]: value } : o))) }
  const saveOffices = async () => {
    setBusy('offices'); setErr('')
    try {
      const r = await saveCloudOffices({ offices, enforceGeofence: enforce })
      setOfficesDirty(false); apply(r.data.data)
      if (st?.connected) { const s = await runCloudSyncNow(); apply(s.data.data.status) }
    } catch (e) { setErr(e.response?.data?.error || e.message) }
    finally { setBusy('') }
  }
  const copyCode = async () => { try { await navigator.clipboard.writeText(st.orgCode); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ } }

  if (!st) return <div className="py-8 text-center text-slate-400">Loading…</div>
  const connected = st.connected && st.enabled
  const lastError = st.lastError

  return (
    <div className="space-y-5">
      {err && <Alert variant="danger" message={err} onClose={() => setErr('')} />}

      {!connected ? (
        <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-5 space-y-3">
          <p className="text-slate-300 text-sm">
            Let employees mark attendance from the <span className="text-slate-100 font-medium">EdgeFolio phone app</span> from
            anywhere — on site, on tour or working from home. Their punches (face check + location) arrive here automatically and
            go into attendance and payroll like machine punches. Salary and payroll stay on this PC.
          </p>
          <ul className="text-slate-400 text-xs list-disc pl-5 space-y-0.5">
            <li>Uses this PC's EdgeFolio licence — no separate sign-up.</li>
            <li>Employee list and holidays are sent to the cloud so staff can log in with their usual app password.</li>
            <li>Faces are stored as numbers, never photos.</li>
          </ul>
          {st.orgCode && <p className="text-slate-500 text-xs">Previously connected as company code <span className="font-mono text-slate-300">{st.orgCode}</span>; connecting again keeps the same company.</p>}
          <Button variant="primary" icon={Cloud} isLoading={busy === 'connect'} onClick={act('connect', () => connectCloudSync())}>
            Connect to EdgeFolio Cloud
          </Button>
        </div>
      ) : (
        <div className="bg-slate-900/50 border border-green-700/50 rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-slate-400 text-xs uppercase tracking-wide">Company code — employees type this in the app</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono text-3xl font-bold tracking-widest text-sky-300">{st.orgCode}</span>
                <button type="button" onClick={copyCode} title="Copy" className="p-1.5 rounded hover:bg-slate-700 text-slate-400">
                  {copied ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-slate-500 text-xs mt-1">{st.companyName}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" icon={RefreshCw} isLoading={busy === 'sync'} onClick={act('sync', () => runCloudSyncNow())}>Sync now</Button>
              <Button size="sm" variant="secondary" isLoading={busy === 'disconnect'} onClick={act('disconnect', () => disconnectCloudSync())}>Disconnect</Button>
            </div>
          </div>
          <div className="text-sm">
            <p className="text-slate-300">Last sync: <span className="text-slate-100">{timeAgo(st.lastSyncAt)}</span>
              {describe(st.lastResult) && <span className="text-slate-400"> — {describe(st.lastResult)}</span>}
            </p>
            <p className="text-slate-500 text-xs mt-0.5">Syncs every 2 minutes while EdgeFolio is open.</p>
          </div>
          {lastError && (
            <div className="flex flex-wrap items-center gap-3">
              <Alert variant="warning" message={`Last sync problem: ${lastError}`} />
              {/sync key|Reconnect/i.test(lastError) && (
                <Button size="sm" variant="primary" isLoading={busy === 'connect'} onClick={act('connect', () => connectCloudSync())}>Reconnect</Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Office locations (geofence) */}
      <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-5 space-y-3">
        <div>
          <h3 className="text-base font-semibold text-slate-200">Office locations</h3>
          <p className="text-slate-500 text-xs mt-0.5">
            Every phone punch records whether it was made inside an office. Get latitude and longitude from Google Maps
            (press and hold on the office, then copy the numbers). Radius is in metres; leave it empty for 200 m.
          </p>
        </div>
        {offices.length === 0 && <p className="text-slate-500 text-sm">No offices yet.</p>}
        {offices.map((o, i) => (
          <div key={i} className="grid grid-cols-[1.4fr_1fr_1fr_0.7fr_auto] gap-2 items-end">
            <Input label={i === 0 ? 'Office name' : undefined} value={o.label} placeholder="Head office" onChange={(e) => updateOffice(i, 'label', e.target.value)} />
            <Input label={i === 0 ? 'Latitude' : undefined} value={o.lat} placeholder="26.9124" onChange={(e) => updateOffice(i, 'lat', e.target.value)} />
            <Input label={i === 0 ? 'Longitude' : undefined} value={o.lng} placeholder="75.7873" onChange={(e) => updateOffice(i, 'lng', e.target.value)} />
            <Input label={i === 0 ? 'Radius (m)' : undefined} value={o.radiusM} placeholder="200" onChange={(e) => updateOffice(i, 'radiusM', e.target.value)} />
            <button type="button" title="Remove" onClick={() => { setOfficesDirty(true); setOffices((l) => l.filter((_, j) => j !== i)) }}
              className="mb-1 p-2 rounded border border-red-800/60 text-red-400 hover:bg-red-900/30"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="secondary" icon={Plus} onClick={() => { setOfficesDirty(true); setOffices((l) => [...l, { id: '', label: '', lat: '', lng: '', radiusM: '' }]) }}>Add office</Button>
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
            <input type="checkbox" checked={enforce} onChange={(e) => { setOfficesDirty(true); setEnforce(e.target.checked) }}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-sky-500" />
            Only allow office punches inside an office radius
          </label>
          <Button size="sm" variant="primary" disabled={!officesDirty} isLoading={busy === 'offices'} onClick={saveOffices}>Save offices</Button>
        </div>
        <p className="text-slate-500 text-xs">Tour and work-from-home punches are never blocked by location.</p>
      </div>
    </div>
  )
}

export default CloudAttendanceTab
