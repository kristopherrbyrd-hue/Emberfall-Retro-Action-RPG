import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kristopherrbyrd.emberfall',
  appName: 'Emberfall',
  webDir: 'dist',
  // Assets are bundled inside the APK; no server.url or live-reload URL.
  android: { allowMixedContent: false },
};

export default config;
