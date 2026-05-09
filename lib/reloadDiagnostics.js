const STORAGE_KEY = 'wg_reload_diagnostics_v1';
const MAX_EVENTS = 120;
const HEARTBEAT_MS = 2500;
const FULL_HEARTBEAT_EVERY = 4;

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (_) {
    return fallback;
  }
}

function readStore() {
  if (typeof window === 'undefined') return { events: [] };
  return safeJsonParse(window.localStorage?.getItem(STORAGE_KEY), { events: [] }) || { events: [] };
}

function writeStore(store) {
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (_) {}
}

function summarizePerformanceNavigation() {
  try {
    const nav = performance.getEntriesByType?.('navigation')?.[0];
    if (nav) {
      return {
        type: nav.type,
        startTime: Math.round(nav.startTime || 0),
        duration: Math.round(nav.duration || 0),
        transferSize: nav.transferSize,
        domComplete: Math.round(nav.domComplete || 0),
      };
    }

    return { legacyType: performance.navigation?.type };
  } catch (_) {
    return {};
  }
}

function getSnapshot() {
  if (typeof window === 'undefined') return {};
  return {
    href: window.location?.href,
    pathname: window.location?.pathname,
    visibilityState: document.visibilityState,
    hidden: document.hidden,
    gameScreen: window.screen,
    nextDataBuildId: window.__NEXT_DATA__?.buildId,
    nextPage: window.__NEXT_DATA__?.page,
  };
}

function getMemorySnapshot() {
  const memory = performance.memory;
  if (!memory) {
    return { jsMemory: 'unsupported' };
  }

  const bytesPerMB = 1024 * 1024;
  return {
    jsMemory: {
      usedJSHeapMB: Math.round(memory.usedJSHeapSize / bytesPerMB),
      totalJSHeapMB: Math.round(memory.totalJSHeapSize / bytesPerMB),
      jsHeapLimitMB: Math.round(memory.jsHeapSizeLimit / bytesPerMB),
    },
  };
}

