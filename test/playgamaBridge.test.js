import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const { duckAudio } = vi.hoisted(() => ({ duckAudio: vi.fn() }));
vi.mock('../components/utils/audio', () => ({ duckAudio }));

function emitter() {
  const listeners = new Map();
  return {
    on: vi.fn((event, callback) => listeners.set(event, callback)),
    emit: (event, value) => listeners.get(event)?.(value),
  };
}

let glue, bridge, scripts, doc, win;
beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubEnv('NEXT_PUBLIC_6X', 'true');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  duckAudio.mockClear();
  scripts = [];
  doc = Object.assign(new EventTarget(), {
    visibilityState: 'visible', activeElement: null, hasFocus: () => true,
    createElement: () => ({ remove: vi.fn() }),
    body: { appendChild: (script) => scripts.push(script) },
  });
  win = new EventTarget();
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', win);
  bridge = {
    initialize: vi.fn(async () => {}),
    EVENT_NAME: { INTERSTITIAL_STATE_CHANGED: 'ad', BANNER_STATE_CHANGED: 'banner', PAUSE_STATE_CHANGED: 'pause', AUDIO_STATE_CHANGED: 'audio' },
    platform: { ...emitter(), id: 'playgama', isAudioEnabled: true, isPaused: false, sendMessage: vi.fn(async () => {}) },
    advertisement: { ...emitter(), isInterstitialSupported: true, isBannerSupported: true,
      interstitialState: 'closed', showInterstitial: vi.fn(), setMinimumDelayBetweenInterstitial: vi.fn(), showBanner: vi.fn(), hideBanner: vi.fn() },
  };
  win.bridge = bridge;
  glue = await import('../components/utils/playgamaBridge');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
async function initialize() {
  const ready = glue.loadPlaygamaBridge();
  scripts.at(-1).onload();
  await ready;
}
function ad(state) {
  bridge.advertisement.interstitialState = state;
  bridge.advertisement.emit('ad', state);
}

