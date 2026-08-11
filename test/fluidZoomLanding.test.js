import { describe, expect, it, vi } from 'vitest';

/**
 * Fluid wheel zoom: what happens when a wheel glide is INTERRUPTED.
 *
 * Two failure modes, both reported by the user, both now covered here:
 *  1. Freezing at the fractional zoom the glide was passing through (e.g.
 *     3.62). The tile level then rests CSS-scaled by 2^0.38, so labels render
 *     below their designed size and every tile edge sits on a fractional pixel
 *     — "it should finish the zoom anim so fonts aren't messed up".
 *  2. Teleporting to the goal in one frame — correct resting state, but the
 *     user sees a hard snap the instant they press the mouse: "it snaps to
 *     correct level which looks bad. make it smooth".
 *
 * Resolution: a press-to-pan YIELDS the camera (glide keeps running to its
 * already-integer goal alongside the pan, re-anchored to the live camera each
 * frame); only a hard settle requirement LANDS it. Both must end at an integer.
 *
 * The suite runs without jsdom, so this exercises the handler's decision logic
 * against a minimal map/handler stub rather than a live Leaflet map. The wiring
 * that reaches it (L.Map.prototype._stop) is asserted structurally.
 */

// Mirrors the real handler's interrupt contract (see land() / _abort() in
// lib/leafletFluidZoom.js). Kept deliberately small: the glide math itself is
// covered by _glideState's own closed form, not re-implemented here.
function makeGesture({ zoom, segGoal }) {
  const map = {
    _zoom: zoom,
    moveEnds: 0,
    moves: [],
    getZoom() { return this._zoom; },
    _move(center, z) { this._zoom = z; this.moves.push(z); },
    _moveEnd() { this.moveEnds += 1; },
  };

  const gesture = {
    _map: map,
    _isWheeling: true,
    _yielded: false,
    _moved: true,
    _landing: false,
    _segGoal: segGoal,
    _preparedTileGoal: segGoal,
    _timeoutId: null,
    _zoomAnimationId: null,
    reanchors: 0,
    _centerAtZoom: () => ({ lat: 0, lng: 0 }),
    _reanchorToLiveCamera() { this.reanchors += 1; },

    _finish() {
      if (this._yielded) this._reanchorToLiveCamera();
      this._isWheeling = false;
      this._yielded = false;
      if (this._moved && this._map.getZoom() !== this._segGoal) {
        this._map._move(this._centerAtZoom(this._segGoal), this._segGoal);
      }
      this._map._moveEnd(true);
    },

    _abort() {
      if (!this._isWheeling) return;
      this._isWheeling = false;
      this._yielded = false;
      this._preparedTileGoal = null;
      if (this._moved) {
        this._moved = false;
        this._map._moveEnd(true);
      }
    },

    yieldCamera() {
      if (!this._isWheeling || this._yielded) return;
      this._yielded = true;
    },

    land() {
      if (!this._isWheeling) return;
      if (this._landing) return;
      this._landing = true;
      try {
        this._finish();
      } catch {
        this._abort();
      } finally {
        this._landing = false;
      }
    },

    // Mirrors _updateWheelZoom's guard + glide write, minus the Leaflet calls.
    tickAt(glideZoom, externallyMoved) {
      if (!this._yielded && externallyMoved) {
        this._abort();
        return;
      }
      if (glideZoom !== this._map.getZoom()) {
        if (this._yielded) this._reanchorToLiveCamera();
        this._map._move(this._centerAtZoom(glideZoom), glideZoom);
      }
    },
  };

  return { map, gesture };
}

