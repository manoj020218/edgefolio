import React, { useEffect, useState } from 'react'
import { Megaphone, X } from 'lucide-react'
import { getAnnouncement } from '../../services/api'

const DISMISSED_KEY = 'ef_dismissed_announcement'

const LEVEL_CLASSES = {
  info:    'bg-primary-600',
  warning: 'bg-amber-600',
  success: 'bg-emerald-600',
}

/**
 * Shows the current admin-published announcement, delivered via the license heartbeat.
 * This is the notification channel for "new version available" / urgent notices — the
 * GitHub Releases auto-updater is disabled (see electron/updater.js for why).
 * Dismissal is remembered per-message, so it won't reappear until the message changes.
 */
export function AnnouncementBanner() {
  const [announcement, setAnnouncement] = useState(null)

  useEffect(() => {
    getAnnouncement()
      .then((res) => {
        const ann = res?.data?.data?.announcement
        if (!ann || !ann.message) return
        if (localStorage.getItem(DISMISSED_KEY) === ann.message) return
        setAnnouncement(ann)
      })
      .catch(() => { /* offline or backend not ready yet — not user-visible */ })
  }, [])

  if (!announcement) return null

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, announcement.message)
    setAnnouncement(null)
  }

  return (
    <div className={`fixed top-0 left-0 right-0 z-50 flex items-center gap-3 px-4 py-2.5 text-sm font-medium ${LEVEL_CLASSES[announcement.level] || LEVEL_CLASSES.info}`}>
      <Megaphone className="w-4 h-4 text-white flex-shrink-0" />
      <span className="text-white flex-1">
        {announcement.message}
        {announcement.url && (
          <a href={announcement.url} target="_blank" rel="noopener noreferrer"
            className="ml-2 underline font-semibold hover:text-white/80">
            Learn more
          </a>
        )}
      </span>
      <button onClick={dismiss} className="p-1 text-white/70 hover:text-white rounded flex-shrink-0" title="Dismiss">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
