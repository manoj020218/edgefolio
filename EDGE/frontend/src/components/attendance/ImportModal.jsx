/**
 * ImportModal — multi-format attendance import for EDGEFOLIO
 *
 * Tab 1 – File Import   : CSV · JSON · DAT (generic, needs UUID memberId)
 * Tab 2 – Network Pull  : ZK Teco live pull
 * Tab 3 – Jenix OEM     : XLS/XLSX → staging (FK-safe)
 * Tab 4 – ALOG          : Realtime ALOG TXT → staging (FK-safe)
 * Tab 5 – Machine Import: Batch list → map machine IDs → commit
 * Tab 6 – Plugins       : Plugin registry
 */
import React, { useState, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'
import {
  X, Upload, Wifi, Puzzle, ChevronRight, AlertCircle,
  CheckCircle, Loader2, Plug, RefreshCw, Database, ArrowRight, Trash2, UserPlus,
} from 'lucide-react'
import { Button } from '../atomic'
import {
  importAttendance, testMachineConnection, pullFromMachine,
  getJenixSheets,
  machineImportAlog, machineImportJenix,
  getMachineImportBatches, deleteMachineImportBatch, getMachineImportUnmapped,
  getMachineImportMappings, saveMachineImportMappings,
  commitMachineImport,
  getEmployees, createEmployee, getDepartments, createDepartment,
} from '../../services/api'

// ─── Plugin Registry ──────────────────────────────────────────────────────────
const PLUGINS = [
  { id: 'zkteco',    name: 'ZK Teco / ZKSoftware',    models: 'F18, F22, K40, K20, ZK100, ZK200, MA300, MB10, iClock…', emoji: '🔵', fileFormats: ['xls','xlsx','csv','dat','txt'], network: true,  networkNote: 'Built-in — no extra software needed', status: 'official' },
  { id: 'jenix',     name: 'Jenix OEM Devices',        models: 'All Jenix-branded attendance machines with XLS export',   emoji: '🟢', fileFormats: ['xls','xlsx'],                   network: false, networkNote: 'XLS import → stage → map IDs',        status: 'official' },
  { id: 'realtime',  name: 'Realtime Biometrics',      models: 'M3, M5, S922, T12 — ALOG/AGL export',                     emoji: '🟠', fileFormats: ['txt'],                          network: false, networkNote: 'ALOG/AGL TXT → stage → map IDs',      status: 'official' },
  { id: 'essl',      name: 'ESSL Security',            models: 'E9C, E21, E990, iFace series',                            emoji: '🟠', fileFormats: ['csv','txt'], network: false, status: 'coming' },
  { id: 'matrix',    name: 'Matrix Cosec',             models: 'COSEC DOOR, COSEC VEGA',                                  emoji: '🟣', fileFormats: ['csv'],       network: false, status: 'coming' },
  { id: 'hikvision', name: 'Hikvision',                models: 'DS-K1T671, DS-K1T804, face devices',                     emoji: '🔴', fileFormats: ['csv','xlsx'], network: false, status: 'coming' },
  { id: 'suprema',   name: 'Suprema BioStar',          models: 'BioLite, BioEntry, FaceStation',                          emoji: '⚫', fileFormats: ['csv'],       network: false, status: 'coming' },
]

const CANONICAL = [
  { key: 'memberId', label: 'Employee ID',     required: true  },
  { key: 'date',     label: 'Date / DateTime', required: true  },
  { key: 'checkIn',  label: 'Check-In',        required: false },
  { key: 'checkOut', label: 'Check-Out',       required: false },
  { key: '__skip',   label: '— Skip —',        required: false },
]

// ─── Parsers ──────────────────────────────────────────────────────────────────
function parseJSON(text) {
  const raw = JSON.parse(text)
  const arr = Array.isArray(raw) ? raw : (raw.records || raw.data || raw.attendance || Object.values(raw)[0] || [])
  if (!arr.length) return { headers: [], rows: [] }
  const headers = Object.keys(arr[0])
  return { headers, rows: arr.map((r) => { const o = {}; headers.forEach((h) => { o[h] = String(r[h] ?? '') }); return o }) }
}

function parseDelimited(text) {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }
  const sample = lines[0]
  let sep
  if (sample.includes('\t'))      sep = '\t'
  else if (/\s{2,}/.test(sample)) sep = /\s{2,}/
  else if (sample.includes(','))  sep = ','
  else if (sample.includes(';'))  sep = ';'
  else                            sep = ' '
  const splitLine = (l) => (sep instanceof RegExp ? l.split(sep) : l.split(sep)).map((c) => c.trim().replace(/^"|"$/g, ''))
  const first = splitLine(lines[0])
  const hasHeader = isNaN(first[0]) && !/^\d{4}-\d{2}-\d{2}/.test(first[0])
  if (hasHeader) {
    const headers = first
    const rows = lines.slice(1).map((l) => { const cells = splitLine(l); const o = {}; headers.forEach((h, i) => { o[h] = cells[i] ?? '' }); return o })
    return { headers, rows }
  }
  const headers = first.map((_, i) => `Col${i + 1}`)
  const rows = lines.map((l) => { const cells = splitLine(l); const o = {}; headers.forEach((h, i) => { o[h] = cells[i] ?? '' }); return o })
  return { headers, rows }
}

function parseFile(text, ext) {
  if (ext === 'json') return parseJSON(text)
  return parseDelimited(text)
}

function autoMap(headers) {
  const map = {}
  headers.forEach((h) => {
    const lh = h.toLowerCase().replace(/[\s_\-\.]/g, '')
    if      (/userid|employeeid|empid|empno|pin\b|no\b|^id$/.test(lh)) map[h] = 'memberId'
    else if (/^date$/.test(lh))                                          map[h] = 'date'
    else if (/datetime|checktime|timestamp/.test(lh))                   map[h] = 'date'
    else if (/checkin|timein|^in$|intime/.test(lh))                     map[h] = 'checkIn'
    else if (/checkout|timeout|^out$|outtime/.test(lh))                 map[h] = 'checkOut'
    else if (/^time$/.test(lh))                                          map[h] = 'checkIn'
    else                                                                  map[h] = '__skip'
  })
  return map
}

