import { Push } from '@jenix/cap-push';
import { apiPatch } from './api';

// Requests notification permission (Android 13+ needs an explicit runtime
// prompt) and registers whatever FCM token Firebase hands back against
// EdgeFolio's own PATCH /apk/fcm-token — NOT @jenix/cap-push's generic
// PushTokenUploader, which posts to a different EMS backend contract this
// app doesn't implement. Safe to call after every login; failures are
// swallowed since push is a nice-to-have, not blocking for attendance.
export async function registerPushToken(): Promise<void> {
  try {
    let status = await Push.checkPermissions();
    if (status.notifications !== 'granted') {
      status = await Push.requestPermissions();
      if (status.notifications !== 'granted') return;
    }
    const { token } = await Push.getToken();
    if (!token) return;
    // apiPatch's client already prefixes every call with /apk (see api.ts) —
    // the route itself is EDGE/backend/routes/apk.js's `PATCH /fcm-token`.
    await apiPatch('/fcm-token', { fcmToken: token });
  } catch {
    // Best-effort — login must not fail because push registration did.
  }
}
