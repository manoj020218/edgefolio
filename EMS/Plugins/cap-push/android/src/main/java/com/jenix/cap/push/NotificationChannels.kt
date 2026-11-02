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
    const val ALERTS = "ef_alerts"       // "X checked in / out" monitoring
    const val REQUESTS = "ef_requests"   // approvals: Face ID re-capture etc.
    const val GENERAL = "ef_general"     // announcements and everything else

    private val VIBRATE_ALERT = longArrayOf(0, 120, 90, 120)           // quick double buzz
    private val VIBRATE_REQUEST = longArrayOf(0, 350, 150, 120, 150, 350) // long-short-long
    private val VIBRATE_GENERAL = longArrayOf(0, 250)

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
        nm.createNotificationChannels(listOf(
            channel(ALERTS, "Attendance alerts", "When someone you watch checks in or out", rawUri(context, R.raw.ef_alert), VIBRATE_ALERT),
            channel(REQUESTS, "Requests & approvals", "Face ID re-capture requests and decisions", rawUri(context, R.raw.ef_request), VIBRATE_REQUEST),
            channel(GENERAL, "Announcements", "Notices from your company", android.provider.Settings.System.DEFAULT_NOTIFICATION_URI, VIBRATE_GENERAL),
        ))
    }

    fun vibrationFor(channel: String): LongArray = when (channel) {
        ALERTS -> VIBRATE_ALERT
        REQUESTS -> VIBRATE_REQUEST
        else -> VIBRATE_GENERAL
    }

    private fun rawUri(context: Context, resId: Int): Uri =
        Uri.parse("${ContentResolver.SCHEME_ANDROID_RESOURCE}://${context.packageName}/$resId")
}