// ─── Shared helpers ───────────────────────────────────────────────────────────
function StepBar({ steps, current }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-4">
      {steps.map((s, i) => {
        const idx = steps.indexOf(current)
        const done = i < idx; const active = s === current
        return (
          <React.Fragment key={s}>
            <span className={`font-medium ${active ? 'text-sky-400' : done ? 'text-green-400' : 'text-slate-500'}`}>{done ? '✓ ' : ''}{s}</span>
            {i < steps.length - 1 && <ChevronRight className="w-3 h-3 text-slate-600 flex-shrink-0" />}
          </React.Fragment>
        )
      })}
    </div>
  )
}

function ErrBox({ msg }) {
  if (!msg) return null
  return (
    <div className="flex items-start gap-2 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />{msg}
    </div>
  )
}

function StagedBanner({ batchId, staged, onGoToMachineImport }) {
  return (
    <div className="text-center space-y-3 py-2">
      <CheckCircle className="w-12 h-12 text-green-400 mx-auto" />
      <p className="text-slate-100 font-bold text-lg">Records Staged</p>
      <p className="text-slate-400 text-sm"><strong className="text-sky-400">{staged}</strong> records staged in batch <code className="text-xs text-slate-300 bg-slate-900 px-1 rounded">{batchId}</code>.</p>
      <div className="p-3 bg-amber-900/20 border border-amber-700/40 rounded-lg text-amber-300 text-xs text-left space-y-1">
        <p className="font-semibold">Next step: map machine IDs → employees</p>
        <p>The records are in the staging area. Switch to the <strong>Machine Import</strong> tab to assign machine employee numbers to your EDGEFOLIO employees, then commit to attendance records.</p>
      </div>
      <Button variant="primary" size="sm" onClick={onGoToMachineImport}>
        Go to Machine Import →
      </Button>
    </div>
  )
}

// ─── Tab 1: Generic File Import ───────────────────────────────────────────────
function FileImportTab({ onImported, onClose }) {
  const FILE_STEPS = ['Upload', 'Map', 'Preview', 'Done']
  const [step, setStep]       = useState('Upload')
  const [csvData, setCsvData] = useState(null)
  const [mapping, setMapping] = useState({})
  const [preview, setPreview] = useState([])
  const [importing, setImporting] = useState(false)
  const [err, setErr]         = useState('')
  const [result, setResult]   = useState(null)
  const fileRef = useRef(null)

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setErr('')
    const ext = file.name.split('.').pop().toLowerCase()
    if (ext === 'xls' || ext === 'xlsx') {
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          const wb = XLSX.read(ev.target.result, { type: 'array', cellDates: true })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false })
          if (!rawRows.length) { setErr('Excel sheet is empty.'); return }
          const headers = Object.keys(rawRows[0])
          const rows = rawRows.map((r) => { const o = {}; headers.forEach((h) => { o[h] = String(r[h] ?? '').trim() }); return o })
          setCsvData({ headers, rows, fileName: file.name, ext })
          setMapping(autoMap(headers))
          setStep('Map')
        } catch (ex) { setErr(`Excel parse error: ${ex.message}`) }
      }
      reader.readAsArrayBuffer(file)
    } else {
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          const parsed = parseFile(ev.target.result, ext)
          if (!parsed.headers.length) { setErr('Cannot parse this file — check format.'); return }
          setCsvData({ ...parsed, fileName: file.name, ext })
          setMapping(autoMap(parsed.headers))
          setStep('Map')
        } catch (ex) { setErr(`Parse error: ${ex.message}`) }
      }
      reader.readAsText(file)
    }
  }

  const buildPreview = () => {
    setPreview((csvData?.rows || []).slice(0, 6).map((row) => {
      const r = {}; Object.entries(mapping).forEach(([col, field]) => { if (field !== '__skip') r[field] = row[col] || '' }); return r
    }))
    setStep('Preview')
  }

  const handleImport = async () => {
    setImporting(true); setErr('')
    try {
      const records = (csvData?.rows || []).map((row) => {
        const r = {}; Object.entries(mapping).forEach(([col, field]) => { if (field !== '__skip') r[field] = row[col] || '' }); return r
      })
      const res = await importAttendance({ records })
      setResult(res.meta)
      setStep('Done')
      onImported()
    } catch (ex) { setErr(ex.message) }
    finally { setImporting(false) }
  }

  const missing = CANONICAL.filter((f) => f.required && !Object.values(mapping).includes(f.key))

  return (
    <div className="space-y-4">
      <StepBar steps={FILE_STEPS} current={step} />
      <ErrBox msg={err} />
      {step === 'Upload' && (
        <div className="space-y-3">
          <p className="text-slate-400 text-sm">Upload a CSV/JSON/DAT export where <strong className="text-amber-300">Employee ID column contains EDGEFOLIO employee UUIDs</strong>. For machine XLS exports (Jenix, ALOG), use the dedicated tabs.</p>
          <div onClick={() => fileRef.current?.click()} className="border-2 border-dashed border-slate-600 hover:border-sky-500 rounded-xl p-10 text-center cursor-pointer transition-colors">
            <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-slate-300 font-medium">Click or drag-and-drop file</p>
            <p className="text-slate-500 text-xs mt-1">.csv · .json · .dat · .txt</p>
            <input ref={fileRef} type="file" accept=".csv,.json,.dat,.txt" className="hidden" onChange={handleFile} />
          </div>
        </div>
      )}
      {step === 'Map' && csvData && (
        <div className="space-y-3">
          <p className="text-slate-400 text-sm">Map each column from <span className="text-sky-400">{csvData.fileName}</span> to an EDGEFOLIO field.</p>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {csvData.headers.map((col) => (
              <div key={col} className="flex items-center gap-2">
                <div className="flex-1 text-xs text-slate-300 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 font-mono truncate">{col}</div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                <select value={mapping[col] || '__skip'} onChange={(e) => setMapping((m) => ({ ...m, [col]: e.target.value }))}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 text-sm focus:border-sky-500 focus:outline-none">
                  {CANONICAL.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
              </div>
            ))}
          </div>
          {missing.length > 0 && <p className="text-amber-400 text-xs">Map required: {missing.map((f) => f.label).join(', ')}</p>}
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setStep('Upload')}>Back</Button>
            <Button size="sm" variant="primary" onClick={buildPreview} disabled={missing.length > 0}>Preview ({csvData.rows.length} rows)</Button>
          </div>
        </div>
      )}
      {step === 'Preview' && (
        <div className="space-y-3">
          <p className="text-slate-400 text-sm">First 6 rows — verify before importing.</p>
          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="w-full text-xs"><thead className="bg-slate-900"><tr>{['Employee ID','Date','Check-In','Check-Out'].map((h) => <th key={h} className="text-left px-3 py-2 text-slate-400">{h}</th>)}</tr></thead>
              <tbody>{preview.map((r, i) => (<tr key={i} className={i % 2 ? '' : 'bg-slate-800/40'}><td className="px-3 py-1.5 font-mono text-slate-300">{r.memberId||'—'}</td><td className="px-3 py-1.5 text-slate-300">{r.date||'—'}</td><td className="px-3 py-1.5 text-green-400">{r.checkIn||'—'}</td><td className="px-3 py-1.5 text-blue-400">{r.checkOut||'—'}</td></tr>))}</tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setStep('Map')}>Back</Button>
            <Button size="sm" variant="primary" isLoading={importing} onClick={handleImport}>Import {csvData.rows.length} Records</Button>
          </div>
        </div>
      )}
      {step === 'Done' && result && (
        <div className="text-center space-y-3 py-4">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto" />
          <p className="text-slate-100 font-bold text-lg">Import Complete</p>
          <p className="text-slate-400 text-sm">{result.imported} records imported.</p>
          <Button variant="primary" onClick={onClose}>Close</Button>
        </div>
      )}
    </div>
  )
}

