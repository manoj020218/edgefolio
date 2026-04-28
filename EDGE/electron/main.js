const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron')
const path = require('path')
const { setupUpdater } = require('./updater')

const isDev = !app.isPackaged

// ─── Window factory ────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width:     1280,
    height:    820,
    minWidth:  1024,
    minHeight: 640,
    title:     'EDGEFOLIO',
    icon:      path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#0f172a',   // dark bg shown before React mounts (no white flash)
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,      // SECURITY: renderer cannot access Node directly
      nodeIntegration:  false,     // SECURITY: never true
      sandbox:          false,     // preload needs limited Node access
      devTools:         isDev,
    },
  })

  // Remove default menu in production (keeps Ctrl+R, F12 in dev)
  if (!isDev) {
    Menu.setApplicationMenu(null)
  }

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    // In packaged app, frontend/dist is bundled inside the asar
    win.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'))
  }

  // Open external links in real browser, not in the Electron window
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  return win
}

// ─── IPC handlers ──────────────────────────────────────────────────────────────

// App version
ipcMain.handle('get-version', () => app.getVersion())

// Platform info
ipcMain.handle('get-platform', () => process.platform)

// Native file open dialog (used by ZK import, Excel import)
ipcMain.handle('show-open-dialog', async (_event, options) => {
  const result = await dialog.showOpenDialog(options)
  return result
})

// Native file save dialog (used by report export)
ipcMain.handle('show-save-dialog', async (_event, options) => {
  const result = await dialog.showSaveDialog(options)
  return result
})

// Open file in native app (open PDF payslip in default PDF viewer)
ipcMain.handle('open-path', (_event, filePath) => {
  shell.openPath(filePath)
})

// ─── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  const win = createWindow()

  if (!isDev) {
    setupUpdater(win)
  }

  app.on('activate', () => {
    // macOS: re-create window when dock icon is clicked with no windows open
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // On macOS, apps stay open until user explicitly quits (Cmd+Q)
  if (process.platform !== 'darwin') app.quit()
})

// Prevent multiple instances of the app
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
