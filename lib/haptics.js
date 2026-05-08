let hapticsImport = null;
let lastHapticAt = 0;

const FALLBACK_PATTERNS = {
  selection: 8,
  "impact-light": 10,
  "impact-medium": 18,
  "impact-heavy": 28,
  success: [12, 35, 18],
  warning: [18, 45, 18],
  error: [28, 35, 28, 35, 28],
};

const IMPACT_STYLES = {
  "impact-light": "Light",
  "impact-medium": "Medium",
  "impact-heavy": "Heavy",
};

const NOTIFICATION_TYPES = {
  success: "Success",
  warning: "Warning",
  error: "Error",
};

function getCapacitor() {
  if (typeof window === "undefined") return null;
  return window.Capacitor || null;
}

function isNativePlatform() {
  const capacitor = getCapacitor();
  return !!(
    capacitor?.isNativePlatform?.() ||
    (capacitor?.getPlatform && capacitor.getPlatform() !== "web")
  );
}

function loadHaptics() {
  if (!hapticsImport) {
    hapticsImport = import("@capacitor/haptics").catch(() => null);
  }
  return hapticsImport;
}

function vibrateFallback(kind) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(FALLBACK_PATTERNS[kind] || FALLBACK_PATTERNS["impact-light"]);
  } catch (_) {}
}

async function runNativeHaptic(kind) {
  const hapticsModule = await loadHaptics();
  const Haptics = hapticsModule?.Haptics;
  if (!Haptics) return false;

  if (kind === "selection") {
    await Haptics.selectionChanged();
    return true;
  }

  if (kind === "success" || kind === "warning" || kind === "error") {
    const notificationType = hapticsModule.NotificationType?.[NOTIFICATION_TYPES[kind]];
    await Haptics.notification({ type: notificationType || kind.toUpperCase() });
    return true;
  }

  const impactStyle = hapticsModule.ImpactStyle?.[IMPACT_STYLES[kind]] || IMPACT_STYLES[kind] || "Light";
  await Haptics.impact({ style: impactStyle });
  return true;
}

export function triggerHaptic(kind = "impact-light") {
  if (typeof window === "undefined") return;

  const now = Date.now();
  if (now - lastHapticAt < 35) return;
  lastHapticAt = now;

  if (!isNativePlatform()) {
    vibrateFallback(kind);
    return;
  }

  runNativeHaptic(kind).catch(() => {
    vibrateFallback(kind);
  });
}

function isDisabledInteractive(element) {
  const disabledElement = element.closest?.("button:disabled, input:disabled, select:disabled, textarea:disabled, [aria-disabled='true']");
  return Boolean(disabledElement);
}

function getHapticTarget(event) {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const interactive = target.closest(
    "[data-haptic], button, a[href], input[type='button'], input[type='submit'], input[type='reset'], select, summary, [role='button']"
  );
  if (!interactive || isDisabledInteractive(interactive)) return null;
  return interactive;
}

function hapticKindForTarget(target) {
  const configured = target.closest("[data-haptic]")?.getAttribute("data-haptic");
  if (!configured || configured === "true") return "impact-light";
  if (configured === "none" || configured === "false") return null;
  return configured;
}

export function installGlobalHaptics() {
  if (typeof document === "undefined") return () => {};

  const onPointerUp = (event) => {
    if (event.button != null && event.button !== 0) return;
    const target = getHapticTarget(event);
    if (!target) return;
    const kind = hapticKindForTarget(target);
    if (kind) triggerHaptic(kind);
  };

  const onKeyboardClick = (event) => {
    if (event.detail !== 0) return;
    const target = getHapticTarget(event);
    if (!target) return;
    const kind = hapticKindForTarget(target);
    if (kind) triggerHaptic(kind);
  };

  document.addEventListener("pointerup", onPointerUp, true);
  document.addEventListener("click", onKeyboardClick, true);

  return () => {
    document.removeEventListener("pointerup", onPointerUp, true);
    document.removeEventListener("click", onKeyboardClick, true);
  };
}
