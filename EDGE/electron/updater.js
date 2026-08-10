const { autoUpdater } = require('electron-updater')
const { ipcMain } = require('electron')

/**
 * Sets up electron-updater to check GitHub Releases for new versions.
 * Events are forwarded to the renderer via the preload bridge.
 * The React UpdateBanner component listens and shows the UI.
 */
function setupUpdater(win) {
  // Portable builds have no app-update.yml — skip auto-update silently
  if (process.env.PORTABLE_EXECUTABLE_DIR) return

  autoUpdater.autoDownload        = true   // download silently in background
  autoUpdater.autoInstallOnAppQuit = true   // install if user quits normally

  // GitHub Releases checks are disabled: no release has ever actually been published to
  // github.com/manoj020218/edgefolio/releases (confirmed empty), so electron-updater's
  // GitHubProvider always fails to resolve a "latest" version and throws. Re-enable this
  // once a real publish pipeline (electron-builder --publish, with latest.yml + installer
  // assets attached to an actual non-prerelease GitHub Release) exists. Update
  // notifications are handled instead by the license-heartbeat-driven announcement banner
  // (see licenseService.js / AnnouncementBanner.jsx).
  // try { autoUpdater.checkForUpdates() } catch { /* no-op */ }
  // setInterval(() => { try { autoUpdater.checkForUpdates() } catch { /* no-op */ } }, 4 * 60 * 60 * 1000)

  // ── Events → renderer ────────────────────────────────────────────────────

  autoUpdater.on('checking-for-update', () => {
    // Silently checking — no UI needed
  })

  autoUpdater.on('update-available', (info) => {
    // Renderer shows: "Version X.Y.Z available — downloading…"
    win.webContents.send('update-available', {
      version:     info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    })
  })

  autoUpdater.on('update-not-available', () => {
    // Already on latest — no UI needed
  })

  autoUpdater.on('download-progress', (progress) => {
    // Renderer shows progress bar
    win.webContents.send('update-progress', {
      percent:         Math.round(progress.percent),
      transferred:     progress.transferred,
      total:           progress.total,
      bytesPerSecond:  progress.bytesPerSecond,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    // Renderer shows: "Update ready — Restart now?"
    win.webContents.send('update-downloaded', {
      version: info.version,
    })
  })

  autoUpdater.on('error', (err) => {
    // Renderer can optionally show a small error toast
    win.webContents.send('update-error', err.message)
    console.error('[updater] Error:', err)
  })

  // ── IPC: user clicks "Restart Now" ───────────────────────────────────────
  ipcMain.handle('install-update', async () => {
    // Safety backup before the update replaces files
    try {
      const { createPreUpdateBackup } = require('../backend/services/backupService')
      createPreUpdateBackup()
      console.log('[updater] Pre-update backup created')
    } catch (e) {
      console.warn('[updater] Pre-update backup failed (non-fatal):', e.message)
    }
    autoUpdater.quitAndInstall(false, true)  // isSilent=false, isForceRunAfter=true
  })
}

module.exports = { setupUpdater }
