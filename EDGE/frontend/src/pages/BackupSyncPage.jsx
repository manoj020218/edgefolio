import React, { useState } from 'react'
import { Cloud, HardDrive, RefreshCw, Shield, CheckCircle2, AlertCircle, Clock } from 'lucide-react'

export const BackupSyncPage = () => {
  const [syncing, setSyncing] = useState(false)
  const [lastSync] = useState('2026-04-27 09:15 AM')

  const handleSync = () => {
    setSyncing(true)
    setTimeout(() => setSyncing(false), 2000)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Backup & Sync</h2>
          <p className="text-slate-400 text-sm mt-1">Manage backups and VPS cloud synchronization</p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-60 transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing…' : 'Sync Now'}
        </button>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Local Backup', icon: HardDrive, status: 'Healthy', color: 'text-emerald-400', bg: 'bg-emerald-500/10', time: '10 mins ago' },
          { label: 'Cloud Sync', icon: Cloud, status: 'In Sync', color: 'text-primary-400', bg: 'bg-primary-500/10', time: lastSync },
          { label: 'Data Encryption', icon: Shield, status: 'AES-256', color: 'text-violet-400', bg: 'bg-violet-500/10', time: 'Active' },
        ].map(({ label, icon: Icon, status, color, bg, time }) => (
          <div key={label} className="bg-slate-800 border border-slate-700 rounded-xl p-5">
            <div className={`w-10 h-10 ${bg} rounded-lg flex items-center justify-center mb-3`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <p className="text-slate-400 text-xs">{label}</p>
            <p className={`text-lg font-semibold mt-1 ${color}`}>{status}</p>
            <p className="text-slate-500 text-xs mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" /> {time}
            </p>
          </div>
        ))}
      </div>

      {/* Backup log */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
        <h3 className="text-slate-200 font-medium mb-4">Recent Backups</h3>
        <div className="space-y-3">
          {[
            { file: 'edgefolio-backup-2026-04-27.pbbackup', size: '2.4 MB', status: 'success' },
            { file: 'edgefolio-backup-2026-04-26.pbbackup', size: '2.2 MB', status: 'success' },
            { file: 'edgefolio-backup-2026-04-25.pbbackup', size: '2.1 MB', status: 'warning' },
          ].map(({ file, size, status }) => (
            <div key={file} className="flex items-center gap-3 p-3 bg-slate-700/40 rounded-lg">
              {status === 'success'
                ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                : <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
              }
              <span className="text-slate-200 text-sm flex-1 font-mono text-xs">{file}</span>
              <span className="text-slate-400 text-xs">{size}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
