import type { CapacitorConfig } from '@capacitor/cli';

// Dev-shell config. Loads `out/` (which holds the dev-shell HTML when built
// via `pnpm build:dev-shell`). The native MainViewController / MainActivity
// reads a saved dev URL from UserDefaults / SharedPreferences before the
// Capacitor bridge initializes, and overrides serverURL there. So the WebView
// boots straight at your `next dev` server with HMR — without any in-WebView
// navigation that would hit Capacitor's nav gate and bounce to Safari/Chrome.
//
// Do NOT add `server.url` here — that hardcodes the URL at build time.
const config: CapacitorConfig = {
  appId: 'com.codergautamyt.worldguessr',
  appName: 'WorldGuessr',
  webDir: 'out',
  server: {
    androidScheme: 'http',
    iosScheme: 'http',
    cleartext: true,
    // Belt-and-suspenders: if the saved URL is empty and the user types one
    // into the bundled shell that triggers a navigation rather than a
    // process restart, allow it in-WebView instead of opening the system
    // browser. Dev IPA only — never ship this in a prod config.
    allowNavigation: ['*'],
  },
  ios: {
    contentInset: 'never',
    limitsNavigationsToAppBoundDomains: false,
    backgroundColor: '#000000',
  },
  android: {
    backgroundColor: '#000000',
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
};

export default config;
