// Single import surface for Capacitor plugins.
// Every export is web-safe: on browsers it no-ops; on native it lazy-loads
// the real plugin so the web bundle stays lean.
//
// Usage: `import { isNative, haptic, share } from '@/lib/native';`
// (or relative import — works either way).

// Capacitor injects `window.Capacitor` on native platforms, so the sync
// platform check needs no module import. Async helpers below dynamic-import
// each plugin only when isNative() is true, keeping the web bundle lean.

export function isNative() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

export function getPlatform() {
  if (typeof window === 'undefined') return 'web';
  if (window.Capacitor && window.Capacitor.getPlatform) {
    return window.Capacitor.getPlatform();
  }
  return 'web';
}

// ---------- Haptics ----------

const HAPTIC_STYLES = {
  light: 'LIGHT',
  medium: 'MEDIUM',
  heavy: 'HEAVY',
};

let _haptics = null;
async function loadHaptics() {
  if (_haptics) return _haptics;
  if (!isNative()) return null;
  try {
    _haptics = await import('@capacitor/haptics');
  } catch {
    _haptics = false;
  }
  return _haptics || null;
}

export async function haptic(style = 'light') {
  if (!isNative()) return;
  const mod = await loadHaptics();
  if (!mod) return;
  try {
    const impactStyle = mod.ImpactStyle?.[HAPTIC_STYLES[style] || 'LIGHT'];
    await mod.Haptics.impact({ style: impactStyle });
  } catch {
    // swallow — haptics are nice-to-have
  }
}

export async function hapticSelection() {
  if (!isNative()) return;
  const mod = await loadHaptics();
  if (!mod) return;
  try {
    await mod.Haptics.selectionStart();
    await mod.Haptics.selectionEnd();
  } catch {}
}

export async function hapticNotify(type = 'success') {
  if (!isNative()) return;
  const mod = await loadHaptics();
  if (!mod) return;
  const map = { success: 'SUCCESS', warning: 'WARNING', error: 'ERROR' };
  try {
    const notifType = mod.NotificationType?.[map[type] || 'SUCCESS'];
    await mod.Haptics.notification({ type: notifType });
  } catch {}
}

// ---------- Share ----------

export async function share({ title, text, url, dialogTitle } = {}) {
  if (isNative()) {
    try {
      const mod = await import('@capacitor/share');
      const res = await mod.Share.canShare();
      if (res?.value) {
        await mod.Share.share({ title, text, url, dialogTitle });
        return true;
      }
    } catch {}
  }
  // Web fallback: navigator.share if available, else copy to clipboard.
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return true;
    } catch {
      return false;
    }
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard && url) {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {}
  }
  return false;
}

// ---------- Status Bar ----------

export async function setStatusBar({ style, backgroundColor, overlay } = {}) {
  if (!isNative()) return;
  try {
    const mod = await import('@capacitor/status-bar');
    if (style) {
      const styleMap = { light: 'Light', dark: 'Dark', default: 'Default' };
      await mod.StatusBar.setStyle({
        style: mod.Style[styleMap[style] || 'Default'],
      });
    }
    if (backgroundColor && getPlatform() === 'android') {
      await mod.StatusBar.setBackgroundColor({ color: backgroundColor });
    }
    if (typeof overlay === 'boolean') {
      await mod.StatusBar.setOverlaysWebView({ overlay });
    }
  } catch {}
}

export async function hideStatusBar() {
  if (!isNative()) return;
  try {
    const mod = await import('@capacitor/status-bar');
    await mod.StatusBar.hide();
  } catch {}
}

export async function showStatusBar() {
  if (!isNative()) return;
  try {
    const mod = await import('@capacitor/status-bar');
    await mod.StatusBar.show();
  } catch {}
}

// ---------- Splash ----------

export async function hideSplash() {
  if (!isNative()) return;
  try {
    const mod = await import('@capacitor/splash-screen');
    await mod.SplashScreen.hide({ fadeOutDuration: 200 });
  } catch {}
}