describe('Playgama initialization and platform state', () => {
  it('injects once and waits for initialize before any platform API', async () => {
    let resolve;
    bridge.initialize.mockImplementation(() => new Promise((yes) => { resolve = yes; }));
    glue.sendPlaygamaGameReady();
    glue.setPlaygamaBanner('bottom');
    const first = glue.loadPlaygamaBridge();
    expect(glue.loadPlaygamaBridge()).toBe(first);
    expect(scripts).toHaveLength(1);
    scripts[0].onload();
    expect(bridge.platform.sendMessage).not.toHaveBeenCalled();
    expect(bridge.advertisement.showBanner).not.toHaveBeenCalled();
    resolve(); await first;
    expect(bridge.platform.sendMessage).toHaveBeenCalledExactlyOnceWith('game_ready');
    expect(bridge.advertisement.showBanner).toHaveBeenCalledWith('bottom');
    glue.sendPlaygamaGameReady();
    expect(bridge.platform.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('re-injects the script only when it never loaded', async () => {
    const first = glue.loadPlaygamaBridge();
    scripts[0].onerror(new Error('offline'));
    expect(await first).toBeNull();
    await initialize();
    expect(scripts).toHaveLength(2);
  });

  it('retries a rejected initialize() on the loaded SDK without a second script tag', async () => {
    const first = glue.loadPlaygamaBridge();
    bridge.initialize.mockRejectedValueOnce(new Error('offline'));
    scripts[0].onload();
    expect(await first).toBeNull();
    expect(await glue.loadPlaygamaBridge()).toBe(bridge);
    expect(scripts).toHaveLength(1);
    expect(bridge.initialize).toHaveBeenCalledTimes(2);
  });

  it('bounds the queue of lifecycle messages sent before game_ready', async () => {
    await initialize();
    for (let i = 0; i < 40; i++) glue.sendPlaygamaMessage('level_started', { world: 'tutorial', level: String(i) });
    glue.sendPlaygamaGameReady();
    expect(bridge.platform.sendMessage).toHaveBeenCalledTimes(1 + 32);
    expect(bridge.platform.sendMessage.mock.calls[1][1].level).toBe('8');
  });

  it('sends game_ready before lifecycle events from earlier child mount effects', async () => {
    await initialize();
    glue.sendPlaygamaMessage('level_started', { world: 'tutorial', level: '1' });
    expect(bridge.platform.sendMessage).not.toHaveBeenCalled();
    glue.sendPlaygamaGameReady();
    expect(bridge.platform.sendMessage.mock.calls).toEqual([
      ['game_ready'], ['level_started', { world: 'tutorial', level: '1' }],
    ]);
  });

  it('applies initial mute, pause and already-open ad states', async () => {
    bridge.platform.isAudioEnabled = false;
    bridge.platform.isPaused = true;
    bridge.advertisement.interstitialState = 'opened';
    await initialize();
    expect(duckAudio).toHaveBeenLastCalledWith(true);
    expect(glue.getPlaygamaPaused()).toBe(true);
  });

  it('releases a startup "opened" state that never closes, like any other stuck ad', async () => {
    bridge.advertisement.interstitialState = 'opened';
    await initialize();
    expect(glue.getPlaygamaPaused()).toBe(true);
    vi.advanceTimersByTime(120000);
    expect(glue.getPlaygamaPaused()).toBe(false);
  });

  it('honors host mute and pause while visible, independently of each other', async () => {
    await initialize();
    bridge.platform.emit('audio', false);
    vi.advanceTimersByTime(0);
    expect(duckAudio).toHaveBeenLastCalledWith(true);
    expect(glue.getPlaygamaPaused()).toBe(false);
    bridge.platform.emit('pause', true);
    vi.advanceTimersByTime(0);
    expect(glue.getPlaygamaPaused()).toBe(true);
    bridge.platform.emit('pause', false);
    vi.advanceTimersByTime(0);
    expect(glue.getPlaygamaPaused()).toBe(false);
    expect(duckAudio).toHaveBeenLastCalledWith(true);
    bridge.platform.emit('audio', true);
    vi.advanceTimersByTime(0);
    expect(duckAudio).toHaveBeenLastCalledWith(false);
  });

  it.each([
    ['panorama', 'streetview', true, 'visible', true],
    ['ad iframe', 'ad-video', true, 'visible', false],
    ['another app', 'streetview', false, 'visible', false],
    ['hidden tab', 'streetview', false, 'hidden', false],
  ])('corrects only real panorama focus: %s', async (_, id, focused, visibility, expected) => {
    await initialize();
    doc.activeElement = { tagName: 'IFRAME', id };
    doc.hasFocus = () => focused;
    doc.visibilityState = visibility;
    const event = vi.fn();
    doc.addEventListener('visibilitychange', event);
    win.dispatchEvent(new Event('blur'));
    vi.advanceTimersByTime(0);
    expect(event).toHaveBeenCalledTimes(expected ? 1 : 0);
  });

  it.each([
    ['panorama focused', { tagName: 'IFRAME', id: 'streetview' }, 1],
    ['nothing focused', null, 0],
  ])('replays panorama focus visibility from the SDK pause event too: %s', async (_, active, expected) => {
    await initialize();
    doc.activeElement = active;
    const event = vi.fn();
    doc.addEventListener('visibilitychange', event);
    bridge.platform.emit('pause', true);
    vi.advanceTimersByTime(0);
    expect(event).toHaveBeenCalledTimes(expected);
  });

  it('honors a pause the SDK clears on the replay, without the safety net', async () => {
    await initialize();
    doc.activeElement = { tagName: 'IFRAME', id: 'streetview' };
    doc.addEventListener('visibilitychange', () => bridge.platform.emit('pause', false));
    bridge.platform.emit('pause', true);
    vi.advanceTimersByTime(5);
    expect(glue.getPlaygamaPaused()).toBe(false);
    expect(console.warn).not.toHaveBeenCalledWith(expect.stringContaining('ignoring'));
  });

  it('ignores a blur pause the SDK keeps while our panorama holds focus and no ad is open', async () => {
    await initialize();
    doc.activeElement = { tagName: 'IFRAME', id: 'streetview' };
    bridge.platform.emit('pause', true);
    vi.advanceTimersByTime(5);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('ignoring'));
    expect(glue.getPlaygamaPaused()).toBe(false);
    expect(duckAudio).toHaveBeenLastCalledWith(false);
    // The next real pause event is honored again.
    doc.activeElement = null;
    bridge.platform.emit('pause', false);
    bridge.platform.emit('pause', true);
    vi.advanceTimersByTime(5);
    expect(glue.getPlaygamaPaused()).toBe(true);
  });

  it('never ignores a pause while an ad is on screen, even with the panorama focused', async () => {
    await initialize();
    doc.activeElement = { tagName: 'IFRAME', id: 'streetview' };
    glue.showPlaygamaInterstitial(() => {});
    ad('opened');
    bridge.platform.emit('pause', true);
    vi.advanceTimersByTime(5);
    expect(glue.getPlaygamaPaused()).toBe(true);
    expect(console.warn).not.toHaveBeenCalledWith(expect.stringContaining('ignoring'));
  });

  it('notifies ready subscribers after initialize, and late subscribers immediately', async () => {
    const early = vi.fn();
    const unsubscribe = glue.subscribePlaygamaReady(early);
    expect(early).not.toHaveBeenCalled();
    await initialize();
    expect(early).toHaveBeenCalledExactlyOnceWith(bridge);
    const late = vi.fn();
    glue.subscribePlaygamaReady(late);
    expect(late).toHaveBeenCalledExactlyOnceWith(bridge);
    unsubscribe();
  });

  it('keeps a hidden document paused even if the platform emits resume', async () => {
    await initialize();
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    bridge.platform.emit('pause', false);
    bridge.platform.emit('audio', true);
    vi.advanceTimersByTime(0);
    expect(glue.getPlaygamaPaused()).toBe(true);
    expect(duckAudio).toHaveBeenLastCalledWith(true);
  });

  it('hides a banner that finishes loading after its menu unmounts', async () => {
    await initialize();
    glue.setPlaygamaBanner('bottom');
    glue.setPlaygamaBanner(null);
    bridge.advertisement.hideBanner.mockClear();
    bridge.advertisement.emit('banner', 'shown');
    expect(bridge.advertisement.hideBanner).toHaveBeenCalledOnce();
  });
});

describe('Playgama ad completion', () => {
  it('resumes immediately when absent or unsupported', async () => {
    const finish = vi.fn();
    glue.showPlaygamaInterstitial(finish);
    expect(finish).toHaveBeenCalledOnce();
    await initialize();
    bridge.advertisement.isInterstitialSupported = false;
    glue.showPlaygamaInterstitial(finish);
    expect(finish).toHaveBeenCalledTimes(2);
    expect(bridge.advertisement.showInterstitial).not.toHaveBeenCalled();
  });

  it('joins duplicate requests and runs each callback even when the first throws', async () => {
    await initialize();
    const first = vi.fn(() => { throw new Error('callback'); });
    const second = vi.fn();
    glue.showPlaygamaInterstitial(first);
    glue.showPlaygamaInterstitial(second);
    ad('opened');
    expect(bridge.advertisement.showInterstitial).toHaveBeenCalledOnce();
    ad('closed'); ad('closed');
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it('waits for platform resume AFTER closed, then compensates timers before advancing', async () => {
    await initialize();
    const events = [];
    glue.subscribePlaygamaPause(() => { if (!glue.getPlaygamaPaused()) events.push('resume clocks'); });
    glue.showPlaygamaInterstitial(() => events.push('advance'));
    ad('opened');
    bridge.platform.emit('pause', true);
    bridge.platform.emit('audio', false);
    vi.advanceTimersByTime(0);
    ad('closed');
    expect(events).toEqual([]);
    bridge.platform.emit('pause', false);
    bridge.platform.emit('audio', true);
    vi.advanceTimersByTime(0);
    expect(events).toEqual(['resume clocks', 'advance']);
  });

  it('requests the configured placement id', async () => {
    await initialize();
    glue.showPlaygamaInterstitial(() => {});
    expect(bridge.advertisement.showInterstitial).toHaveBeenCalledWith(glue.INTERSTITIAL_PLACEMENT);
    expect(glue.INTERSTITIAL_PLACEMENT).toBe('round_end');
  });

  it('keeps a long opened video paused, then closes normally', async () => {
    await initialize();
    const finish = vi.fn();
    glue.showPlaygamaInterstitial(finish);
    ad('opened');
    vi.advanceTimersByTime(100000);
    expect(finish).not.toHaveBeenCalled();
    expect(glue.getPlaygamaPaused()).toBe(true);
    ad('closed');
    expect(finish).toHaveBeenCalledOnce();
    expect(glue.getPlaygamaPaused()).toBe(false);
  });

  it('releases an opened ad that never reports a terminal event after 120 seconds', async () => {
    await initialize();
    const finish = vi.fn();
    glue.showPlaygamaInterstitial(finish);
    ad('opened');
    vi.advanceTimersByTime(119999);
    expect(finish).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('never closed'));
    expect(finish).toHaveBeenCalledOnce();
    expect(glue.getPlaygamaPaused()).toBe(false);
    ad('closed');
    expect(finish).toHaveBeenCalledOnce();
  });

  it('skips the ad when the state reads "opened" but no ad was ever seen opening', async () => {
    await initialize();
    bridge.advertisement.interstitialState = 'opened';
    const finish = vi.fn();
    glue.showPlaygamaInterstitial(finish);
    expect(finish).toHaveBeenCalledOnce();
    expect(bridge.advertisement.showInterstitial).not.toHaveBeenCalled();
    expect(glue.getPlaygamaPaused()).toBe(false);
  });

  it('does not stall later rounds behind a state stuck on "opened" after the release', async () => {
    await initialize();
    const first = vi.fn(), second = vi.fn();
    glue.showPlaygamaInterstitial(first);
    ad('opened');
    vi.advanceTimersByTime(120000);
    expect(first).toHaveBeenCalledOnce();
    glue.showPlaygamaInterstitial(second);
    expect(second).toHaveBeenCalledOnce();
    expect(glue.getPlaygamaPaused()).toBe(false);
  });

  it('keeps honoring the platform pause after the stuck-ad release', async () => {
    await initialize();
    const finish = vi.fn();
    glue.showPlaygamaInterstitial(finish);
    ad('opened');
    bridge.platform.emit('pause', true);
    vi.advanceTimersByTime(120000);
    expect(finish).not.toHaveBeenCalled();
    expect(glue.getPlaygamaPaused()).toBe(true);
    bridge.platform.emit('pause', false);
    vi.advanceTimersByTime(0);
    expect(finish).toHaveBeenCalledOnce();
    expect(glue.getPlaygamaPaused()).toBe(false);
  });

  it('survives a throwing interstitialState getter inside the start timeout', async () => {
    await initialize();
    const finish = vi.fn();
    glue.showPlaygamaInterstitial(finish);
    Object.defineProperty(bridge.advertisement, 'interstitialState', { configurable: true, get() { throw new Error('adapter gone'); } });
    expect(() => vi.advanceTimersByTime(15000)).not.toThrow();
    expect(finish).toHaveBeenCalledOnce();
    expect(glue.getPlaygamaPaused()).toBe(false);
  });

  it('recovers failed starts once and pauses again if the ad subsequently opens late', async () => {
    await initialize();
    const first = vi.fn(), second = vi.fn();
    glue.showPlaygamaInterstitial(first);
    ad('loading');
    vi.advanceTimersByTime(15000);
    expect(first).toHaveBeenCalledOnce();
    ad('opened');
    glue.showPlaygamaInterstitial(second);
    expect(second).not.toHaveBeenCalled();
    expect(glue.getPlaygamaPaused()).toBe(true);
    ad('closed');
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it.each(['failed', 'throw', 'rejection'])('recovers a %s without the startup timeout', async (failure) => {
    await initialize();
    bridge.advertisement.showInterstitial.mockImplementation(() => {
      if (failure === 'throw') throw new Error('no fill');
      if (failure === 'rejection') return Promise.reject(new Error('no fill'));
      ad('failed');
    });
    const finish = vi.fn();
    glue.showPlaygamaInterstitial(finish);
    await Promise.resolve();
    expect(finish).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(20000);
    expect(finish).toHaveBeenCalledOnce();
    expect(glue.getPlaygamaPaused()).toBe(false);
  });
});
