import { describe, it, expect, vi } from 'vitest';
import { safeInterval, guardedStep } from '../ws/safeTimers.js';

// WHAT THESE TESTS ARE PROTECTING
// -------------------------------
// ws/ws.js installs process.on('uncaughtException') -> process.exit(1), and the
// ws process holds every live duel in memory. So a throw inside a timer callback
// is not a logged warning, it is "every connected player loses their game".
//
// Before this module, none of the six setInterval callbacks in ws.js had a
// single try block, including the 500ms queue tick that walks every queued
// player, every live game and every disconnected player on each pass.
//
// The contract under test is therefore blunt: a throwing callback must NOT
// propagate, and the timer must keep firing afterwards. A "swallow" that also
// killed the timer would be just as bad, because matchmaking would silently stop.

/** Drive a fake timer by hand so nothing here depends on real wall-clock time. */
function fakeTimer() {
  const registered = [];
  const setIntervalFake = (fn, ms) => {
    registered.push({ fn, ms });
    return registered.length; // stand-in for a Timeout handle
  };
  return {
    setInterval: setIntervalFake,
    tick(times = 1) {
      for (let i = 0; i < times; i++) for (const r of registered) r.fn();
    },
    get periods() { return registered.map((r) => r.ms); },
  };
}

describe('safeInterval', () => {
  it('swallows a throwing callback instead of letting it reach uncaughtException', () => {
    const t = fakeTimer();
    const errors = [];
    safeInterval('boom', 500, () => { throw new Error('kaboom'); },
      { setInterval: t.setInterval, onError: (label, e) => errors.push([label, e.message]) });

    // The assertion IS "this line does not throw".
    expect(() => t.tick()).not.toThrow();
    expect(errors).toEqual([['boom', 'kaboom']]);
  });

  it('KEEPS FIRING after a throw — a swallowed error must not silently stop matchmaking', () => {
    const t = fakeTimer();
    let ran = 0;
    safeInterval('queue', 500, () => { ran++; throw new Error('every time'); },
      { setInterval: t.setInterval, onError: () => {} });

    t.tick(5);
    expect(ran).toBe(5);
  });

  it('runs a healthy callback untouched and passes the period through', () => {
    const t = fakeTimer();
    let ran = 0;
    safeInterval('fine', 5000, () => { ran++; }, { setInterval: t.setInterval });

    t.tick(3);
    expect(ran).toBe(3);
    expect(t.periods).toEqual([5000]);
  });

  it('survives an onError that itself throws — the last line of defence cannot be the crash', () => {
    const t = fakeTimer();
    safeInterval('nested', 500, () => { throw new Error('inner'); }, {
      setInterval: t.setInterval,
      onError: () => { throw new Error('the logger is broken too'); },
    });

    expect(() => t.tick()).not.toThrow();
  });

  it('catches an ASYNC callback rejection, which a plain try/catch never would', async () => {
    const t = fakeTimer();
    const errors = [];
    safeInterval('asyncBoom', 500, async () => { throw new Error('rejected'); },
      { setInterval: t.setInterval, onError: (label, e) => errors.push([label, e.message]) });

    t.tick();
    await Promise.resolve(); // let the rejection settle
    await Promise.resolve();
    expect(errors).toEqual([['asyncBoom', 'rejected']]);
  });

  it('catches a rejecting thenable that is not a real Promise (mongoose queries)', async () => {
    const t = fakeTimer();
    const errors = [];
    const fakeQuery = {
      then: () => fakeQuery,
      catch: (cb) => { cb(new Error('db down')); return fakeQuery; },
    };
    safeInterval('query', 500, () => fakeQuery,
      { setInterval: t.setInterval, onError: (label, e) => errors.push([label, e.message]) });

    t.tick();
    expect(errors).toEqual([['query', 'db down']]);
  });

  it('leaves a resolving async callback alone', async () => {
    const t = fakeTimer();
    const errors = [];
    let ran = 0;
    safeInterval('asyncOk', 500, async () => { ran++; },
      { setInterval: t.setInterval, onError: (l, e) => errors.push([l, e.message]) });

    t.tick(2);
    await Promise.resolve();
    expect(ran).toBe(2);
    expect(errors).toEqual([]);
  });

  it('returns the underlying timer handle so callers can still clear it', () => {
    const handle = safeInterval('x', 10, () => {}, { setInterval: () => 'HANDLE' });
    expect(handle).toBe('HANDLE');
  });

  it('defaults to the real setInterval when no seam is injected', () => {
    vi.useFakeTimers();
    let ran = 0;
    const handle = safeInterval('real', 100, () => { ran++; throw new Error('x'); },
      { onError: () => {} });
    vi.advanceTimersByTime(350);
    clearInterval(handle);
    expect(ran).toBe(3);
    vi.useRealTimers();
  });
});

describe('guardedStep', () => {
  it('reports success and failure so a caller can count skipped items', () => {
    expect(guardedStep('ok', () => {})).toBe(true);
    expect(guardedStep('bad', () => { throw new Error('nope'); }, { onError: () => {} })).toBe(false);
  });

  it('isolates one bad item: the loop it guards still visits every other item', () => {
    const served = [];
    for (const id of ['a', 'poison', 'b', 'c']) {
      guardedStep('serve', () => {
        if (id === 'poison') throw new Error('bad player state');
        served.push(id);
      }, { onError: () => {} });
    }
    // The whole point: 'b' and 'c' are served even though 'poison' blew up.
    expect(served).toEqual(['a', 'b', 'c']);
  });
});
