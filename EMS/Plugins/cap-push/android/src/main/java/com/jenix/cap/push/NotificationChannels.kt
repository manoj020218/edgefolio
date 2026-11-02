package com.jenix.cap.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.ContentResolver
import android.content.Context
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build

/**
 * EdgeFolio's notification channels. The server tags each push with one of these ids
 * (FCM android.notification.channelId), so every kind of notification gets its own sound,
 * vibration and launcher badge — and the user can tune each one in Android settings.
 *
 * Android fixes a channel's sound/vibration when it is first created; to change them later,
 * bump the id (e.g. ef_alerts_v2) and delete the old one here.
 */
object NotificationChannels {
    const val ALERTS = "ef_alerts_v2"    // "X checked in / out" monitoring
    // v2: the first version stored its sound by numeric resource id, which shifted when more sounds
    // were added (it played the holiday chime). Sounds are now referenced by NAME, which is stable.
    const val REQUESTS = "ef_requests_v2" // approvals: Face ID re-capture etc.
    private val RETIRED = listOf("ef_requests", "ef_alerts", "ef_sos", "ef_holiday")
    const val GENERAL = "ef_general"     // fallback for anything untagged
    const val ANNOUNCE = "ef_announce"   // notices / events / app updates
    const val SOS = "ef_sos_v2"          // urgent announcements: gong
    const val HOLIDAY = "ef_holiday_v2"  // holiday notices: happy chime

    private val VIBRATE_ALERT = longArrayOf(0, 120, 90, 120)           // quick double buzz
    private val VIBRATE_REQUEST = longArrayOf(0, 350, 150, 120, 150, 350) // long-short-long
    private val VIBRATE_GENERAL = longArrayOf(0, 250)
    private val VIBRATE_ANNOUNCE = longArrayOf(0, 400, 180, 400)                          // strong double
    private val VIBRATE_SOS = longArrayOf(0, 700, 200, 700, 200, 700, 200, 700)           // urgent, long
    private val VIBRATE_HOLIDAY = longArrayOf(0, 90, 70, 90, 70, 90, 120, 300)            // playful

    fun ensure(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        fun channel(id: String, name: String, desc: String, sound: Uri?, vibrate: LongArray) =
            NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH).apply {
                description = desc
                enableVibration(true)
                vibrationPattern = vibrate
                setShowBadge(true)
                enableLights(true)
                if (sound != null) setSound(sound, attrs)
            }
        RETIRED.forEach { nm.deleteNotificationChannel(it) }
        nm.createNotificationChannels(listOf(
            channel(ALERTS, "Attendance alerts", "When someone you watch checks in or out", rawUri(context, "ef_alert"), VIBRATE_ALERT),
            channel(REQUESTS, "Requests & approvals", "Face ID re-capture requests and decisions", rawUri(context, "ef_request"), VIBRATE_REQUEST),
            channel(GENERAL, "Other notifications", "Anything else from EdgeFolio", android.provider.Settings.System.DEFAULT_NOTIFICATION_URI, VIBRATE_GENERAL),
            channel(ANNOUNCE, "Announcements", "Notices, events and app updates from your company", android.provider.Settings.System.DEFAULT_NOTIFICATION_URI, VIBRATE_ANNOUNCE),
            channel(SOS, "Urgent (SOS)", "Urgent announcements from your company", rawUri(context, "ef_sos"), VIBRATE_SOS),
            channel(HOLIDAY, "Holiday notices", "Holiday announcements", rawUri(context, "ef_holiday"), VIBRATE_HOLIDAY),
        ))
    }

    fun vibrationFor(channel: String): LongArray = when (channel) {
        ALERTS -> VIBRATE_ALERT
        REQUESTS -> VIBRATE_REQUEST
        ANNOUNCE -> VIBRATE_ANNOUNCE
        SOS -> VIBRATE_SOS
        HOLIDAY -> VIBRATE_HOLIDAY
        else -> VIBRATE_GENERAL
    }

    // By name (android.resource://pkg/raw/name), never by numeric id: ids change between builds.
    // Referencing R.raw.* below keeps R8's resource shrinker from dropping the files.
    private val KEEP = intArrayOf(R.raw.ef_alert, R.raw.ef_request, R.raw.ef_sos, R.raw.ef_holiday)
    private fun rawUri(context: Context, name: String): Uri =
        Uri.parse("${ContentResolver.SCHEME_ANDROID_RESOURCE}://${context.packageName}/raw/$name")
}
