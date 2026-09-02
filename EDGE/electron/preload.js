const { contextBridge, ipcRenderer } = require('electron')

/**
 * Secure bridge between Electron main process and React renderer.
 * Exposes ONLY specific, named APIs — the renderer has zero direct Node.js access.
 * Accessible in React as: window.electronAPI.xxx()
 */
contextBridge.exposeInMainWorld('electronAPI', {

  // ── App info ──────────────────────────────────────────────────────────────
  getVersion:  () => ipcRenderer.invoke('get-version'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),

  // Manual "Check for Update" — fetches the marketing site's version.json and
  // compares against the running app's version. Never auto-downloads/installs.
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),

  // ── Native file dialogs ───────────────────────────────────────────────────
  // Used by: ZK .dat import, Excel import, Report export
  openFileDialog: (options) => ipcRenderer.invoke('show-open-dialog', {
    properties: ['openFile'],
    ...options,
  }),
  saveFileDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),

  // Folder picker — used by "Choose backup destination" in Settings
  chooseFolderDialog: () => ipcRenderer.invoke('show-open-dialog', {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Backup Destination Folder',
  }),

  // Open a file in the OS default app (e.g., open PDF payslip in Acrobat)
  openPath: (filePath) => ipcRenderer.invoke('open-path', filePath),

  // ── Auto-updater events ───────────────────────────────────────────────────
  // React can listen to these to show the update banner
  onUpdateAvailable:  (callback) => ipcRenderer.on('update-available',  (_e, info) => callback(info)),
  onUpdateProgress:   (callback) => ipcRenderer.on('update-progress',   (_e, prog) => callback(prog)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (_e, info) => callback(info)),
  onUpdateError:      (callback) => ipcRenderer.on('update-error',      (_e, err)  => callback(err)),

  // Trigger install and restart (called when user clicks "Restart Now")
  installUpdate: () => ipcRenderer.invoke('install-update'),

  // ── Cleanup helpers ───────────────────────────────────────────────────────
  // Remove listeners when React component unmounts (prevents memory leaks)
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
})
