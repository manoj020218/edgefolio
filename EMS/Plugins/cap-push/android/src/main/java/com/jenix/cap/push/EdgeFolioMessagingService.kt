package com.jenix.cap.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

// The OS-level receiver for FCM — without this registered (see
// AndroidManifest.xml's MESSAGING_EVENT intent-filter), no push message ever
// arrives while the app is backgrounded or killed, no matter how correctly
// the rest of the push plumbing (PushPlugin, JenixPushMessageHandler,
// PushStateStore) is wired. This class is intentionally thin — it only
// captures the token and dispatches; PushNotificationHelper/
// JenixPushMessageHandler already had the real logic, just never had
// anything calling them from a real push.
class EdgeFolioMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        // Just persist it here — uploading to EdgeFolio's own
        // PATCH /apk/fcm-token needs the app's JWT, which this native layer
        // doesn't hold. The JS side (src/lib/push.ts) reads this via
        // JenixPush.getToken() and uploads it using its own authenticated
        // API client instead.
        PushStateStore(applicationContext).saveToken(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        // Firebase auto-displays a "notification" payload only while the app
        // is backgrounded/killed — in the foreground (and for pure "data"
        // messages, which is what broadcastHandler's ADMIN_MESSAGE payloads
        // are) nothing shows unless this builds it manually.
        val title = message.notification?.title ?: message.data["title"]
        val body = message.notification?.body ?: message.data["body"]
        if (!title.isNullOrBlank() || !body.isNullOrBlank()) {
            PushNotificationHelper.showAdminMessage(applicationContext, title ?: "EdgeFolio", body ?: "")
        }

        if (message.data.isNotEmpty()) {
            JenixPushMessageHandler.handleData(applicationContext, message.data)
        }
    }
}
