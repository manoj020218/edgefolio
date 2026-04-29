import React, { useEffect, useState } from 'react'
import { Download, RefreshCw, X, Zap } from 'lucide-react'

/**
 * Shows auto-update notifications when running inside Electron.
 * Invisible in browser (window.electronAPI won't exist).
 * Renders as a fixed banner at the top of the app.
 */
export function UpdateBanner() {
  const [state, setState] = useState(null)
  // state shapes:
  //  { type: 'available',   version, releaseNotes }
  //  { type: 'downloading', percent }
  //  { type: 'ready',       version }
  //  { type: 'error',       message }

  const isElectron = typeof window !== 'undefined' && !!window.electronAPI

  useEffect(() => {
    if (!isElectron) return

    const api = window.electronAPI

    api.onUpdateAvailable((info) => {
      setState({ type: 'available', version: info.version, notes: info.releaseNotes })
    })

    api.onUpdateProgress((prog) => {
      setState((prev) => ({ ...prev, type: 'downloading', percent: prog.percent }))
    })

    api.onUpdateDownloaded((info) => {
      setState({ type: 'ready', version: info.version })
    })

    api.onUpdateError((msg) => {
      // ENOENT = portable build has no app-update.yml — not a user-visible error
      if (typeof msg === 'string' && (msg.includes('ENOENT') || msg.includes('ERR_FILE_NOT_FOUND'))) return
      setState({ type: 'error', message: msg })
    })

    return () => {
      api.removeAllListeners('update-available')
      api.removeAllListeners('update-progress')
      api.removeAllListeners('update-downloaded')
      api.removeAllListeners('update-error')
    }
  }, [isElectron])

  if (!state || !isElectron) return null

  return (
    <div className={`
      fixed top-0 left-0 right-0 z-50 flex items-center gap-3 px-4 py-2.5 text-sm font-medium
      ${state.type === 'error' ? 'bg-red-600' : 'bg-primary-600'}
    `}>
      {/* Icon */}
      {state.type === 'available'   && <Zap className="w-4 h-4 text-white flex-shrink-0" />}
      {state.type === 'downloading' && <Download className="w-4 h-4 text-white flex-shrink-0 animate-bounce" />}
      {state.type === 'ready'       && <RefreshCw className="w-4 h-4 text-white flex-shrink-0" />}

      {/* Message */}
      <span className="text-white flex-1">
        {state.type === 'available' && (
          <>Version <strong>{state.version}</strong> is available — downloading in background…</>
        )}
        {state.type === 'downloading' && (
          <>Downloading update… <strong>{state.percent}%</strong></>
        )}
        {state.type === 'ready' && (
          <>Version <strong>{state.version}</strong> is ready to install.</>
        )}
        {state.type === 'error' && (
          <>Update check failed: {state.message}</>
        )}
      </span>

      {/* Progress bar (downloading state) */}
      {state.type === 'downloading' && (
        <div className="w-32 h-1.5 bg-white/20 rounded-full overflow-hidden flex-shrink-0">
          <div
            className="h-full bg-white rounded-full transition-all duration-300"
            style={{ width: `${state.percent}%` }}
          />
        </div>
      )}

      {/* Restart Now button */}
      {state.type === 'ready' && (
        <button
          onClick={() => window.electronAPI.installUpdate()}
          className="px-3 py-1 bg-white text-primary-700 rounded-md text-xs font-bold hover:bg-slate-100 transition-colors flex-shrink-0"
        >
          Restart Now
        </button>
      )}

      {/* Dismiss button (not shown during download) */}
      {state.type !== 'downloading' && (
        <button
          onClick={() => setState(null)}
          className="p-1 text-white/70 hover:text-white rounded flex-shrink-0"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