describe('fluid wheel zoom — interrupted mid-glide', () => {
  it('lands on the integer goal instead of freezing at a fraction', () => {
    // Mid-glide from 3 toward 4, currently passing through 3.62.
    const { map, gesture } = makeGesture({ zoom: 3.62, segGoal: 4 });

    gesture.land();

    expect(map.getZoom()).toBe(4);
    expect(Number.isInteger(map.getZoom())).toBe(true);
    expect(gesture._isWheeling).toBe(false);
  });

  it('lands EXACTLY on the goal — no residual fraction to CSS-scale tiles', () => {
    // 0.002 is the idle poller's acceptance window; resting there still scales
    // the level, which is the whole point of the exact final _move.
    const { map, gesture } = makeGesture({ zoom: 4 - 0.0015, segGoal: 4 });

    gesture.land();

    expect(map.getZoom()).toBe(4);
    expect(map.getZoom() - 4).toBe(0);
  });

  it('lands zoom-OUT glides on their integer goal too', () => {
    const { map, gesture } = makeGesture({ zoom: 5.4, segGoal: 5 });

    gesture.land();

    expect(map.getZoom()).toBe(5);
  });

  it('is a no-op when no gesture is in flight', () => {
    const { map, gesture } = makeGesture({ zoom: 3.62, segGoal: 4 });
    gesture._isWheeling = false;

    gesture.land();

    expect(map.getZoom()).toBe(3.62);
    expect(map.moveEnds).toBe(0);
  });

  it('is idempotent: a second land() does not re-fire moveEnd', () => {
    const { map, gesture } = makeGesture({ zoom: 3.62, segGoal: 4 });

    gesture.land();
    gesture.land();

    expect(map.moveEnds).toBe(1);
    expect(map.moves).toEqual([4]);
  });

  it('survives re-entrancy: a listener calling back in cannot double-land', () => {
    // The real hazard: _finish fires moveend, a maxBounds listener calls
    // map._stop(), which re-enters land() before _isWheeling is cleared.
    const { map, gesture } = makeGesture({ zoom: 3.62, segGoal: 4 });
    let reentered = 0;
    const origMoveEnd = map._moveEnd.bind(map);
    map._moveEnd = () => {
      origMoveEnd();
      if (reentered === 0) {
        reentered += 1;
        gesture.land(); // re-entrant call from inside _finish
      }
    };

    gesture.land();

    expect(map.getZoom()).toBe(4);
    expect(map.moveEnds).toBe(1);
    expect(gesture._landing).toBe(false);
  });

  it('falls back to abort (never stays latched) when landing throws', () => {
    const { map, gesture } = makeGesture({ zoom: 3.62, segGoal: 4 });
    gesture._centerAtZoom = () => { throw new Error('projection died'); };

    gesture.land();

    // Zoom is wherever it was — but the gesture MUST be unlatched, or every
    // later wheel event feeds a goal nobody consumes (zoom dead for the round).
    expect(gesture._isWheeling).toBe(false);
    expect(gesture._landing).toBe(false);
  });

  it('abort (external camera owner) still leaves the zoom untouched', () => {
    // Kept as a contract test: abort is for when something ELSE owns the
    // camera, so it deliberately does not move the zoom. land() is what user
    // interrupts must use.
    const { map, gesture } = makeGesture({ zoom: 3.62, segGoal: 4 });

    gesture._abort();

    expect(map.getZoom()).toBe(3.62);
    expect(gesture._isWheeling).toBe(false);
  });
});

