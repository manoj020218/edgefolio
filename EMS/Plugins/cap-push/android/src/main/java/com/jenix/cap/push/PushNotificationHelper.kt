package com.jenix.cap.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat

object PushNotificationHelper {
    /**
     * Shows a notification built in-app (foreground pushes and data-only messages). [channel] is one
     * of NotificationChannels' ids when the server sent one; otherwise the legacy "jenix_admin"
     * channel (other apps using this plugin keep working unchanged). Tapping opens the app.
     */
    fun showAdminMessage(context: Context, title: String, body: String, channel: String? = null, data: Map<String, String> = emptyMap()) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channelId = if (channel != null && channel.startsWith("ef_")) {
            NotificationChannels.ensure(context)
            channel
        } else {
            manager.createNotificationChannel(NotificationChannel("jenix_admin", "Admin", NotificationManager.IMPORTANCE_HIGH))
            "jenix_admin"
        }

        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            data.forEach { (k, v) -> putExtra(k, v) }
        }
        val pending = launch?.let {
            PendingIntent.getActivity(context, (System.currentTimeMillis() % Int.MAX_VALUE).toInt(), it,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }

        val notification = NotificationCompat.Builder(context, channelId)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(if (channelId == NotificationChannels.REQUESTS) NotificationCompat.CATEGORY_REMINDER else NotificationCompat.CATEGORY_MESSAGE)
            .setVibrate(NotificationChannels.vibrationFor(channelId))   // pre-Android 8; channels handle 8+
            .setNumber(1)
            .setAutoCancel(true)
            .apply { if (pending != null) setContentIntent(pending) }
            .build()
        manager.notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), notification)
    }
}
