package `in`.iotsoft.edgefolio.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import `in`.iotsoft.edgefolio.MainActivity
import `in`.iotsoft.edgefolio.R
import `in`.iotsoft.edgefolio.data.prefs.EncryptedPrefs
import `in`.iotsoft.edgefolio.network.ApiClient
import `in`.iotsoft.edgefolio.data.model.FcmTokenRequest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

@AndroidEntryPoint
class EdgefolioFcmService : FirebaseMessagingService() {

    @Inject lateinit var prefs: EncryptedPrefs
    @Inject lateinit var apiClient: ApiClient

    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title ?: message.data["title"] ?: "EdgeFolio"
        val body  = message.notification?.body  ?: message.data["body"]  ?: ""
        val type  = message.data["type"] ?: ""

        Timber.d("FCM received: type=$type title=$title")

        ensureNotificationChannel()

        val intent = Intent(this, MainActivity::class.java).apply { flags = Intent.FLAG_ACTIVITY_CLEAR_TOP }
        val pendingIntent = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent)
            .build()

        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(System.currentTimeMillis().toInt(), notification)
    }

    // Called when Firebase rotates the token — re-register with EDGE
    override fun onNewToken(token: String) {
        Timber.d("FCM token refreshed")
        val baseUrl = prefs.resolvedBaseUrl ?: return
        CoroutineScope(Dispatchers.IO).launch {
            try {
                apiClient.get(baseUrl).registerFcmToken(FcmTokenRequest(token))
            } catch (e: Exception) {
                Timber.w("FCM token re-registration failed: ${e.message}")
            }
        }
    }

    private fun ensureNotificationChannel() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(CHANNEL_ID, getString(R.string.fcm_channel_name), NotificationManager.IMPORTANCE_HIGH)
        nm.createNotificationChannel(channel)
    }

    companion object {
        private const val CHANNEL_ID = "edgefolio_alerts"
    }
}
