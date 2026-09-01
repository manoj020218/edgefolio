import type { CapacitorConfig } from '@capacitor/cli';

// appId matches APK/android's applicationId (in.iotsoft.edgefolio) intentionally —
// this app is meant to eventually replace it, sharing the same Firebase/FCM identity.
// APK/android is left in place, untouched, as native reference/fallback.
const config: CapacitorConfig = {
  appId: 'in.iotsoft.edgefolio',
  appName: 'EdgeFolio',
  webDir: 'dist',
};

export default config;
