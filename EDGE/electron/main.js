const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron')
const path = require('path')
const { setupUpdater } = require('./updater')

const isDev = !app.isPackaged

let backendServer = null
let schedulerManager = null

// ─── Backend startup (production only — in dev, npm run dev:stack starts it) ──
function startBackend() {
  return new Promise((resolve) => {
    try {
      // Set writable paths to userData (outside the read-only asar archive)
      const userDataPath = app.getPath('userData')
      process.env.EDGEFOLIO_STORAGE_PATH = path.join(userDataPath, 'storage')
      process.env.EDGEFOLIO_LOG_PATH = path.join(userDataPath, 'logs')

      const { app: expressApp } = require('../backend/server')
      const { HOST, PORT } = require('../backend/config/app')
      const { getDb } = require('../backend/config/database')
      const { startSchedulers } = require('../backend/jobs')
      const u5Service = require('../backend/services/u5MachineService')
      const m68Service = require('../backend/services/m68Service')

      console.log(`[EDGEFOLIO] Storage path: ${process.env.EDGEFOLIO_STORAGE_PATH}`)
      getDb() // initialise SQLite DB + seed admin user
      console.log('[EDGEFOLIO] DB initialised')

      backendServer = expressApp.listen(PORT, HOST, () => {
        console.log(`[EDGEFOLIO] Backend ready on ${HOST}:${PORT}`)
        schedulerManager = startSchedulers()
        u5Service.start()
        m68Service.start()
        resolve()
      })

      backendServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`[EDGEFOLIO] Port ${PORT} already in use — using existing backend`)
        } else {
          console.error('[EDGEFOLIO] Backend error:', err.message)
        }
        resolve() // always resolve so the window still opens
      })
    } catch (err) {
      console.error('[EDGEFOLIO] Could not start backend:', err.message)
      console.error(err.stack)
      resolve()
    }
  })
}

// ─── Window factory ────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width:     1280,
    height:    820,
    minWidth:  1024,
    minHeight: 640,
    title:     'EDGEFOLIO',
    icon:      path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#0f172a',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
      devTools:         isDev,
    },
  })

  if (!isDev) Menu.setApplicationMenu(null)

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'))
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  return win
}

// ─── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('get-version', () => app.getVersion())
ipcMain.handle('get-platform', () => process.platform)

ipcMain.handle('show-open-dialog', async (_event, options) => {
  return dialog.showOpenDialog(options)
})

ipcMain.handle('show-save-dialog', async (_event, options) => {
  return dialog.showSaveDialog(options)
})

ipcMain.handle('open-path', (_event, filePath) => {
  shell.openPath(filePath)
})

// ─── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  if (!isDev) {
    await startBackend()
  }

  const win = createWindow()

  if (!isDev) {
    setupUpdater(win)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  if (schedulerManager) {
    schedulerManager.stopAll()
    schedulerManager = null
  }
  try { require('../backend/services/u5MachineService').stop() } catch {}
  try { require('../backend/services/m68Service').stop() } catch {}
  if (backendServer) {
    backendServer.close()
    backendServer = null
  }
})

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
}