function getPageWeightSnapshot() {
  const resources = performance.getEntriesByType?.('resource') || [];
  const iframes = [...document.querySelectorAll('iframe')].map((iframe) => ({
    id: iframe.id || '',
    className: String(iframe.className || '').slice(0, 120),
    src: iframe.src || iframe.getAttribute('src') || '',
    hidden: iframe.classList?.contains('hidden') || iframe.hidden || false,
    width: iframe.clientWidth,
    height: iframe.clientHeight,
  }));

  const resourcesByType = resources.reduce((acc, entry) => {
    const type = entry.initiatorType || 'unknown';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  return {
    ...getMemorySnapshot(),
    pageWeight: {
      domNodes: document.getElementsByTagName('*').length,
      iframes,
      resourceCount: resources.length,
      resourcesByType,
    },
  };
}

function createLogger(bootId) {
  return function logReloadDiagnostic(name, detail = {}) {
    if (typeof window === 'undefined') return;

    const event = {
      ts: new Date().toISOString(),
      ageMs: Math.round(performance.now?.() || 0),
      bootId,
      name,
      detail: {
        ...getSnapshot(),
        ...detail,
      },
    };

    const store = readStore();
    const events = Array.isArray(store.events) ? store.events : [];
    events.push(event);
    store.events = events.slice(-MAX_EVENTS);
    store.currentBoot = {
      ...(store.currentBoot || {}),
      bootId,
      lastSeenAt: event.ts,
      lastEvent: name,
      closedAt: ['beforeunload', 'pagehide', 'unload'].includes(name)
        ? event.ts
        : store.currentBoot?.closedAt,
      closeEvent: ['beforeunload', 'pagehide', 'unload'].includes(name)
        ? name
        : store.currentBoot?.closeEvent,
    };
    writeStore(store);

    try {
      console.info('[ReloadDiagnostics]', name, event.detail);
    } catch (_) {}
  };
}

export default function installReloadDiagnostics() {
  if (typeof window === 'undefined') return () => {};
  if (window.__wgReloadDiagnosticsInstalled) {
    return typeof window.__wgReloadDiagnosticsCleanup === 'function'
      ? window.__wgReloadDiagnosticsCleanup
      : () => {};
  }
  window.__wgReloadDiagnosticsInstalled = true;

  const bootId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const log = createLogger(bootId);
  let heartbeatCount = 0;
  const initialStore = readStore();
  const previousBoot = initialStore.currentBoot || null;

  initialStore.currentBoot = {
    bootId,
    startedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    lastEvent: 'install',
    closedAt: null,
    closeEvent: null,
  };
  writeStore(initialStore);

  window.__wgReloadDiagnostics = {
    bootId,
    log,
    read: readStore,
    print() {
      const store = readStore();
      console.table?.(store.events || []);
      return store;
    },
  };

  log('boot', {
    previousBoot,
    previousBootHadCleanClose: !!previousBoot?.closedAt,
    navigation: summarizePerformanceNavigation(),
    ...getPageWeightSnapshot(),
    userAgent: navigator.userAgent,
    capacitorPlatform: window.Capacitor?.getPlatform?.(),
    capacitorNative: !!window.Capacitor?.isNativePlatform?.(),
    referrer: document.referrer,
  });

  if (previousBoot && !previousBoot.closedAt) {
    log('previous_boot_unclean', { previousBoot });
  }

  const markCurrentBoot = (patch) => {
    const store = readStore();
    store.currentBoot = {
      ...(store.currentBoot || {}),
      bootId,
      ...patch,
    };
    writeStore(store);
  };

  const closeWith = (name, extra = {}) => {
    markCurrentBoot({ closedAt: new Date().toISOString(), closeEvent: name });
    log(name, extra);
  };

  const onBeforeUnload = () => closeWith('beforeunload');
  const onUnload = () => closeWith('unload');
  const onPageHide = (event) => closeWith('pagehide', { persisted: event.persisted });
  const onPageShow = (event) => log('pageshow', { persisted: event.persisted });
  const onVisibilityChange = () => log('visibilitychange');
  const onOnline = () => log('online');
  const onOffline = () => log('offline');
  const onFreeze = () => log('freeze');
  const onResume = () => log('resume');
  const onPopState = () => log('popstate');

  window.addEventListener('beforeunload', onBeforeUnload);
  window.addEventListener('unload', onUnload);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  window.addEventListener('popstate', onPopState);
  document.addEventListener('visibilitychange', onVisibilityChange);
  document.addEventListener('freeze', onFreeze);
  document.addEventListener('resume', onResume);

  const heartbeatId = window.setInterval(() => {
    heartbeatCount += 1;
    const fullSnapshot = heartbeatCount % FULL_HEARTBEAT_EVERY === 0
      ? getPageWeightSnapshot()
      : getMemorySnapshot();
    markCurrentBoot({
      lastSeenAt: new Date().toISOString(),
      lastHeartbeatAgeMs: Math.round(performance.now?.() || 0),
      visibilityState: document.visibilityState,
      href: window.location?.href,
      ...fullSnapshot,
    });
  }, HEARTBEAT_MS);

  const cleanup = () => {
    window.clearInterval(heartbeatId);
    window.removeEventListener('beforeunload', onBeforeUnload);
    window.removeEventListener('unload', onUnload);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    window.removeEventListener('popstate', onPopState);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    document.removeEventListener('freeze', onFreeze);
    document.removeEventListener('resume', onResume);
    if (window.__wgReloadDiagnosticsCleanup === cleanup) {
      window.__wgReloadDiagnosticsInstalled = false;
      delete window.__wgReloadDiagnosticsCleanup;
    }
  };

  window.__wgReloadDiagnosticsCleanup = cleanup;
  return cleanup;
}