describe('fluid wheel zoom — yielding to a drag (smooth, no snap)', () => {
  it('does NOT move the zoom at the moment of the interrupt', () => {
    // The whole point: pressing the mouse must not visibly change the zoom.
    const { map, gesture } = makeGesture({ zoom: 3.62, segGoal: 4 });

    gesture.yieldCamera();

    expect(map.getZoom()).toBe(3.62);
    expect(map.moves).toEqual([]);
    expect(map.moveEnds).toBe(0);
    // Gesture stays alive so the glide can finish on its own schedule.
    expect(gesture._isWheeling).toBe(true);
  });

  it('keeps gliding after yielding, and still ends on the integer goal', () => {
    const { map, gesture } = makeGesture({ zoom: 3.62, segGoal: 4 });

    gesture.yieldCamera();
    // Frames continue while the drag pans the map underneath.
    gesture.tickAt(3.8, true);
    gesture.tickAt(3.95, true);
    gesture.tickAt(4, true);

    expect(map.moves).toEqual([3.8, 3.95, 4]);
    expect(map.getZoom()).toBe(4);
  });

  it('suspends the abort guard so a concurrent drag cannot freeze the zoom', () => {
    const { map, gesture } = makeGesture({ zoom: 3.62, segGoal: 4 });

    gesture.yieldCamera();
    gesture.tickAt(3.8, /* externallyMoved */ true);

    // Pre-fix this aborted at 3.62 — the original bug.
    expect(gesture._isWheeling).toBe(true);
    expect(map.getZoom()).toBe(3.8);
  });

  it('still aborts on an external camera write when NOT yielded', () => {
    // The guard must keep protecting against unknown owners (setView, an
    // invalidateSize-driven jump) — yielding is opt-in per interrupt.
    const { map, gesture } = makeGesture({ zoom: 3.62, segGoal: 4 });

    gesture.tickAt(3.8, /* externallyMoved */ true);

    expect(gesture._isWheeling).toBe(false);
    expect(map.getZoom()).toBe(3.62);
  });

  it('re-anchors to the live camera on every yielded frame', () => {
    // Without this the zoom pivots on a pre-drag anchor and fights the pan.
    const { gesture } = makeGesture({ zoom: 3.62, segGoal: 4 });

    gesture.yieldCamera();
    gesture.tickAt(3.8, true);
    gesture.tickAt(3.9, true);

    expect(gesture.reanchors).toBe(2);
  });

  it('does not re-anchor when not yielded (cursor anchor is authoritative)', () => {
    const { gesture } = makeGesture({ zoom: 3.62, segGoal: 4 });

    gesture.tickAt(3.8, false);

    expect(gesture.reanchors).toBe(0);
  });

  it('re-anchors before committing, so the commit cannot jerk the map', () => {
    const { map, gesture } = makeGesture({ zoom: 4 - 0.0015, segGoal: 4 });

    gesture.yieldCamera();
    gesture._finish(); // what the idle poller calls once converged

    expect(gesture.reanchors).toBe(1);
    expect(map.getZoom()).toBe(4);
  });

  it('yield is idempotent and a no-op once the gesture is over', () => {
    const { gesture } = makeGesture({ zoom: 3.62, segGoal: 4 });

    gesture.yieldCamera();
    gesture.yieldCamera();
    expect(gesture._yielded).toBe(true);

    gesture._finish();
    expect(gesture._yielded).toBe(false);
    gesture.yieldCamera();
    expect(gesture._yielded).toBe(false);
  });

  it('clears the yield latch on abort so the next gesture starts policed', () => {
    const { gesture } = makeGesture({ zoom: 3.62, segGoal: 4 });

    gesture.yieldCamera();
    gesture._abort();

    expect(gesture._yielded).toBe(false);
  });
});

describe('fluid wheel zoom — module wiring', () => {
  it('hooks Map._stop so every motion starter reaches the handler', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync('lib/leafletFluidZoom.js', 'utf8'));

    // The seam: Map.Drag._onDragStart -> map._stop() is what a press-to-pan
    // hits, so the handoff must be installed there and not only on wheel idle.
    expect(src).toMatch(/L\.Map\.prototype\._stop\s*=/);
    expect(src).toMatch(/fluidWheelZoom/);
    // Guarded so repeated imports don't stack wrappers.
    expect(src).toMatch(/_landsFluidZoom/);
  });

  it('routes an active drag to yieldCamera and everything else to land', () => {
    const src = require('node:fs').readFileSync('lib/leafletFluidZoom.js', 'utf8');
    const stopHook = src.slice(src.indexOf('_landsFluidZoom'));

    // The discriminator must be a live-drag check, not a guess.
    expect(stopHook).toMatch(/L\.Draggable\?\._dragging/);
    expect(stopHook).toMatch(/if \(dragging\) handler\.yieldCamera\(\)/);
    expect(stopHook).toMatch(/else handler\.land\(\)/);
    // Never abort from the _stop seam — that is the fractional-freeze bug.
    expect(stopHook).not.toMatch(/_abort\(\)/);
  });

  it('suspends the external-write abort guard while yielded', () => {
    const src = require('node:fs').readFileSync('lib/leafletFluidZoom.js', 'utf8');
    // The guard must test _yielded, or a drag trips it and freezes the zoom.
    expect(src).toMatch(/if \(!this\._yielded\s*\n?\s*&&\s*\(!map\.getCenter\(\)/);
  });
});