// ─── Tab 2: Network Pull ──────────────────────────────────────────────────────
function NetworkPullTab({ onImported, onClose }) {
  const NET_STEPS = ['Connect', 'Pull', 'Preview', 'Done']
  const [step, setStep]   = useState('Connect')
  const [form, setForm]   = useState({ ip: '', port: '4370', password: '0', fromDate: '', toDate: '' })
  const [testing, setTesting]   = useState(false)
  const [pulling, setPulling]   = useState(false)
  const [importing, setImporting] = useState(false)
  const [connInfo, setConnInfo] = useState(null)
  const [records, setRecords]   = useState([])
  const [result, setResult]     = useState(null)
  const [err, setErr]           = useState('')

  const handleTest = async () => {
    setTesting(true); setErr(''); setConnInfo(null)
    try { const res = await testMachineConnection({ ip: form.ip, port: Number(form.port), password: Number(form.password) }); setConnInfo(res.data) }
    catch (e) { setErr(e.message) } finally { setTesting(false) }
  }

  const handlePull = async () => {
    setPulling(true); setErr('')
    try {
      const res = await pullFromMachine({ ip: form.ip, port: Number(form.port), password: Number(form.password), fromDate: form.fromDate || undefined, toDate: form.toDate || undefined })
      setRecords(res.data || []); setStep('Preview')
    } catch (e) { setErr(e.message) } finally { setPulling(false) }
  }

  const handleImport = async () => {
    setImporting(true); setErr('')
    try {
      const res = await importAttendance({ records, deviceId: `zkteco-${form.ip}` })
      setResult(res.meta); setStep('Done'); onImported()
    } catch (e) { setErr(e.message) } finally { setImporting(false) }
  }

  const f = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }))
  const iCls = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:border-sky-500 focus:outline-none'
  const lCls = 'block text-xs text-slate-400 mb-1'

  return (
    <div className="space-y-4">
      <StepBar steps={NET_STEPS} current={step} />
      <ErrBox msg={err} />
      {(step === 'Connect' || step === 'Pull') && (
        <div className="space-y-4">
          <div className="p-3 bg-green-900/20 border border-green-700/40 rounded-lg text-xs text-green-300 flex items-start gap-2">
            <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div><p className="font-semibold text-green-200">Built-in — no extra software</p><p className="text-green-400/80 mt-0.5">Works with ZK100, ZK200, K40, K20, F18, F22, MA300, MB10, iClock on your LAN.</p></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 md:col-span-1"><label className={lCls}>Machine IP *</label><input className={iCls} placeholder="192.168.1.201" value={form.ip} onChange={f('ip')} /></div>
            <div><label className={lCls}>Port (4370)</label><input className={iCls} type="number" value={form.port} onChange={f('port')} /></div>
            <div><label className={lCls}>Password (0)</label><input className={iCls} type="number" value={form.password} onChange={f('password')} /></div>
          </div>
          {connInfo && <div className="flex items-center gap-2 text-green-400 text-sm bg-green-900/20 border border-green-700/40 rounded-lg px-3 py-2"><CheckCircle className="w-4 h-4 flex-shrink-0" />Connected — {connInfo.message}</div>}
          <div className="flex gap-2"><Button size="sm" variant="secondary" isLoading={testing} onClick={handleTest} disabled={!form.ip}>{testing ? 'Testing…' : 'Test Connection'}</Button></div>
          {step === 'Pull' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={lCls}>From Date</label><input className={iCls} type="date" value={form.fromDate} onChange={f('fromDate')} /></div>
                <div><label className={lCls}>To Date</label><input className={iCls} type="date" value={form.toDate} onChange={f('toDate')} /></div>
              </div>
              <Button size="sm" variant="primary" isLoading={pulling} onClick={handlePull} disabled={!form.ip}>{pulling ? 'Pulling…' : 'Pull Records from Machine'}</Button>
            </>
          )}
          {step === 'Connect' && connInfo && <Button size="sm" variant="primary" onClick={() => setStep('Pull')}>Configure Pull →</Button>}
        </div>
      )}
      {step === 'Preview' && (
        <div className="space-y-3">
          <p className="text-slate-400 text-sm">{records.length} records from <strong className="text-slate-200">{form.ip}</strong>.</p>
          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="w-full text-xs"><thead className="bg-slate-900"><tr>{['Employee ID','Date','Check-In','Check-Out'].map((h) => <th key={h} className="text-left px-3 py-2 text-slate-400">{h}</th>)}</tr></thead>
              <tbody>{records.slice(0, 8).map((r, i) => (<tr key={i} className={i % 2 ? '' : 'bg-slate-800/40'}><td className="px-3 py-1.5 font-mono text-slate-300">{r.memberId}</td><td className="px-3 py-1.5 text-slate-300">{r.date}</td><td className="px-3 py-1.5 text-green-400">{r.checkIn||'—'}</td><td className="px-3 py-1.5 text-blue-400">{r.checkOut||'—'}</td></tr>))}</tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setStep('Pull')}>Back</Button>
            <Button size="sm" variant="primary" isLoading={importing} onClick={handleImport}>Import {records.length} Records</Button>
          </div>
        </div>
      )}
      {step === 'Done' && result && (
        <div className="text-center space-y-3 py-4">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto" />
          <p className="text-slate-100 font-bold text-lg">Import Complete</p>
          <p className="text-slate-400 text-sm">{result.imported} records from {form.ip}.</p>
          <Button variant="primary" onClick={onClose}>Close</Button>
        </div>
      )}
    </div>
  )
}