// ---------- App lifecycle / URL open / Back button ----------

export async function onAppUrlOpen(handler) {
  if (!isNative()) return () => {};
  try {
    const mod = await import('@capacitor/app');
    const sub = await mod.App.addListener('appUrlOpen', handler);
    return () => sub.remove();
  } catch {
    return () => {};
  }
}

export async function onAppStateChange(handler) {
  if (!isNative()) return () => {};
  try {
    const mod = await import('@capacitor/app');
    const sub = await mod.App.addListener('appStateChange', handler);
    return () => sub.remove();
  } catch {
    return () => {};
  }
}

export async function onBackButton(handler) {
  if (!isNative()) return () => {};
  try {
    const mod = await import('@capacitor/app');
    const sub = await mod.App.addListener('backButton', handler);
    return () => sub.remove();
  } catch {
    return () => {};
  }
}

export async function exitApp() {
  if (!isNative()) return;
  try {
    const mod = await import('@capacitor/app');
    await mod.App.exitApp();
  } catch {}
}

// ---------- Browser (in-app, used for OAuth) ----------

export async function openBrowser(url, presentationStyle = 'popover') {
  if (!isNative()) {
    if (typeof window !== 'undefined') window.open(url, '_blank');
    return;
  }
  try {
    const mod = await import('@capacitor/browser');
    await mod.Browser.open({ url, presentationStyle });
  } catch {
    if (typeof window !== 'undefined') window.open(url, '_blank');
  }
}

export async function closeBrowser() {
  if (!isNative()) return;
  try {
    const mod = await import('@capacitor/browser');
    await mod.Browser.close();
  } catch {}
}

// ---------- Network ----------

export async function onNetworkChange(handler) {
  if (!isNative()) return () => {};
  try {
    const mod = await import('@capacitor/network');
    const sub = await mod.Network.addListener('networkStatusChange', handler);
    return () => sub.remove();
  } catch {
    return () => {};
  }
}

export async function getNetworkStatus() {
  if (!isNative()) {
    return {
      connected: typeof navigator !== 'undefined' ? navigator.onLine : true,
      connectionType: 'unknown',
    };
  }
  try {
    const mod = await import('@capacitor/network');
    return await mod.Network.getStatus();
  } catch {
    return { connected: true, connectionType: 'unknown' };
  }
}

// ---------- Keep awake ----------

export async function keepAwake() {
  if (!isNative()) return;
  try {
    const mod = await import('@capacitor-community/keep-awake');
    await mod.KeepAwake.keepAwake();
  } catch {}
}

export async function allowSleep() {
  if (!isNative()) return;
  try {
    const mod = await import('@capacitor-community/keep-awake');
    await mod.KeepAwake.allowSleep();
  } catch {}
}

// ---------- Screen orientation ----------

export async function lockOrientation(orientation) {
  if (!isNative()) return;
  try {
    const mod = await import('@capacitor/screen-orientation');
    await mod.ScreenOrientation.lock({ orientation });
  } catch {}
}

export async function unlockOrientation() {
  if (!isNative()) return;
  try {
    const mod = await import('@capacitor/screen-orientation');
    await mod.ScreenOrientation.unlock();
  } catch {}
}

// ---------- Keyboard ----------

export async function onKeyboardShow(handler) {
  if (!isNative()) return () => {};
  try {
    const mod = await import('@capacitor/keyboard');
    const sub = await mod.Keyboard.addListener('keyboardWillShow', handler);
    return () => sub.remove();
  } catch {
    return () => {};
  }
}

export async function onKeyboardHide(handler) {
  if (!isNative()) return () => {};
  try {
    const mod = await import('@capacitor/keyboard');
    const sub = await mod.Keyboard.addListener('keyboardWillHide', handler);
    return () => sub.remove();
  } catch {
    return () => {};
  }
}
