import type { CapacitorConfig } from '@capacitor/cli';

// appId matches APK/android's applicationId (in.iotsoft.edgefolio) intentionally —
// this app is meant to eventually replace it, sharing the same Firebase/FCM identity.
// APK/android is left in place, untouched, as native reference/fallback.
const config: CapacitorConfig = {
  appId: 'in.iotsoft.edgefolio',
  appName: 'EdgeFolio',
  webDir: 'dist',
  // Capacitor's default 'https' scheme serves the app's own UI over a virtual
  // https://localhost origin. That's fine normally, but EDGE is a plain-HTTP
  // local server (no TLS cert for a PC's LAN IP) — Chromium's Mixed Content
  // policy then blocks every http:// fetch as "insecure content on an HTTPS
  // page", independent of the network_security_config cleartext exception
  // (that covers native/OS-level blocking, not WebView Mixed Content).
  // 'http' matches origin schemes so the WebView doesn't apply that policy.
  server: {
    androidScheme: 'http',
  },
};

export default config;