// ─── Tab 3: Jenix OEM (staging-based) ────────────────────────────────────────
function JenixImportPanel({ onGoToMachineImport }) {
  const STEPS = ['Upload', 'Sheet', 'Done']
  const [step, setStep]       = useState('Upload')
  const [fileB64, setFileB64] = useState(null)
  const [fileName, setFileName] = useState('')
  const [sheets, setSheets]   = useState([])
  const [selectedSheet, setSelectedSheet] = useState('')
  const [loading, setLoading] = useState(false)
  const [staging, setStaging] = useState(false)
  const [result, setResult]   = useState(null)
  const [err, setErr]         = useState('')
  const fileRef = useRef(null)

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setErr('')
    const reader = new FileReader()
    reader.onload = (ev) => {
      const bytes = new Uint8Array(ev.target.result)
      let bin = ''; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
      const b64 = btoa(bin)
      setFileB64(b64); setFileName(file.name)
      setLoading(true)
      getJenixSheets({ fileData: b64 })
        .then((res) => {
          const s = res.data?.sheets || []
          setSheets(s); setSelectedSheet(s[0] || '')
          if (s.length === 1) { handleStage(b64, s[0]); return }
          setStep('Sheet'); setLoading(false)
        })
        .catch((e) => { setErr(e.message); setLoading(false) })
    }
    reader.readAsArrayBuffer(file)
  }

  const handleStage = async (b64, sheetName) => {
    setStaging(true); setErr('')
    try {
      const res = await machineImportJenix({ fileData: b64 || fileB64, sheetName: sheetName || selectedSheet })
      setResult({ staged: res.data?.staged, batchId: res.data?.batchId, summary: res.data?.parseSummary })
      setStep('Done')
    } catch (e) { setErr(e.message) }
    finally { setStaging(false); setLoading(false) }
  }

  return (
    <div className="space-y-4">
      <StepBar steps={STEPS} current={step} />
      <ErrBox msg={err} />
      {step === 'Upload' && (
        <div className="space-y-3">
          <p className="text-slate-400 text-sm">Upload an XLS/XLSX export from your Jenix machine. Records are <strong className="text-green-300">staged safely</strong> — no FK errors.</p>
          <div onClick={() => fileRef.current?.click()} className="border-2 border-dashed border-slate-600 hover:border-green-500 rounded-xl p-10 text-center cursor-pointer transition-colors">
            {loading ? <Loader2 className="w-8 h-8 text-slate-400 mx-auto animate-spin" /> : <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />}
            <p className="text-slate-300 font-medium">Click to select Jenix XLS/XLSX</p>
            <p className="text-slate-500 text-xs mt-1">.xls · .xlsx</p>
            <input ref={fileRef} type="file" accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={handleFile} />
          </div>
        </div>
      )}
      {step === 'Sheet' && (
        <div className="space-y-4">
          <p className="text-slate-400 text-sm">File: <span className="text-sky-400">{fileName}</span> — select sheet:</p>
          <div className="space-y-2">
            {sheets.map((s) => (
              <button key={s} onClick={() => setSelectedSheet(s)}
                className={`w-full text-left px-4 py-2 rounded-lg border text-sm transition-colors ${selectedSheet === s ? 'border-green-500 bg-green-900/20 text-green-300' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}>
                {s}
              </button>
            ))}
          </div>
          <Button size="sm" variant="primary" isLoading={staging} onClick={() => handleStage(fileB64, selectedSheet)} disabled={!selectedSheet}>
            Stage Records →
          </Button>
        </div>
      )}
      {step === 'Done' && result && (
        <StagedBanner batchId={result.batchId} staged={result.staged} onGoToMachineImport={onGoToMachineImport} />
      )}
    </div>
  )
}

// ─── Tab 4: ALOG (Realtime Biometrics) ───────────────────────────────────────
function AlogImportPanel({ onGoToMachineImport }) {
  const [staging, setStaging] = useState(false)
  const [result, setResult]   = useState(null)
  const [err, setErr]         = useState('')
  const fileRef = useRef(null)

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setErr(''); setResult(null)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      setStaging(true)
      try {
        const bytes = new Uint8Array(ev.target.result)
        let bin = ''; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
        const b64 = btoa(bin)
        const res = await machineImportAlog({ fileData: b64 })
        setResult({ staged: res.data?.staged, batchId: res.data?.batchId, summary: res.data?.parseSummary })
      } catch (ex) { setErr(ex.message) }
      finally { setStaging(false) }
    }
    reader.readAsArrayBuffer(file)
  }

  return (
    <div className="space-y-4">
      <ErrBox msg={err} />
      {!result ? (
        <div className="space-y-3">
          <p className="text-slate-400 text-sm">Upload an <strong>ALOG/AGL TXT</strong> file exported from a <strong>Realtime Biometrics</strong> machine (tab-delimited). Records are staged safely — no FK errors.</p>
          <div onClick={() => fileRef.current?.click()} className="border-2 border-dashed border-slate-600 hover:border-orange-500 rounded-xl p-10 text-center cursor-pointer transition-colors">
            {staging ? <Loader2 className="w-8 h-8 text-slate-400 mx-auto animate-spin" /> : <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />}
            <p className="text-slate-300 font-medium">{staging ? 'Staging records…' : 'Click to select ALOG/AGL TXT file'}</p>
            <p className="text-slate-500 text-xs mt-1">e.g. Realtime_Alog_xxx.txt or AGL_001.TXT</p>
            <input ref={fileRef} type="file" accept=".txt,.log,.dat" className="hidden" onChange={handleFile} disabled={staging} />
          </div>
          <div className="p-3 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-400 space-y-1">
            <p className="text-slate-300 font-semibold">Columns are matched by header name, so layout varies by device:</p>
            <p>Needs at minimum <strong className="text-sky-400">EnNo</strong> and <strong className="text-sky-400">DateTime</strong> columns — Name, TMNo and an In/Out/Mode column are used when present.</p>
          </div>
        </div>
      ) : (
        <StagedBanner batchId={result.batchId} staged={result.staged} onGoToMachineImport={onGoToMachineImport} />
      )}
    </div>
  )
}

// ─── Tab 5: Machine Import — batch management, mapping, commit ────────────────
// The device already sends the employee's name (machine_name, staged from the
// import file) — if it's an exact match (case/whitespace-insensitive) to
// exactly one EDGEFOLIO employee, there's no real ambiguity to ask HR about.
// Only auto-fill unambiguous exact matches; anything with 0 or 2+ candidate
// employees is left blank for manual review rather than guessed.
function normalizeName(s) {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function buildAutoMatches(unmapped, employees) {
  const byName = {}
  employees.forEach((emp) => {
    const key = normalizeName(emp.name)
    if (!key) return
    ;(byName[key] = byName[key] || []).push(emp.id)
  })
  const matches = {}
  unmapped.forEach((row) => {
    const key = normalizeName(row.machine_name)
    const candidates = key ? byName[key] : null
    if (candidates && candidates.length === 1) matches[row.machine_emp_id] = candidates[0]
  })
  return matches
}

function MachineImportTab({ onImported }) {
  const [batches, setBatches]     = useState([])
  const [employees, setEmployees] = useState([])
  const [unmapped, setUnmapped]   = useState([])
  const [mappings, setMappings]   = useState({})   // machineEmpId → employeeId
  const [autoMatched, setAutoMatched] = useState({}) // machineEmpId → true if pre-filled by name match
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [committing, setCommitting] = useState(false)
  const [err, setErr]             = useState('')
  const [success, setSuccess]     = useState('')
  const [selectedBatch, setSelectedBatch] = useState(null)
  const [deletingBatch, setDeletingBatch] = useState(null)
  const [departments, setDepartments] = useState([])
  const [newDeptForRow, setNewDeptForRow] = useState(null) // machineEmpId currently entering a new department name
  const [newDeptName, setNewDeptName] = useState('')
  const [creatingDept, setCreatingDept] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkRows, setBulkRows] = useState([])   // [{machineEmpId, name, department, salary}]
  const [savingBulk, setSavingBulk] = useState(false)

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const [bRes, eRes, uRes] = await Promise.all([
        getMachineImportBatches(),
        getEmployees(),
        getMachineImportUnmapped(),
      ])
      setBatches(bRes.data || [])
      const emps = eRes.data || []
      setEmployees(emps)
      const u = uRes.data || []
      setUnmapped(u)
      const auto = buildAutoMatches(u, emps)
      setAutoMatched(auto)
      // Initialize mapping state from existing unmapped list — pre-fill with an
      // unambiguous name match so HR reviews instead of re-picking from scratch.
      const m = {}
      u.forEach(row => { m[row.machine_emp_id] = m[row.machine_emp_id] || auto[row.machine_emp_id] || '' })
      setMappings(prev => {
        const next = { ...m }
        // Preserve user selections
        Object.keys(prev).forEach(k => { if (prev[k]) next[k] = prev[k] })
        return next
      })
    } catch (e) { if (!quiet) setErr(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleSaveMappings = async () => {
    const pairs = Object.entries(mappings).filter(([, empId]) => empId)
    if (!pairs.length) { setErr('Select at least one employee mapping'); return }
    setSaving(true); setErr('')
    try {
      await saveMachineImportMappings({ mappings: pairs.map(([machineEmpId, employeeId]) => ({ machineEmpId, employeeId })) })
      setSuccess(`${pairs.length} mappings saved`)
      load(true)
    } catch (e) { setErr(e.message) }
    finally { setSaving(false) }
  }

  // The machine already sends the employee's name — there's no reason to make
  // HR pre-create every employee by hand before import can proceed. Opens an
  // editable grid (one row per still-unmapped machine ID, name pre-filled from
  // the machine) for the two fields the backend actually requires — department
  // and salary — then creates + maps all of them in one save. Anything already
  // selected (manual pick or an existing-employee auto match) is left alone —
  // this only covers the gaps. Everything else (bank details, designation…)
  // stays editable from Employees afterwards, same as any import-then-enrich
  // flow — this grid is deliberately just the two compulsory fields.
  const handleOpenBulkCreate = async () => {
    const rowsNeedingNewEmployee = unmapped.filter((row) => !mappings[row.machine_emp_id])
    if (!rowsNeedingNewEmployee.length) {
      setErr('Everything is already mapped to an existing employee.')
      return
    }
    setErr('')
    if (!departments.length) {
      try { const dRes = await getDepartments(); setDepartments(dRes.data || []) } catch { /* datalist is optional */ }
    }
    setBulkRows(rowsNeedingNewEmployee.map((row) => ({
      machineEmpId: row.machine_emp_id,
      name: (row.machine_name || '').trim() || `Machine ID ${row.machine_emp_id}`,
      department: '',
      salary: '',
    })))
    setBulkOpen(true)
  }

  const updateBulkRow = (machineEmpId, field, value) => {
    setBulkRows((rows) => rows.map((r) => (r.machineEmpId === machineEmpId ? { ...r, [field]: value } : r)))
  }

  // Registers the new department properly (Settings → Departments, and every
  // other department dropdown in the app) rather than leaving it as a free-text
  // string that only exists on this one employee — so HR doesn't have to leave
  // this screen to set up a department that doesn't exist yet.
  const handleCreateDepartment = async (machineEmpId) => {
    const name = newDeptName.trim()
    if (!name) return
    setCreatingDept(true); setErr('')
    try {
      const res = await createDepartment({ name })
      setDepartments((d) => [...d, res.data])
      updateBulkRow(machineEmpId, 'department', res.data.name)
      setNewDeptForRow(null); setNewDeptName('')
    } catch (e) { setErr(e.message) }
    finally { setCreatingDept(false) }
  }

  const handleSaveBulkCreate = async () => {
    const missing = bulkRows.filter((r) => !r.department.trim() || r.salary === '' || Number.isNaN(Number(r.salary)))
    if (missing.length) { setErr(`Fill in department and salary for all ${bulkRows.length} rows before saving.`); return }
    if (bulkRows.some((r) => Number(r.salary) < 0)) { setErr('Salary cannot be negative.'); return }
    setSavingBulk(true); setErr(''); setSuccess('')
    try {
      const created = {}
      for (const row of bulkRows) {
        const res = await createEmployee({ name: row.name, department: row.department.trim(), salary: Number(row.salary) })
        created[row.machineEmpId] = res.data.id
      }
      const allPairs = unmapped.map((row) => ({
        machineEmpId: row.machine_emp_id,
        employeeId: mappings[row.machine_emp_id] || created[row.machine_emp_id],
      })).filter((p) => p.employeeId)
      await saveMachineImportMappings({ mappings: allPairs })
      setSuccess(`Created ${bulkRows.length} new employee${bulkRows.length !== 1 ? 's' : ''} from the machine data and mapped all ${allPairs.length} machine IDs.`)
      setBulkOpen(false); setBulkRows([])
      load(true)
    } catch (e) { setErr(e.message) }
    finally { setSavingBulk(false) }
  }

  const handleDeleteBatch = async (batchId) => {
    if (!window.confirm(`Delete batch ${batchId}? This removes it from the import queue — it does not affect any attendance already committed from it.`)) return
    setDeletingBatch(batchId); setErr(''); setSuccess('')
    try {
      await deleteMachineImportBatch(batchId)
      if (selectedBatch === batchId) setSelectedBatch(null)
      setSuccess('Batch deleted')
      load(true)
    } catch (e) { setErr(e.message) }
    finally { setDeletingBatch(null) }
  }

  const handleCommit = async () => {
    setCommitting(true); setErr(''); setSuccess('')
    try {
      const res = await commitMachineImport(selectedBatch ? { batchId: selectedBatch } : {})
      const d = res.data || {}
      setSuccess(`Committed ${d.committed} records${d.skipped ? ` (${d.skipped} skipped)` : ''}.`)
      load(true)
      onImported()
    } catch (e) { setErr(e.message) }
    finally { setCommitting(false) }
  }

  if (loading) return <div className="py-8 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>

  const hasMapped = unmapped.length > 0 && Object.values(mappings).some(Boolean)
  const pendingBatches = batches.filter(b => (b.pending + b.mapped) > 0)

  return (
    <div className="space-y-5">
      <ErrBox msg={err} />
      {success && <div className="flex items-center gap-2 p-3 bg-green-900/30 border border-green-700 rounded-lg text-green-300 text-sm"><CheckCircle className="w-4 h-4 flex-shrink-0" />{success}</div>}

      {/* Batch summary */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-semibold text-slate-200">Import Batches</h3>
          <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => load(true)}>Refresh</Button>
        </div>
        {batches.length === 0 ? (
          <p className="text-slate-500 text-sm py-4 text-center">No batches yet. Import a Jenix or ALOG/AGL file first.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-slate-700">{['Batch ID','Source','Records','Pending','Mapped','Committed','Date'].map(h => <th key={h} className="text-left py-2 px-2 text-slate-400">{h}</th>)}<th className="text-right py-2 px-2 text-slate-400">Action</th></tr></thead>
              <tbody>
                {batches.map(b => (
                  <tr key={b.import_batch} className={`border-b border-slate-800 hover:bg-slate-800/30 ${selectedBatch === b.import_batch ? 'bg-sky-900/20' : ''}`}>
                    <td className="py-2 px-2 font-mono text-slate-300 text-xs max-w-[120px] truncate">{b.import_batch}</td>
                    <td className="py-2 px-2 text-slate-400 capitalize">{b.source_type}</td>
                    <td className="py-2 px-2 text-slate-300">{b.total_records}</td>
                    <td className="py-2 px-2 text-amber-400">{b.pending}</td>
                    <td className="py-2 px-2 text-sky-400">{b.mapped}</td>
                    <td className="py-2 px-2 text-green-400">{b.committed}</td>
                    <td className="py-2 px-2 text-slate-500 text-xs">{b.imported_at?.slice(0,10)}</td>
                    <td className="py-2 px-2 text-right whitespace-nowrap">
                      <button onClick={() => setSelectedBatch(b.import_batch === selectedBatch ? null : b.import_batch)}
                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${selectedBatch === b.import_batch ? 'border-sky-500 text-sky-400 bg-sky-900/20' : 'border-slate-600 text-slate-400 hover:border-slate-500'}`}>
                        {selectedBatch === b.import_batch ? 'Deselect' : 'Select'}
                      </button>
                      <button onClick={() => handleDeleteBatch(b.import_batch)} disabled={deletingBatch === b.import_batch}
                        title="Delete this batch"
                        className="ml-1.5 inline-flex items-center rounded border border-red-800/60 p-1 text-red-400 hover:bg-red-900/30 disabled:opacity-50">
                        {deletingBatch === b.import_batch ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Map machine IDs */}
      {unmapped.length > 0 && (
        <div className="space-y-3">
          <div>
            <h3 className="text-base font-semibold text-slate-200">Map Machine IDs → Employees</h3>
            <p className="text-slate-500 text-xs mt-0.5">
              {unmapped.length} machine employee ID{unmapped.length !== 1 ? 's' : ''} not yet mapped.
              {Object.keys(autoMatched).length > 0 && (
                <> <strong className="text-green-400">{Object.keys(autoMatched).length} auto-matched by name</strong> — review and save, no need to re-pick those.</>
              )}
            </p>
          </div>

          {!bulkOpen && unmapped.some((row) => !mappings[row.machine_emp_id]) && (
            <div className="flex items-start gap-2.5 rounded-lg border border-sky-700/40 bg-sky-900/10 p-3">
              <UserPlus className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-slate-300 text-xs">
                  The machine already sent a name for everyone below with no match — you don&rsquo;t have to add them to
                  Employees by hand first. Fill in just department and salary (the only two required fields) for each,
                  and they&rsquo;ll be created and mapped in one go.
                </p>
                <Button size="sm" variant="secondary" icon={UserPlus} onClick={() => void handleOpenBulkCreate()} className="mt-2">
                  Create Employees &amp; Map Remaining
                </Button>
              </div>
            </div>
          )}

          {bulkOpen && (
            <div className="rounded-lg border border-sky-700/40 bg-sky-900/10 p-3 space-y-3">
              <p className="text-slate-300 text-xs font-semibold">
                {bulkRows.length} new employee{bulkRows.length !== 1 ? 's' : ''} — department &amp; salary required
              </p>
              <div className="max-h-56 overflow-y-auto pr-1 space-y-2">
                {bulkRows.map((row) => (
                  <div key={row.machineEmpId} className="bg-slate-900/60 border border-slate-700 rounded-lg px-2.5 py-1.5 space-y-1.5">
                    <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
                      <input value={row.name} onChange={(e) => updateBulkRow(row.machineEmpId, 'name', e.target.value)}
                        className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 text-sm focus:border-sky-500 focus:outline-none" />
                      <select
                        value={newDeptForRow === row.machineEmpId ? '__new__' : row.department}
                        onChange={(e) => {
                          if (e.target.value === '__new__') { setNewDeptForRow(row.machineEmpId); setNewDeptName('') }
                          else { setNewDeptForRow(null); updateBulkRow(row.machineEmpId, 'department', e.target.value) }
                        }}
                        className="w-36 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 text-sm focus:border-sky-500 focus:outline-none"
                      >
                        <option value="">— Department —</option>
                        {departments.map((d) => <option key={d.dept_id || d.name} value={d.name}>{d.name}</option>)}
                        <option value="__new__">+ Create New Department</option>
                      </select>
                      <input type="number" min="0" placeholder="Salary" value={row.salary}
                        onChange={(e) => updateBulkRow(row.machineEmpId, 'salary', e.target.value)}
                        className="w-24 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 text-sm focus:border-sky-500 focus:outline-none" />
                    </div>
                    {newDeptForRow === row.machineEmpId && (
                      <div className="flex gap-2 items-center pl-0.5">
                        <input autoFocus value={newDeptName} onChange={(e) => setNewDeptName(e.target.value)}
                          placeholder="New department name" onKeyDown={(e) => { if (e.key === 'Enter') handleCreateDepartment(row.machineEmpId) }}
                          className="flex-1 bg-slate-800 border border-sky-600 rounded px-2 py-1.5 text-slate-100 text-sm focus:outline-none" />
                        <Button size="sm" variant="primary" isLoading={creatingDept} onClick={() => handleCreateDepartment(row.machineEmpId)}>
                          Add
                        </Button>
                        <button onClick={() => { setNewDeptForRow(null); setNewDeptName('') }}
                          className="text-xs text-slate-400 hover:text-slate-200 px-1">Cancel</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => { setBulkOpen(false); setBulkRows([]) }}>Cancel</Button>
                <Button size="sm" variant="primary" isLoading={savingBulk} onClick={handleSaveBulkCreate}>
                  Save All ({bulkRows.length})
                </Button>
              </div>
            </div>
          )}
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {unmapped.map(row => (
              <div key={row.machine_emp_id} className="flex items-center gap-3 bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2">
                <div className="w-28 flex-shrink-0">
                  <p className="text-slate-300 text-sm font-mono font-semibold">ID: {row.machine_emp_id}</p>
                  {row.machine_name && <p className="text-slate-500 text-xs truncate">{row.machine_name}</p>}
                  <p className="text-slate-600 text-xs">{row.record_count} records</p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                <select
                  value={mappings[row.machine_emp_id] || ''}
                  onChange={(e) => {
                    const val = e.target.value
                    setMappings(m => ({ ...m, [row.machine_emp_id]: val }))
                    // HR changed it away from the suggestion — no longer "auto"
                    setAutoMatched(a => {
                      if (!(row.machine_emp_id in a)) return a
                      const next = { ...a }; delete next[row.machine_emp_id]; return next
                    })
                  }}
                  className={`flex-1 bg-slate-800 border rounded px-2 py-1.5 text-slate-100 text-sm focus:border-sky-500 focus:outline-none ${
                    autoMatched[row.machine_emp_id] ? 'border-green-600/60' : 'border-slate-700'
                  }`}
                >
                  <option value="">— Select Employee —</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.empCode ? `[${emp.empCode}] ` : ''}{emp.name}{emp.department ? ` — ${emp.department}` : ''}
                    </option>
                  ))}
                </select>
                {autoMatched[row.machine_emp_id] && (
                  <span className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full bg-green-900/40 text-green-300 border border-green-700/40">✓ matched</span>
                )}
              </div>
            ))}
          </div>
          <Button size="sm" variant="primary" isLoading={saving} onClick={handleSaveMappings} disabled={!hasMapped}>
            Save Mappings ({Object.values(mappings).filter(Boolean).length} selected)
          </Button>
        </div>
      )}

      {unmapped.length === 0 && batches.length > 0 && (
        <p className="text-green-400 text-sm text-center py-2">
          ✓ All machine IDs are mapped — commit below to write the attendance records. ↓
        </p>
      )}

      {/* Commit */}
      {pendingBatches.length > 0 && (
        <div className={`bg-slate-900/50 rounded-lg p-4 space-y-3 transition-colors ${
          unmapped.length === 0
            ? 'border-2 border-green-500 shadow-[0_0_0_3px_rgba(34,197,94,0.15)]'
            : 'border border-slate-700'
        }`}>
          <div>
            <h3 className="text-base font-semibold text-slate-200">Commit to Attendance Records</h3>
            <p className="text-slate-500 text-xs mt-0.5">
              {selectedBatch ? `Committing batch: ${selectedBatch}` : 'Committing all mapped records across all batches.'}
              {' '}Only records with a mapped employee will be committed.
            </p>
          </div>
          <Button variant="primary" isLoading={committing} onClick={handleCommit}>
            <Database className="w-4 h-4 mr-1.5 inline" />
            Commit {selectedBatch ? 'Selected Batch' : 'All Mapped Records'}
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Tab 6: Plugins ───────────────────────────────────────────────────────────
function PluginsTab() {
  const [showRequest, setShowRequest] = useState(false)
  const [reqForm, setReqForm]         = useState({ brand: '', model: '', notes: '' })
  const whatsappMsg = encodeURIComponent(`Hi, I need an EDGEFOLIO plugin for:\nBrand/Model: ${reqForm.brand} ${reqForm.model}\nNotes: ${reqForm.notes}`)
  const whatsappUrl = `https://wa.me/917240226566?text=${whatsappMsg}`
  const emailUrl    = `mailto:iotsoft.in@gmail.com?subject=Plugin%20Request%20-%20${encodeURIComponent(reqForm.brand)}&body=${whatsappMsg}`

  return (
    <div className="space-y-5">
      <div>
        <p className="text-slate-300 font-semibold">Available Plugins</p>
        <p className="text-slate-500 text-xs mt-0.5">Each plugin handles a machine brand's file format and/or network protocol.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {PLUGINS.map((p) => (
          <div key={p.id} className={`rounded-xl border p-3 space-y-1.5 ${p.status === 'official' ? 'border-sky-700 bg-sky-900/10' : 'border-slate-700 bg-slate-900/30'}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-200">{p.emoji} {p.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === 'official' ? 'bg-green-900/40 text-green-300' : 'bg-slate-700 text-slate-400'}`}>{p.status === 'official' ? 'Available' : 'Coming Soon'}</span>
            </div>
            <p className="text-xs text-slate-400">{p.models}</p>
            <div className="flex gap-3 text-xs text-slate-500">
              <span>Files: {p.fileFormats.join(', ').toUpperCase()}</span>
              {p.network && <span className="text-sky-400">● Network pull</span>}
            </div>
            {p.networkNote && <p className={`text-xs ${p.status === 'official' ? 'text-green-400' : 'text-amber-400'}`}>{p.networkNote}</p>}
          </div>
        ))}
      </div>
      <div className="border-t border-slate-700 pt-4">
        <button onClick={() => setShowRequest(!showRequest)} className="flex items-center gap-2 text-sm font-semibold text-sky-400 hover:text-sky-300 transition-colors">
          <Plug className="w-4 h-4" />{showRequest ? 'Hide' : 'Request a custom plugin →'}
        </button>
        {showRequest && (
          <div className="mt-4 space-y-3 bg-slate-900 border border-slate-700 rounded-xl p-4">
            <p className="text-slate-300 text-sm">Don't see your machine? Share details and we'll build the plugin.</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-slate-400 mb-1">Machine Brand *</label><input className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-100 text-sm focus:border-sky-500 focus:outline-none" placeholder="e.g. Realtime…" value={reqForm.brand} onChange={(e) => setReqForm((p) => ({ ...p, brand: e.target.value }))} /></div>
              <div><label className="block text-xs text-slate-400 mb-1">Model</label><input className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-100 text-sm focus:border-sky-500 focus:outline-none" placeholder="e.g. T12…" value={reqForm.model} onChange={(e) => setReqForm((p) => ({ ...p, model: e.target.value }))} /></div>
            </div>
            <textarea rows={2} className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-100 text-sm focus:border-sky-500 focus:outline-none resize-none" placeholder="Software name, export format…" value={reqForm.notes} onChange={(e) => setReqForm((p) => ({ ...p, notes: e.target.value }))} />
            <div className="flex gap-2">
              <a href={whatsappUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors">💬 WhatsApp</a>
              <a href={emailUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors">✉️ Email</a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────
const TABS = [
  { id: 'file',          label: 'File Import',   icon: Upload   },
  { id: 'network',       label: 'Network Pull',  icon: Wifi     },
  { id: 'jenix',         label: 'Jenix OEM',     icon: Plug     },
  { id: 'alog',          label: 'ALOG/AGL (Realtime)', icon: Upload },
  { id: 'machine-import',label: 'Machine Import', icon: Database },
  { id: 'plugins',       label: 'Plugins',       icon: Puzzle   },
]

export function ImportModal({ onClose, onImported }) {
  const [tab, setTab] = useState('file')

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">

        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-100">Import Attendance</h2>
            <p className="text-xs text-slate-400 mt-0.5">ZK Teco · Jenix OEM · Realtime ALOG/AGL · CSV / JSON / DAT</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex gap-1 px-4 pt-3 pb-1 border-b border-slate-700 flex-shrink-0 flex-wrap">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${tab === id ? 'bg-sky-600 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'}`}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0">
          {tab === 'file'          && <FileImportTab    onImported={onImported} onClose={onClose} />}
          {tab === 'network'       && <NetworkPullTab   onImported={onImported} onClose={onClose} />}
          {tab === 'jenix'         && <JenixImportPanel onGoToMachineImport={() => setTab('machine-import')} />}
          {tab === 'alog'          && <AlogImportPanel  onGoToMachineImport={() => setTab('machine-import')} />}
          {tab === 'machine-import'&& <MachineImportTab onImported={onImported} />}
          {tab === 'plugins'       && <PluginsTab />}
        </div>
      </div>
    </div>
  )
}

export default ImportModal
