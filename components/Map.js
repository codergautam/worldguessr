import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from "react";
import dynamic from "next/dynamic";
import { Circle, Marker, Polyline, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { useTranslation } from '@/components/useTranslations';
import { getPinIcons, markerSkinIconKey, MARKER_SKIN_ICONS } from '@/lib/markerIcons';
import calcPoints, { findDistance, pickBestTeamGuessIds } from './calcPoints';
import 'leaflet/dist/leaflet.css';
import guestNameString from "@/serverUtils/guestNameFromString";
import CountryFlag from './utils/countryFlag';
import { cachedNameGlowProps, GLOW_LIGHT } from './utils/usernameWithFlag';
import { guessPinLabelNode } from './utils/guessPinLabel';
import SafeMapContainer from './SafeMapContainer';
import getMyTeam from './utils/getMyTeam';
import { playSfx, preloadSfx } from './utils/audio';
import { flyToBoundsAtWholeZoom, getWholeZoomBoundsTarget } from '@/lib/leafletWholeZoom';
import { googleTileScale } from '@/lib/googleTileScale';

/* ---------------------------------------------------------------------------
 *  Constants
 * ------------------------------------------------------------------------ */

const EARTH_RADIUS_M = 6371000;
// Matches the legacy CircleMarker visual size (75px at world mode) converted
// to meters. The old behavior implicitly scaled by cos(latitude) due to the
// WebMercator projection — preserved below.
const OLD_BASE_HINT_RADIUS_M_AT_EQUATOR = 5870363.8;

// Wrap a longitude into [-180, 180]. Used so a click on a repeated tile copy
// produces a pin at the canonical equivalent location.
const normalizeLng = (lng) => ((((lng + 180) % 360) + 360) % 360) - 180;

// Vertical-only pan clamp. +/-85.05deg is Web Mercator's natural clip -
// beyond that no tiles exist. The horizontal bound is large enough to be a
// no-op at any reasonable zoom (user can pan freely east/west through wrap
// copies). Disabled while the answer is shown.
const VIEW_BOUNDS = [[-85.05, -1e6], [85.05, 1e6]];

// Reveal animation timings (ms). Mirrors prior behavior.
const REVEAL = {
  desktopDelayMs: 200,
  mobileDelayMs: 120,
  pinDelayDesktopMs: 300,
  pinDelayMobileMs: 180,
  // Hard cap on the resize phase. The CSS transition on #miniMapArea is
  // 300ms; 320ms gives a safety margin for slow frames.
  resizeCapMs: 320,
  flyDurations: { pin: 0.5, country: 1.2, world: 1.8 }, // seconds (Leaflet)
};

// Seconds. Pairs with #miniMapArea.revealExiting's transition — the camera
// flight out of an answer reveal and the container shrink land together.
// 400ms (was 250): a z10→z2 zoom-out at 250ms reads as a snap; the longer
// window lets Leaflet's ease-out breathe without feeling sluggish.
const SMOOTH_RESET_FLY_SEC = 0.4;

const MOBILE_MEDIA_QUERY = "(max-width: 600px)";
const EXTENT_FIT_PADDING = [12, 12];
const MIN_EXTENT_SPAN_DEGREES = 0.0001;

/* ---------------------------------------------------------------------------
 *  Geometry helpers (pure)
 * ------------------------------------------------------------------------ */

function seededRandom(seed) {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
}

function destinationPoint(lat, lng, distanceMeters, bearingRadians) {
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lng * Math.PI) / 180;
  const angularDistance = distanceMeters / EARTH_RADIUS_M;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearingRadians)
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearingRadians) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
  );
  const normalizedLon = ((((lon2 * 180) / Math.PI + 540) % 360) - 180);
  return { lat: (lat2 * 180) / Math.PI, lng: normalizedLon };
}

function formatKm(meters) {
  const km = meters / 1000;
  if (km > 100) return Math.round(km);
  if (km > 10) return parseFloat(km.toFixed(1));
  return parseFloat(km.toFixed(2));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function toValidLatLngBounds(bounds) {
  if (!bounds) return null;
  try {
    const latLngBounds = L.latLngBounds(bounds);
    return latLngBounds?.isValid?.() ? latLngBounds : null;
  } catch {
    return null;
  }
}

function sanitizeExtent(extent) {
  if (!Array.isArray(extent) || extent.length < 4) return null;

  const [rawWest, rawSouth, rawEast, rawNorth] = extent.map(Number);
  if (![rawWest, rawSouth, rawEast, rawNorth].every(isFiniteNumber)) return null;

  let west = Math.min(rawWest, rawEast);
  let east = Math.max(rawWest, rawEast);
  let south = clamp(Math.min(rawSouth, rawNorth), VIEW_BOUNDS[0][0], VIEW_BOUNDS[1][0]);
  let north = clamp(Math.max(rawSouth, rawNorth), VIEW_BOUNDS[0][0], VIEW_BOUNDS[1][0]);

  if (east - west < MIN_EXTENT_SPAN_DEGREES) {
    const midLng = (west + east) / 2;
    west = midLng - MIN_EXTENT_SPAN_DEGREES / 2;
    east = midLng + MIN_EXTENT_SPAN_DEGREES / 2;
  }

  if (north - south < MIN_EXTENT_SPAN_DEGREES) {
    const midLat = clamp((south + north) / 2, VIEW_BOUNDS[0][0], VIEW_BOUNDS[1][0]);
    south = clamp(midLat - MIN_EXTENT_SPAN_DEGREES / 2, VIEW_BOUNDS[0][0], VIEW_BOUNDS[1][0]);
    north = clamp(midLat + MIN_EXTENT_SPAN_DEGREES / 2, VIEW_BOUNDS[0][0], VIEW_BOUNDS[1][0]);

    if (north - south < MIN_EXTENT_SPAN_DEGREES) {
      if (south <= VIEW_BOUNDS[0][0]) north = south + MIN_EXTENT_SPAN_DEGREES;
      else south = north - MIN_EXTENT_SPAN_DEGREES;
    }
  }

  return [west, south, east, north];
}

function constrainResetTarget(map, center, zoom, bounds = VIEW_BOUNDS) {
  const limitedZoom = isFiniteNumber(zoom) ? zoom : 2;
  const latLng = L.latLng(center);
  const latLngBounds = toValidLatLngBounds(bounds);
  try {
    return {
      center: map._limitCenter
        ? map._limitCenter(latLng, limitedZoom, latLngBounds)
        : latLng,
      zoom: limitedZoom,
    };
  } catch {
    return { center: latLng, zoom: limitedZoom };
  }
}

function getResetTarget(map, extent) {
  const safeExtent = sanitizeExtent(extent);
  if (!safeExtent) {
    return constrainResetTarget(map, L.latLng(30, 0), 2);
  }

  const bounds = L.latLngBounds([safeExtent[1], safeExtent[0]], [safeExtent[3], safeExtent[2]]);
  let target;
  try {
    target = getWholeZoomBoundsTarget(map, bounds, { padding: L.point(EXTENT_FIT_PADDING) });
  } catch {
    const previousZoomSnap = map.options.zoomSnap;
    try {
      map.options.zoomSnap = 1;
      target = {
        center: bounds.getCenter(),
        zoom: map.getBoundsZoom(bounds, false, EXTENT_FIT_PADDING),
      };
    } finally {
      map.options.zoomSnap = previousZoomSnap;
    }
  }

  return constrainResetTarget(map, target.center, target.zoom);
}

// Leaflet's fit math (_getBoundsCenterZoom / _limitCenter) reads map.getSize().
// During reveal-exit the container is still fullscreen (or mid-shrink), so a
// naive getResetTarget would aim at a zoom that only fits once the box is
// corner-sized after refresh — the "huge difference" after a smooth reset.
function getResetTargetForSize(map, extent, size) {
  if (!map || !size || !(size.x > 0) || !(size.y > 0)) {
    return getResetTarget(map, extent);
  }
  const prevSize = map._size;
  const prevSizeChanged = map._sizeChanged;
  map._size = L.point(size.x, size.y);
  // getSize() recomputes from the live container whenever _sizeChanged is
  // set, which would silently stomp the spoof mid-calculation and fit for
  // whatever box the container happens to be (fullscreen, mid-shrink...).
  map._sizeChanged = false;
  try {
    return getResetTarget(map, extent);
  } finally {
    map._size = prevSize;
    map._sizeChanged = prevSizeChanged;
  }
}

// Destination size for the guess-phase corner minimap MAP BOX. #miniMapArea's
// resting CSS is 20% x 30% of its parent, but the Leaflet container inside is
// smaller: the corner-buttons row and #miniMapContent's border are fixed
// pixels, and .miniMap__btns eats 10% of the area height. Estimating the AREA
// (the original sin here) fit every reveal-exit against a box ~20% too tall —
// the "extent fits slightly differently between rounds" report. The chrome is
// derived from the LIVE geometry instead of mirrored CSS constants: at the
// leave frame the area is fullscreen with guess-phase chrome mounted, so
//   fixedH = 0.9 * areaNow - mapNow   (10% btns row is proportional, rest is px)
//   fixedW = areaNow - mapNow
// transfer exactly to the corner rest size.
function estimateGuessPhaseMapSize(map) {
  if (typeof document === 'undefined') return null;
  const area = document.getElementById('miniMapArea');
  const parent = area?.parentElement;
  if (!parent) return null;

  const mobile = typeof window !== 'undefined'
    && window.matchMedia('(max-width: 600px), (pointer: coarse)').matches;

  // Keep in sync with styles/globals.scss #miniMapArea (+ mobile block).
  const areaW = mobile ? parent.clientWidth : parent.clientWidth * 0.2;
  const areaH = mobile ? parent.clientHeight * 0.7 : parent.clientHeight * 0.3;
  if (!(areaW > 0) || !(areaH > 0)) return null;

  try {
    const mapEl = map?.getContainer?.();
    const areaWNow = area.clientWidth;
    const areaHNow = area.clientHeight;
    if (mapEl && areaWNow > 0 && areaHNow > 0
      && mapEl.clientWidth > 0 && mapEl.clientHeight > 0) {
      const fixedW = areaWNow - mapEl.clientWidth;
      const fixedH = areaHNow * 0.9 - mapEl.clientHeight;
      const w = areaW - fixedW;
      const h = areaH * 0.9 - fixedH;
      if (w > 0 && h > 0) return L.point(Math.round(w), Math.round(h));
    }
  } catch {}

  return L.point(Math.round(areaW), Math.round(areaH));
}

/** True only when the map container has a real (non-zero) viewport. Leaflet's
 *  projection math is degenerate at 0×0, so any camera mutation there lands on a
 *  garbage centre near the maxBounds edge. */
function hasRenderSize(map) {
  try {
    const s = map.getSize();
    return !!s && s.x > 0 && s.y > 0;
  } catch {
    return false;
  }
}

function stopMapAnimations(map) {
  if (!map) return;
  try { clearTimeout(map._sizeTimer); } catch {}

  // Cancel the scheduled animation frames DIRECTLY. This halts motion (fly / pan
  // inertia / zoom) without invoking Leaflet's high-level stop(), which finalises
  // the pan via PosAnimation._complete → _onPanTransitionEnd → setView. At 0×0
  // (the map collapsed between rounds) that finaliser projects onto a degenerate
  // viewport and parks the camera at a garbage centre (~72–88°N) — the long-hunted
  // "stuck north on next round" carry-over. Frame cancels are safe at any size.
  try {
    if (map._flyToFrame != null && L?.Util?.cancelAnimFrame) {
      L.Util.cancelAnimFrame(map._flyToFrame);
    }
    map._flyToFrame = null;
  } catch {}
  try {
    if (map._animRequest != null && L?.Util?.cancelAnimFrame) {
      L.Util.cancelAnimFrame(map._animRequest);
    }
    map._animRequest = null;
  } catch {}
  try {
    // Pan inertia (PosAnimation): cancel its frame without _complete()'ing, which
    // would otherwise run the garbage 0×0 setView described above.
    if (map._panAnim && map._panAnim._animId != null && L?.Util?.cancelAnimFrame) {
      L.Util.cancelAnimFrame(map._panAnim._animId);
      map._panAnim._inProgress = false;
    }
  } catch {}
  try {
    if (map.touchZoom?._animRequest != null && L?.Util?.cancelAnimFrame) {
      L.Util.cancelAnimFrame(map.touchZoom._animRequest);
      map.touchZoom._animRequest = null;
    }
  } catch {}

  // The high-level settles below run setView / zoom finalisers — only safe with a
  // real viewport. At 0×0 we've already halted motion above; leave the camera
  // untouched and let the size-gated resetters (ExtentFitter / BoundsApplier)
  // recenter once the container regains size.
  if (!hasRenderSize(map)) return;

  try { map._stop?.(); } catch {}
  try { map._panAnim?.stop?.(); } catch {}
  // In-flight CSS zoom animations are settled (finished, with proper
  // zoomend/moveend) by the patched map._stop() above — see
  // lib/leafletSettleZoomAnim.js. The manual _animatingZoom flag-clearing
  // that used to live here is unreachable now and was removed.
  try { map.stop(); } catch {}
}

// Handlers a user can still be holding when the reveal ends (drag / pinch /
// fluid wheel glide). Any of them calling map._stop() mid-flight cancels
// ExtentFitter's smooth flyTo and — because needsFit is already cleared —
// leaves the camera parked at the answer-view pan/zoom for the whole guess.
function listMapInteractionHandlers(map) {
  if (!map) return [];
  return [
    map.dragging,
    map.touchZoom,
    map.doubleClickZoom,
    map.scrollWheelZoom,
    map.boxZoom,
    map.keyboard,
    map.fluidWheelZoom,
  ].filter(Boolean);
}

function disableMapInteraction(map) {
  const disabled = [];
  for (const handler of listMapInteractionHandlers(map)) {
    try {
      if (handler.enabled?.()) {
        // dragging.disable() finishes an in-progress drag (Draggable.finishDrag)
        // before removing the listeners — required so a held mouse button can't
        // keep writing the camera after we start flyTo.
        handler.disable();
        disabled.push(handler);
      }
    } catch {}
  }
  return disabled;
}

function enableMapInteraction(handlers) {
  for (const handler of handlers) {
    try { handler.enable(); } catch {}
  }
}

function setMaxBoundsWithoutAutoPan(map, bounds) {
  if (!map) return null;

  const latLngBounds = toValidLatLngBounds(bounds);
  try {
    if (map.listens?.('moveend', map._panInsideMaxBounds)) {
      map.off('moveend', map._panInsideMaxBounds);
    }
  } catch {}

  if (!latLngBounds) {
    try { map.options.maxBounds = null; } catch {}
    return null;
  }

  try { map.options.maxBounds = latLngBounds; } catch {}
  try { map.on('moveend', map._panInsideMaxBounds); } catch {}
  return latLngBounds;
}

// Is the camera already resting exactly where a reset would put it? Compared in
// projected pixels (independent of map._size, so trustworthy against a stale
// viewport) — same verdict style as ExtentFitter's cameraAtTarget.
function cameraRestsAt(map, center, zoom) {
  try {
    if (Math.abs(map.getZoom() - zoom) > 1e-6) return false;
    const now = map.project(map.getCenter(), zoom);
    const want = map.project(L.latLng(center), zoom);
    return now.distanceTo(want) <= 0.5;
  } catch {
    return false;
  }
}

// Replace the resting tile ELEMENTS invisibly — the automated zoom-in-out
// cure for the resting white hairlines. Aug 2 __dumpMap forensics: broken and
// cured rest states are geometrically identical (integer zoom, scale(1),
// exact origin); they differ only in WHICH elements exist. Tiles born under
// reveal-era container geometry keep stale per-layer raster alignment (each
// plus-lighter IMG composites independently) — so the cure must replace
// elements, not adjust math.
//
// Invariants the swap must hold:
//  - old elements stay painted until replacements are ready (a gap flashes
//    the backdrop white);
//  - flip + removal happen in ONE tick (a full-opacity overlap frame
//    double-composites under plus-lighter into a bright flash);
//  - layer._resetView() with an emptied tile registry both reconciles
//    grid/levels/transforms to the resting camera AND creates the fresh
//    elements — no viewprereset, so this never tears down mid-paint.
function rebirthTiles(map) {
  try {
    map.eachLayer((layer) => {
      if (!(layer instanceof L.GridLayer)) return;
      try {
        const orphans = [];
        for (const key in layer._tiles) {
          const el = layer._tiles[key] && layer._tiles[key].el;
          if (el && el.parentNode) orphans.push(el);
        }
        layer._tiles = {};
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          try {
            const now = +new Date();
            for (const key in layer._tiles) {
              const t = layer._tiles[key];
              if (!t) continue;
              t.loaded = now - 1000; // fade math resolves to 1: no refade
              t.active = true;
              if (t.el) L.DomUtil.setOpacity(t.el, 1);
            }
          } catch {}
          for (const el of orphans) { try { el.remove(); } catch {} }
        };
        layer.once('load', finish);
        setTimeout(finish, 600); // straggler cap: stale pixels never outlive this
        layer._resetView();
      } catch {
        try { layer.redraw(); } catch {}
      }
    });
  } catch {}
}

// Returns true when a HARD reset (full teardown + rebuild) actually ran at
// the current size — callers use it to decide whether the resting tiles were
// just reborn (crisp) or survived from reveal-era geometry (need rebirth).
function forceCrispViewReset(map, center, zoom) {
  // Resetting at 0×0 projects onto a degenerate viewport and lands on a garbage
  // centre; the size-gated callers re-run this once the container has real size.
  if (!hasRenderSize(map)) return false;
  // During reveal Leaflet may be mid fly/pan/zoom animation. A normal fitBounds
  // can inherit that pixel origin and leave scaled, blurry tiles until the user
  // zooms. Cancel animation state first, then apply a target already constrained
  // to the vertical play bounds so the next user interaction has nothing to snap.
  const playBounds = toValidLatLngBounds(VIEW_BOUNDS);
  stopMapAnimations(map);
  try { map.invalidateSize({ pan: false, animate: false }); } catch {}
  const target = constrainResetTarget(map, center, zoom, playBounds);

  setMaxBoundsWithoutAutoPan(map, null);
  // Every _resetView (setView's reset:true path included) fires 'viewprereset',
  // and GridLayer answers by DESTROYING every tile element in every level
  // (leaflet-src 4294 → 11345 → _invalidateAll 11568) — then rebuilding from
  // empty. This function fired that three times per call, and the round-
  // transition fitter calls it up to three times: up to NINE full tile-grid
  // teardowns per round. Beyond the grey flashes, the mass img destruction
  // feeds Blink's pre-finalizer queue — the measured 100-125ms CppGC.AtomicSweep
  // MajorGC pauses (the "random stutter";).
  // Guard: skip any hard reset whose camera is already resting on its exact
  // target — a redundant reset has nothing to reset. Real moves (the answer
  // view flying home) still get the full crisp treatment.
  let hardReset = false;
  if (!cameraRestsAt(map, target.center, target.zoom)) {
    try { map.setView(target.center, target.zoom, { animate: false, reset: true }); hardReset = true; } catch {}
    // setView's reset path already ran _resetView to this exact target; only
    // re-run it if the camera somehow did not land (a throwing listener).
    if (!cameraRestsAt(map, target.center, target.zoom)) {
      try { map._resetView?.(target.center, target.zoom, true); hardReset = true; } catch {}
    }
  }
  stopMapAnimations(map);
  setMaxBoundsWithoutAutoPan(map, playBounds);
  let beforeClamp = null;
  try { beforeClamp = map.getCenter(); } catch {}
  try { map.panInsideBounds(playBounds, { animate: false }); } catch {}
  // Re-baseline only if the clamp actually moved the camera. Unmoved, this was
  // a reset to where we already are: no camera effect, one more grid teardown.
  try {
    if (beforeClamp && !beforeClamp.equals(map.getCenter())) {
      map._resetView?.(map.getCenter(), map.getZoom(), true);
      hardReset = true;
    }
  } catch {}
  try { map.invalidateSize({ pan: false, animate: false }); } catch {}
  return hardReset;
}

/* ---------------------------------------------------------------------------
 *  Hooks
 * ------------------------------------------------------------------------ */

// Subscribe to a media query once. Returns a stable boolean.
function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, [query]);
  return matches;
}

// Watch the map container for size changes; coalesce to one rAF per frame.
// `paused` lets the reveal controller take exclusive control during the
// reveal-resize phase so the two callers cannot fight for the pixel origin.
function useResizeWatcher(map, pausedRef) {
  useEffect(() => {
    if (!map) return;
    const container = map.getContainer();
    if (!container) return;
    let rafId = null;
    const ro = new ResizeObserver(() => {
      if (pausedRef.current) return;
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        try { map.invalidateSize(); } catch {}
      });
    });
    ro.observe(container);
    return () => {
      ro.disconnect();
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [map, pausedRef]);
}

/* ---------------------------------------------------------------------------
 *  Dynamic imports — react-leaflet must be client-only.
 * ------------------------------------------------------------------------ */

// Error-boundaried MapContainer (see SafeMapContainer): a partial leaflet load
// throws "a.Map is not a constructor" during commit; without the boundary it
// white-screens the whole app.
const MapContainer = SafeMapContainer;
const TileLayer = dynamic(
  () => import("react-leaflet").then((m) => m.TileLayer),
  { ssr: false }
);

/* ===========================================================================
 *  Internal pieces — each owns one concern. All are children of MapContainer
 *  so they can call useMap() / useMapEvents().
 * ======================================================================== */

/**
 * Handles user clicks during the guessing phase: places a pin, sends the
 * multiplayer "place" message. Stateful inputs (multiplayerState, ws,
 * answerShown) are read via refs so the click handler is stable and never
 * needs re-binding.
 */
const ClickHandler = memo(function ClickHandler({
  answerShown, multiplayerState, ws, setPinPoint, pinPoint,
}) {
  const ref = useRef({ answerShown, multiplayerState, ws, pinPoint });
  useEffect(() => {
    ref.current = { answerShown, multiplayerState, ws, pinPoint };
  }, [answerShown, multiplayerState, ws, pinPoint]);

  // Double-tap zoom fires `click` for its taps BEFORE `dblclick`, so a
  // mobile double-tap used to relocate the guess pin to wherever the user
  // tapped to zoom. Remember the pin as it was before the tap burst and
  // restore it the moment the dblclick arrives: double-tap = zoom only.
  // (A placement delay would fix it "cleaner" but pin latency is sacred.)
  const burstRef = useRef({ before: undefined, lastClickTs: 0 });

  // Decode ahead of the first click so pin placement and guess submission
  // have zero audio latency.
  useEffect(() => {
    preloadSfx('pin', 'guess');
  }, []);

  useMapEvents({
    click(e) {
      const { answerShown: shown, multiplayerState: mp, ws: socket } = ref.current;
      if (shown) return;
      const me = mp?.gameData?.players?.find(p => p.id === mp?.gameData?.myId);
      if (mp?.inGame && me?.final) return;

      const now = Date.now();
      const burst = burstRef.current;
      if (now - burst.lastClickTs > 400) burst.before = ref.current.pinPoint ?? null;
      burst.lastClickTs = now;

      playSfx('pin');

      // Tiles repeat horizontally, so a click can land on a wrap copy at
      // e.g. +540°. The pin must be canonical so it's comparable with
      // multiplayer guesses and the answer reveal. But we don't want the
      // marker to teleport off-screen (canonical -170° vs the +190° the user
      // just clicked), so we instantly shift the camera by the wrap delta:
      // the canonical pin then projects to the exact pixel the user clicked.
      // Tiles repeat identically every 360°, so the visible content doesn't
      // change — only the camera's longitude offset.
      const canonicalLng = normalizeLng(e.latlng.lng);
      const lngShift = e.latlng.lng - canonicalLng;
      if (lngShift !== 0) {
        const map = e.target;
        // Shift by whole world-widths as a RAW PIXEL PAN. setView here would
        // (a) round a fractional resting zoom back to an integer via zoomSnap
        // (pinch can momentarily sit between levels mid-gesture) and (b) fall
        // through to Leaflet's hard _resetView path because the offset exceeds
        // the viewport (viewprereset drops every tile) — together a visible
        // zoom snap plus a grey flash on pin placement. panBy touches neither.
        const z = map.getZoom();
        const dx = map.project([0, -lngShift], z).x - map.project([0, 0], z).x;
        map.panBy([dx, 0], { animate: false });
      }

      const canonical = L.latLng(e.latlng.lat, canonicalLng);
      setPinPoint(canonical);

      if (mp?.inGame && mp.gameData?.state === "guess" && socket) {
        socket.send(JSON.stringify({
          type: "place",
          latLong: [canonical.lat, canonical.lng],
          final: false,
          round: mp.gameData?.curRound,
        }));
      }
    },
    dblclick() {
      const { answerShown: shown, multiplayerState: mp, ws: socket } = ref.current;
      if (shown) return;
      const burst = burstRef.current;
      // Only undo placements that belong to THIS double-tap's taps.
      if (!burst.lastClickTs || Date.now() - burst.lastClickTs > 700) return;
      const restore = burst.before;
      burst.lastClickTs = 0;
      if (restore === undefined) return;
      setPinPoint(restore ?? null);
      if (restore && mp?.inGame && mp.gameData?.state === "guess" && socket) {
        const me = mp?.gameData?.players?.find(p => p.id === mp?.gameData?.myId);
        if (!me?.final) {
          socket.send(JSON.stringify({
            type: "place",
            latLong: [restore.lat, restore.lng],
            final: false,
            round: mp.gameData?.curRound,
          }));
        }
      }
      // restore === null (no pin before the double-tap): the taps' server
      // "place" can't be unsent — same as pre-fix behavior, and the user
      // re-places in practice. Locally the pin is cleared.
    },
  });
  return null;
});

/**
 * Re-applies maxBounds when guessing (re)starts (the reveal lifts them). Runs in
 * a layout effect — BEFORE the browser paints — and snaps straight to the fit
 * target (world / extent), not merely clamps to bounds.
 *
 * Why reset rather than clamp: the reveal leaves the camera at the answer view,
 * which can sit at or past the ±85° ceiling. Clamping leaves it parked up north
 * for one painted frame until ExtentFitter's POST-paint rAF recenters it — a
 * visible flash, and the long-standing "stuck north on next round" bug when the
 * carried-over view was beyond the displayable range. Recentering here, pre-paint,
 * means the guess phase only ever paints at the fit target. ExtentFitter still
 * owns the size-stable refit afterwards; both use getResetTarget so they agree.
 */
const BoundsApplier = memo(function BoundsApplier({ bounds, extent, smoothReset }) {
  const map = useMap();
  // Read at apply-time, not a dep: this only matters on the frame `bounds`
  // flips, and making it a dep would re-run the snap when the flag clears.
  const smoothRef = useRef(smoothReset);
  smoothRef.current = smoothReset;
  // Read the latest extent at apply-time without making it a dep (the array ref
  // churns every render; the only moment we need it is when `bounds` flips).
  const extentRef = useRef(extent);
  extentRef.current = extent;
  useLayoutEffect(() => {
    if (!map) return;
    const latLngBounds = setMaxBoundsWithoutAutoPan(map, bounds);
    if (!latLngBounds) return;
    // Recentering at 0×0 (map collapsed between rounds) would itself project onto
    // a degenerate viewport. maxBounds is now set; defer the recenter to when the
    // container has size — ExtentFitter's size-stable fit will handle it.
    if (!hasRenderSize(map)) return;

    // Smooth reset: ExtentFitter is about to FLY to this exact target while the
    // container shrinks. Re-applying maxBounds above is still required (it is
    // what stops the guess phase panning past ±85°), but the instant setView
    // below would teleport the camera before the flight ever starts and turn
    // the whole thing back into a snap. Leave the camera alone and let the
    // flight land it.
    if (smoothRef.current) return;

    try {
      // Kill any carried-over camera animation (e.g. flick inertia from panning
      // the answer view) so it can't keep nudging north after we recenter.
      stopMapAnimations(map);
      const center = map.getCenter();
      const zoom = map.getZoom();
      const target = getResetTarget(map, extentRef.current);
      if (!center.equals(target.center) || zoom !== target.zoom) {
        try { map.setView(target.center, target.zoom, { animate: false, reset: true }); } catch {}
        try { map._resetView?.(target.center, target.zoom, true); } catch {}
      }
    } catch {}
  }, [map, bounds]);
  return null;
});

const CameraAnimationStopper = memo(function CameraAnimationStopper({ active, cameraCancelKey, resizingRef }) {
  const map = useMap();
  const lastCameraCancelKeyRef = useRef(cameraCancelKey);
  useLayoutEffect(() => {
    if (!map) return;
    const cancelKeyChanged = lastCameraCancelKeyRef.current !== cameraCancelKey;
    lastCameraCancelKeyRef.current = cameraCancelKey;
    if (!active && !cancelKeyChanged) return;
    resizingRef.current = false;
    stopMapAnimations(map);
    // invalidateSize reads clientWidth/Height, forcing a full document layout.
    // This is a layout effect, and `active` flips true in the very commit that
    // starts the answer map's fade-out — so doing it inline delays that fade's
    // first paint until after the reflow, on a main thread the next round's pano
    // load is already competing for. Nothing here needs the new size before
    // paint: the container is either unchanged (fade) or hidden (reset/settle).
    const rafId = requestAnimationFrame(() => {
      try { map.invalidateSize({ pan: false, animate: false }); } catch {}
    });
    return () => cancelAnimationFrame(rafId);
  }, [map, active, cameraCancelKey, resizingRef]);
  return null;
});

/**
 * Fits the map to a custom extent during the guessing phase. It waits for the
 * minimap to be visible so Leaflet computes zoom from the real play viewport.
 */
const ExtentFitter = memo(function ExtentFitter({
  extent,
  answerShown,
  shown,
  resetKey,
  smoothReset,
  onResetComplete,
}) {
  const map = useMap();
  const [resettingCamera, setResettingCamera] = useState(false);
  // Latched, not just a same-commit ref: `smoothReset` is true for a single
  // GameUI render (the getready→guess edge, derived from a prev-state ref).
  // If this effect bails early that commit — typically `shown` false while the
  // next-round pano is still loading / forceHide is up — the flag would be
  // gone by the time `shown` flips true, and we'd fall into the legacy cover
  // path. Latch until the smooth fly actually starts.
  const pendingSmoothResetRef = useRef(false);
  if (smoothReset) pendingSmoothResetRef.current = true;
  // Last known resting corner size (not answerShown / mapExpanded). Preferred
  // over estimateGuessPhaseMapSize when available — real layout beats CSS %.
  const lastGuessSizeRef = useRef(null);
  const lastExtentKeyRef = useRef(null);
  const lastResetKeyRef = useRef(null);
  const needsFitRef = useRef(true);
  // Stable string key so we don't re-fit on identical-but-new array refs.
  const extentKey = extent ? extent.join(',') : null;
  useEffect(() => {
    if (lastExtentKeyRef.current !== extentKey) {
      lastExtentKeyRef.current = extentKey;
      needsFitRef.current = true;
    }
    if (lastResetKeyRef.current !== resetKey) {
      lastResetKeyRef.current = resetKey;
      needsFitRef.current = true;
    }

    if (!map || answerShown || !shown) {
      if (answerShown) {
        needsFitRef.current = true;
        // A new reveal supersedes any unconsumed leave intent (e.g. the player
        // disconnected while the next-round pano was still loading).
        pendingSmoothResetRef.current = false;
      }
      setResettingCamera(false);
      // Keep pendingSmoothResetRef when !shown: the leave commit may have
      // arrived while `shown` was false; the fly still needs to run once
      // `shown` returns.
      return;
    }

    // Remember the resting corner viewport so a later reveal-exit can fit
    // against it while the live container is still fullscreen. Skip the leave
    // frame itself (pendingSmoothReset / .revealExiting) — getSize() is still
    // the fullscreen box then and would clobber the good latch.
    const captureRestingSize = () => {
      try {
        const area = map.getContainer()?.closest?.('#miniMapArea');
        const resting = area
          && !area.classList.contains('answerShown')
          && !area.classList.contains('mapExpanded')
          && !area.classList.contains('fullscreen')
          && !area.classList.contains('revealExiting');
        if (!resting || !hasRenderSize(map)) return;
        const s = map.getSize();
        // The hover collapse animates width/height for 250ms AFTER
        // .mapExpanded is gone, so "no expansion class" does not mean "at
        // rest". The estimate derives the chrome from live geometry, so it
        // predicts the RESTING map box no matter what size the container
        // happens to be mid-animation — a measurement that disagrees with it
        // is mid-collapse and would poison every later reveal-exit fit.
        const est = estimateGuessPhaseMapSize(map);
        if (!est || (Math.abs(s.x - est.x) <= 16 && Math.abs(s.y - est.y) <= 16)) {
          lastGuessSizeRef.current = L.point(s.x, s.y);
        }
      } catch {}
    };
    if (!pendingSmoothResetRef.current) captureRestingSize();

    if (!needsFitRef.current && !pendingSmoothResetRef.current && !onResetComplete) {
      requestAnimationFrame(() => {
        try { map.invalidateSize({ pan: false, animate: false }); } catch {}
      });
      return;
    }

    // Smooth reset (leaving a multiplayer answer reveal): the container is
    // CSS-shrinking fullscreen -> corner right now and the map is in full view
    // the whole way. Fly to the target over the same window instead of the
    // stable-frame + hard-snap dance below.
    //
    // No cover: `.leaflet-camera-reset-cover` is a flat #aadaff fill over the
    // entire map, which is fine when it hides a snap the user was never meant
    // to see, and reads as a grey/blue flash when there is nothing to hide.
    // No forceCrispViewReset either: its `_resetView` tears the tile grid down
    // and rebuilds it, so tiles pop in from empty. flyTo keeps the existing
    // pyramid and lets Leaflet backfill.
    //
    // useResizeWatcher's ResizeObserver is already invalidating once per frame
    // as the box shrinks, so the projection tracks the container for free —
    // and those invalidations are cheap now that the canvas backing store is
    // reused rather than reallocated (lib/leafletLiveVectors.js).
    //
    // What those per-frame invalidations are NOT allowed to do during the fly:
    //  - Enforce maxBounds. invalidateSize fires 'moveend' SYNCHRONOUSLY and
    //    _panInsideMaxBounds -> panInsideBounds -> panTo calls _stop(), which
    //    cancels the flight a few frames in (a fullscreen-sized viewport at
    //    corner-fit zoom always "needs" a clamp). Bounds application is
    //    deferred to settle; input is disabled for the window, so nothing can
    //    actually escape ±85° in the meantime.
    //  - Update the tile grid. Mid-flight the camera sits >1 level from
    //    _tileZoom, and both GridLayer._update's escape hatch and the grouped
    //    moveend sync respond with a full abort-fetches-and-rebuild — once per
    //    frame for the whole shrink (the fluid-wheel Part 3 failure mode,
    //    resurrected via moveend). map._suspendTileUpdates parks _onMoveEnd
    //    for the window (gate lives in lib/leafletGroupedTiles.js, the owner
    //    of that patch chain); 'zoom'/'viewreset' listeners stay live, so the
    //    landing (tagged flyTo frames, then one untagged final _move)
    //    reconciles tiles normally.
    if (pendingSmoothResetRef.current) {
      pendingSmoothResetRef.current = false;
      needsFitRef.current = false;
      setResettingCamera(false);

      let settled = false;
      // True only once the camera VERIFIABLY rests on the target. The reset is
      // not "done" because a snap was issued — setView fires viewprereset
      // (which wipes every tile) BEFORE it moves the camera, so a listener
      // throwing mid-storm leaves a blue map parked at the answer view. Every
      // failure used to be silently caught with needsFit already false: broken
      // for the whole round (the ranked-duel "blue until hover, camera at my
      // last zoom" report). Now unverified resets keep healing (below).
      let finalized = false;
      let settleTimer = null;
      let retryTimer = null;
      let retryAttempts = 0;
      let reenabledHandlers = [];
      let onVisibilityHidden = null;
      let onVisibilityVisible = null;
      // Target for the CORNER minimap size, not the current fullscreen
      // container. Flying to a fullscreen-fit zoom was the "looks right after
      // refresh, wrong after smooth reset" bug — refresh runs the legacy path
      // once the box is already corner-sized.
      let flyTarget = null;
      let cornerIntent = null;

      const isHidden = () =>
        typeof document !== 'undefined' && document.visibilityState === 'hidden';

      const cameraAtTarget = (target) => {
        // Both axes. Zoom alone let an interrupted flight park at an arbitrary
        // in-between center. project() math is independent of map._size, so
        // this verdict is trustworthy even against a stale viewport.
        try {
          const centerPx = map.project(map.getCenter(), target.zoom);
          const targetPx = map.project(target.center, target.zoom);
          return Math.abs(map.getZoom() - target.zoom) <= 0.01
            && centerPx.distanceTo(targetPx) <= 1;
        } catch {
          return false;
        }
      };

      // Land the camera on the canonical rest view; report whether it is
      // verifiably there. Lifts maxBounds around the snap (a stale fullscreen
      // _size makes _limitCenter shove a corner-zoom view to the equator —
      // callers re-arm bounds afterwards). recompute=true re-derives the
      // target from the live container — only trustworthy when visible and at
      // rest; hidden callers land on the corner-intent flyTarget instead.
      const landCamera = (recompute, forceSnap) => {
        try { map.invalidateSize({ pan: false, animate: false }); } catch {}
        if (!hasRenderSize(map)) return false;
        let target = flyTarget;
        if (recompute) {
          try { target = getResetTarget(map, extent); } catch {}
        }
        if (!target) return false;
        if (!forceSnap && cameraAtTarget(target)) {
          // Accepted ≠ exact: the tolerances above admit e.g. zoom 2.004,
          // which rests the level CSS-scaled (hairline seams at every tile
          // boundary), and this is the only landing that keeps reveal-born
          // tile elements alive (stale raster alignment — the other seam
          // source). Stop the flight FIRST (its tail, or settle-window
          // moveend churn reaching panTo → stock setView's leading _stop(),
          // would re-park the camera after acceptance), land the exact
          // camera, then rebirth the elements at rest — rebirthTiles also
          // reconciles grid/levels/transforms, standing in for the flight
          // completion pass the stop just killed. The snap branch below
          // needs none of this: its setView rebuilds everything at rest.
          try {
            stopMapAnimations(map);
            if (map.getZoom() !== target.zoom
              || !map.getCenter().equals(L.latLng(target.center))) {
              map._move(target.center, target.zoom);
            }
            rebirthTiles(map);
          } catch {}
          return true;
        }
        try {
          stopMapAnimations(map);
          setMaxBoundsWithoutAutoPan(map, null);
          map.setView(target.center, target.zoom, { animate: false });
        } catch {}
        return cameraAtTarget(target);
      };

      // Hidden-tab bounds rule: keep options.maxBounds SET (drag viscosity
      // reads it) but leave the moveend enforcement listener DETACHED until
      // the tab is visible again. While hidden every moveend is
      // machine-generated (map.stop()'s no-op pan, restore-time
      // invalidateSize churn) and _panInsideMaxBounds clamping against a
      // stale/mid-transition viewport was the equator-drift family. An
      // earlier attempt "fixed" that by writing the corner size into
      // map._size instead — the ResizeObserver then charged the lie back on
      // restore as a raw half-phantom-delta pan (~700px at z2), the "map in
      // a random spot after minimizing" bug. Never lie to Leaflet about
      // state; remove the thing that made the lie tempting.
      const rearmBounds = () => {
        setMaxBoundsWithoutAutoPan(map, toValidLatLngBounds(VIEW_BOUNDS));
        if (isHidden()) {
          try { map.off('moveend', map._panInsideMaxBounds); } catch {}
        }
      };

      // One-shot, armed after any settle that finished while hidden: on
      // return, verify the camera still rests on the corner target (with the
      // lie gone and enforcement detached nothing should have moved it — this
      // is normally a pure check), then restore full bounds enforcement.
      let onVisibleFinish = null;
      const disarmFinisher = () => {
        if (onVisibleFinish != null) {
          try { document.removeEventListener('visibilitychange', onVisibleFinish); } catch {}
          onVisibleFinish = null;
        }
      };
      const armVisibleFinisher = () => {
        if (onVisibleFinish != null || typeof document === 'undefined') return;
        onVisibleFinish = () => {
          if (document.visibilityState !== 'visible') return;
          disarmFinisher();
          landCamera(false, false);
          setMaxBoundsWithoutAutoPan(map, toValidLatLngBounds(VIEW_BOUNDS));
          refreshGrids();
        };
        try { document.addEventListener('visibilitychange', onVisibleFinish); } catch {}
      };

      const refreshGrids = () => {
        // Completed flights reconcile tiles via their final untagged zoom
        // event and snaps via viewreset; this covers in-tolerance landings
        // that happened while moveend updates were suspended, refills a grid
        // that a failed snap wiped, and prunes retained answer-view levels.
        // _noPrune was latched true by the prefetch's noPrune _setView;
        // without clearing it the fade-driven prune path stays parked until
        // the next reveal's _setView flips it back.
        try {
          map.eachLayer((layer) => {
            if (layer instanceof L.GridLayer) {
              try { layer._noPrune = false; layer._update(); layer._pruneTiles(); } catch {}
            }
          });
        } catch {}
      };

      const disarmHeal = () => {
        if (retryTimer != null) {
          clearTimeout(retryTimer);
          retryTimer = null;
        }
        if (onVisibilityVisible != null) {
          try { document.removeEventListener('visibilitychange', onVisibilityVisible); } catch {}
          onVisibilityVisible = null;
        }
      };

      const healTick = () => {
        // Callable from both the timer and the visibilitychange arm — kill any
        // pending timer so the two entry points can't run parallel chains.
        if (retryTimer != null) {
          clearTimeout(retryTimer);
          retryTimer = null;
        }
        if (finalized) {
          disarmHeal();
          return;
        }
        retryAttempts += 1;
        if (landCamera(!isHidden(), false)) {
          finalized = true;
          needsFitRef.current = false;
          rearmBounds();
          refreshGrids();
          captureRestingSize();
          disarmHeal();
          if (isHidden()) armVisibleFinisher();
          return;
        }
        rearmBounds();
        // Timer chain is bounded; the visibilitychange arm below is not — a
        // return from any length of absence gets a fresh attempt budget, so
        // the "wrong all round until I touched it" state cannot survive the
        // user actually looking at the map.
        if (retryAttempts < 10) retryTimer = setTimeout(healTick, 300);
      };

      const armHeal = () => {
        // The deep fallback: any later effect re-run (shown flip, next round)
        // takes the battle-tested stable-frame + hard-snap path.
        needsFitRef.current = true;
        if (typeof document !== 'undefined' && onVisibilityVisible == null) {
          onVisibilityVisible = () => {
            if (document.visibilityState === 'visible') {
              retryAttempts = 0;
              healTick();
            }
          };
          try { document.addEventListener('visibilitychange', onVisibilityVisible); } catch {}
        }
        if (retryTimer == null) retryTimer = setTimeout(healTick, 300);
      };

      const settleSmoothReset = (forceSnap) => {
        if (settled) return;
        settled = true;
        if (settleTimer != null) {
          clearTimeout(settleTimer);
          settleTimer = null;
        }
        if (onVisibilityHidden != null) {
          try { document.removeEventListener('visibilitychange', onVisibilityHidden); } catch {}
          onVisibilityHidden = null;
        }
        finalized = landCamera(false, forceSnap);
        // Deferred from fly-start so moveend enforcement couldn't kill the
        // flight. The landed target is _limitCenter-constrained already, so
        // this is a pure re-arm of the guess-phase ±85° clamp (enforcement
        // listener deferred to visibility when hidden — see rearmBounds).
        rearmBounds();
        map._suspendTileUpdates = false;
        refreshGrids();
        enableMapInteraction(reenabledHandlers);
        reenabledHandlers = [];
        // The box just landed at the corner rest — the one moment per round
        // the resting size is knowable for certain. Latching here keeps the
        // preloaded-pano rounds (no mid-round effect re-runs, so the
        // opportunistic capture above may never fire) on real measurements.
        if (finalized) captureRestingSize();
        if (!finalized) armHeal();
        else if (isHidden()) armVisibleFinisher();
      };

      try {
        // Kill inertia / mid-glide fluid zoom / an in-flight reveal fly, then
        // take the input handlers so a still-held drag or wheel notch can't
        // _stop() the reset fly the moment it starts.
        stopMapAnimations(map);
        reenabledHandlers = disableMapInteraction(map);
        cornerIntent = lastGuessSizeRef.current || estimateGuessPhaseMapSize(map);
        flyTarget = getResetTargetForSize(map, extent, cornerIntent);
        // Lift for the flight (BoundsApplier attached them this same commit);
        // settle re-applies. See the moveend-assassin note above.
        setMaxBoundsWithoutAutoPan(map, null);

        // Hidden tab: rAF never fires, so flyTo would hang on its first frame
        // and the (throttled) settle timer would land it late against a stale
        // viewport. Nobody is watching — settle to the exact target now.
        if (isHidden()) {
          settleSmoothReset(true);
          return () => { settleSmoothReset(true); disarmHeal(); disarmFinisher(); };
        }

        map._suspendTileUpdates = true;
        // Prefetch the DESTINATION tile level so the world fades in under the
        // shrinking answer-view raster instead of popping in after landing.
        // Deliberately NOT prepareGroupedTileLevel: that helper also serves
        // every mobile pinch, and routing this flight through it (with the
        // _zoom spoof the multi-level jump needs) coincided with a mobile
        // pinch-settle regression — keep the shared pinch path untouched and
        // pay the small duplication here, desktop reveal-exit only.
        // The spoof: _setView's internal _update re-derives from map.getZoom()
        // and its >1-level escape would bounce this z10→z2 prefetch back to
        // the live level around the target center. Same synchronous-override
        // trick as getResetTargetForSize with _size. noPrune keeps the answer
        // tiles as the crossfade base; transforms re-align to the live camera
        // before the next paint.
        try {
          map.eachLayer((layer) => {
            if (!(layer instanceof L.GridLayer) || layer.options.updateWhenZooming !== false) return;
            try {
              if (layer._tileZoom === Math.round(flyTarget.zoom)) return;
              const realZoom = map._zoom;
              const realPixelOrigin = map._pixelOrigin;
              map._zoom = flyTarget.zoom;
              // The zoom spoof alone is NOT enough. _updateLevels anchors the
              // new level via unproject(getPixelOrigin()) — with _zoom spoofed
              // the answer-view-scale origin (2^answerZoom px) passes through
              // unrescaled, and the level is born with ~10^5-10^6 px tile
              // coordinates. The CSS math cancels exactly, but the compositor
              // transforms in fp32: at those magnitudes sub-pixel precision is
              // gone, adjacent tiles land ±0.02-0.25px apart, and plus-lighter
              // turns the misalignment into faint white seams at round start —
              // severity tracks the previous answer's zoom (the "random mild
              // white lines until you touch the map" report; any zoom rebuilds
              // the level with a sane origin, which is why interacting fixed
              // it). Give the level a target-zoom-scale origin from birth.
              try {
                map._pixelOrigin = map._getNewPixelOrigin(L.latLng(flyTarget.center), flyTarget.zoom);
              } catch {}
              try {
                layer._setView(flyTarget.center, flyTarget.zoom, true, false);
              } finally {
                map._zoom = realZoom;
                map._pixelOrigin = realPixelOrigin;
              }
              layer._setZoomTransforms(map.getCenter(), map.getZoom());
              // _updateLevels just made the destination the CURRENT level,
              // which Leaflet z-indexes on top — so the world tiles faded in
              // OVER the answer imagery mid-flight as a giant blurry upscale.
              // Demote it: the world fills the void UNDER the shrinking
              // answer raster; the landing's own _setView re-asserts the
              // normal stacking (and prunes the answer levels).
              const lvl = layer._levels?.[Math.round(flyTarget.zoom)];
              if (lvl?.el) lvl.el.style.zIndex = 1;
            } catch {}
          });
        } catch {}

        map.flyTo(flyTarget.center, flyTarget.zoom, {
          duration: SMOOTH_RESET_FLY_SEC,
          // Leaflet's flyTo easing is already close to the CSS `ease` the
          // container uses; leave the curve alone so the two stay in step.
        });
        // Losing visibility mid-fly freezes the rAF loop with the camera in
        // an arbitrary in-between state; finalize immediately instead.
        onVisibilityHidden = () => {
          if (document.visibilityState === 'hidden') settleSmoothReset(true);
        };
        document.addEventListener('visibilitychange', onVisibilityHidden);
        // Don't trust moveend to reopen input: invalidateSize from the shrink
        // ResizeObserver can fire moveend mid-flight. Just wait out the fly.
        settleTimer = setTimeout(
          () => settleSmoothReset(false),
          Math.ceil(SMOOTH_RESET_FLY_SEC * 1000) + 40,
        );
      } catch {
        settleSmoothReset(true);
      }

      // Cleanup also disarms the heal + finisher: a re-run means the world
      // changed (next reveal, shown flip, new extent) — needsFit was restored
      // by armHeal, so the incoming run's own machinery takes over instead of
      // a stale timer snapping the camera out from under the new state.
      return () => { settleSmoothReset(true); disarmHeal(); disarmFinisher(); };
    }

    // "Play again" from the summary keeps this Leaflet map mounted, then
    // starts a hidden loading phase. Fit only after the minimap is visible
    // again and its container has reported the same size for a few frames.
    //
    // NO disableMapInteraction here. The July 29 push borrowed it from the
    // smooth flight, which made every legacy round start (SP, mobile MP,
    // refresh) drop wheel/drag input for up to ~800ms — dead-feeling map at
    // exactly the moment duel players start moving. The pre-existing double
    // forceCrispViewReset already tolerates interaction races the way it has
    // for months; the flight is the only camera move fragile enough to need
    // input taken away.
    setResettingCamera(true);
    const container = map.getContainer();
    let cancelled = false;
    let rafId = null;
    let finalRafId = null;
    let fallbackTimer = null;
    let resetFinished = false;
    let lastW = container?.clientWidth ?? 0;
    let lastH = container?.clientHeight ?? 0;
    let stableFrames = 0;
    const STABLE_FRAMES_REQUIRED = 3;

    const finishReset = (notifyHost) => {
      if (resetFinished) return;
      resetFinished = true;
      if (notifyHost) {
        try { onResetComplete?.(); } catch {}
      }
    };

    const applyFit = () => {
      if (cancelled) return;
      cancelled = true;
      if (rafId != null) cancelAnimationFrame(rafId);
      if (fallbackTimer != null) clearTimeout(fallbackTimer);
      try {
        const target = getResetTarget(map, extent);
        const hard1 = forceCrispViewReset(map, target.center, target.zoom);
        finalRafId = requestAnimationFrame(() => {
          // Re-derive the canonical target rather than trusting getCenter(): between
          // the reset above and this frame, the hard maxBounds clamp (viscosity 1.0)
          // can shove a tall low-zoom viewport to the ±85° edge. Reading getCenter()
          // here cemented that drift (logged target≈72°N instead of 30,0); re-fitting
          // to getResetTarget snaps it back to the intended world/extent view.
          let hard2 = false;
          try {
            const t = getResetTarget(map, extent);
            hard2 = forceCrispViewReset(map, t.center, t.zoom);
          } catch {}
          // Both stable-size passes guard-skipped ⇒ the resting tiles are
          // reveal-born survivors (stale raster alignment = hairlines):
          // rebirth once at rest. A hard reset already rebuilt at rest, so
          // rebirthing after one would only churn. The t0 pass deliberately
          // doesn't count — it can run at pre-shrink geometry, which births
          // exactly the tiles that need replacing.
          if (!hard1 && !hard2) rebirthTiles(map);
          needsFitRef.current = false;
          setResettingCamera(false);
          // The host may be holding this map forceHidden. Release it only
          // after the second canonical reset above has landed.
          finishReset(true);
        });
      } catch {
        setResettingCamera(false);
        finishReset(true);
      }
    };

    const tick = () => {
      if (cancelled) return;
      try { map.invalidateSize(); } catch {}

      const w = container?.clientWidth ?? 0;
      const h = container?.clientHeight ?? 0;
      if (w > 0 && h > 0 && w === lastW && h === lastH) {
        stableFrames += 1;
        if (stableFrames >= STABLE_FRAMES_REQUIRED) {
          applyFit();
          return;
        }
      } else {
        stableFrames = 0;
        lastW = w;
        lastH = h;
      }

      rafId = requestAnimationFrame(tick);
    };

    // Recenter IMMEDIATELY (not just via the rAF tick below, which can be starved
    // while the map is hidden/clipped). Without this, an answer view left past the
    // ±85° vertical bound — maxBounds is lifted during reveal — gets clamped to the
    // nearest edge by panInsideMaxBounds and stays stuck at the top/bottom instead
    // of recentering. The tick loop then refines once the container size settles.
    // Skip when the container has no size yet (the hidden "play again" case): fitting
    // at 0×0 is meaningless, so let the tick wait for a real size.
    if (lastW > 0 && lastH > 0) {
      try {
        const t0 = getResetTarget(map, extent);
        forceCrispViewReset(map, t0.center, t0.zoom);
      } catch {}
    }

    rafId = requestAnimationFrame(tick);
    fallbackTimer = setTimeout(applyFit, 800);

    return () => {
      cancelled = true;
      setResettingCamera(false);
      if (rafId != null) cancelAnimationFrame(rafId);
      if (finalRafId != null) cancelAnimationFrame(finalRafId);
      if (fallbackTimer != null) clearTimeout(fallbackTimer);
      finishReset(false);
    };
  }, [map, extentKey, answerShown, shown, resetKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return resettingCamera ? <div className="leaflet-camera-reset-cover" /> : null;
});

/**
 * Drives the reveal animation. Owns the "we are resizing" exclusive flag so
 * no other caller (ResizeObserver, etc.) invalidates while we're animating.
 *
 * Sequence:
 *   1. While the parent CSS resize is in flight: invalidateSize once per
 *      frame (rAF). With Leaflet's panes sharing a single GPU layer (see
 *      globals.scss), tile + canvas overlay both re-project on the same
 *      frame — polylines stay locked to tiles throughout.
 *   2. Once the container size is stable (3 frames OR hard cap), kick off
 *      the flyTo. Origin is now fixed for the duration of the fly so the
 *      flyTo's cached pixel transform stays valid the whole time.
 */
const RevealController = memo(function RevealController({
  answerShown, dest, pinPoint, countryGuessPin, resizingRef, stopCameraAnimations, cameraCancelKey, onRevealReady, bandFraction,
}) {
  const map = useMap();
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);

  // Band mode (mobile embed): the host grows the in-page band to full on the SAME
  // render that flips answerShown. Resize + recentre-compensate Leaflet
  // SYNCHRONOUSLY here, before the browser paints, so there's never a frame where
  // the container is full-height while Leaflet is still band-sized (which flashed
  // the visible band grey / looking panned). We capture the band's bottom-centre
  // geo first (Leaflet still thinks it's band-sized), invalidate to full, then pan
  // that exact point back to the new bottom-centre — pinning the guessing content
  // in place so the new space just fills in above (no re-center jump). maxBounds is
  // lifted on answerShown so this isn't clamped.
  // Mobile WEB reveals need the same treatment: the phone CSS snaps
  // #miniMapArea from the 70% band to fullscreen in one frame (deliberately —
  // no slide), and without this pre-paint resize the first fullscreen frame
  // painted Leaflet's stale 70%-sized projection shifted up by the height
  // delta, then hopped again when the post-paint invalidate recentred it (the
  // open-minimap reveal flicker). Both boxes share the viewport-bottom edge,
  // so pinning the bottom-centre geo point makes the snap invisible: the
  // guess content stays put and the new space just fills in above.
  useLayoutEffect(() => {
    if (!answerShown || !map || !((bandFraction > 0 && bandFraction < 1) || isMobile)) return;
    try {
      const s0 = map.getSize();
      const anchor = map.containerPointToLatLng([s0.x / 2, s0.y]);
      map.invalidateSize({ animate: false });
      const s1 = map.getSize();
      const cur = map.latLngToContainerPoint(anchor);
      map.panBy(cur.subtract([s1.x / 2, s1.y]), { animate: false });
    } catch (e) {}
  }, [map, answerShown, bandFraction, isMobile]);

  useEffect(() => {
    if (!map || !answerShown || !dest || stopCameraAnimations) return;

    // Fire exactly once, the moment the map has finished resizing to its new
    // (full) size — the host listens for this to unclip to full-screen with no
    // resize flicker. Guarded so the resize-cap and the stable-frame paths can't
    // double-signal.
    let readySignaled = false;
    const signalReady = () => {
      if (readySignaled) return;
      readySignaled = true;
      try { onRevealReady && onRevealReady(); } catch (e) {}
    };

    const baseDelay = pinPoint
      ? (isMobile ? REVEAL.pinDelayMobileMs : REVEAL.pinDelayDesktopMs)
      : (isMobile ? REVEAL.mobileDelayMs : REVEAL.desktopDelayMs);

    const container = map.getContainer();
    let cancelled = false;
    let rafId = null;
    let resizeCapTimer = null;
    let flyTimer = null;
    // maxBounds applies to programmatic camera moves too (Leaflet enforces
    // it on every center change). During reveal we run resize -> invalidate
    // loop -> flyTo; lifting the constraint prevents panInsideBounds from
    // fighting the reveal. BoundsApplier re-applies the clamp when guessing
    // resumes.
    setMaxBoundsWithoutAutoPan(map, null);

    const cleanup = () => {
      if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
      if (resizeCapTimer != null) { clearTimeout(resizeCapTimer); resizeCapTimer = null; }
      if (flyTimer != null) { clearTimeout(flyTimer); flyTimer = null; }
      stopMapAnimations(map);
      resizingRef.current = false;
    };

    const startFly = () => {
      if (cancelled) return;
      try { map.invalidateSize(); } catch {}
      let durationSec = REVEAL.flyDurations.world;
      try {
        if (pinPoint) {
          durationSec = REVEAL.flyDurations.pin;
          const bounds = L.latLngBounds([pinPoint, { lat: dest.lat, lng: dest.long }]).pad(0.5);
          flyToBoundsAtWholeZoom(map, bounds, { duration: durationSec });
        } else if (countryGuessPin) {
          durationSec = REVEAL.flyDurations.country;
          const bounds = L.latLngBounds(
            [{ lat: countryGuessPin.lat, lng: countryGuessPin.lng }, { lat: dest.lat, lng: dest.long }]
          ).pad(0.5);
          flyToBoundsAtWholeZoom(map, bounds, { duration: durationSec });
        } else {
          map.flyTo([dest.lat, dest.long], 5, { duration: durationSec });
        }
      } catch {}
    };

    const finishResize = () => {
      if (cancelled || !resizingRef.current) return;
      resizingRef.current = false;
      // Resize is settled and the map is invalidated at full size — safe to show.
      signalReady();
      if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
      if (resizeCapTimer != null) { clearTimeout(resizeCapTimer); resizeCapTimer = null; }
      const elapsed = performance.now() - resizeStart;
      // Band mode (mobile): fly to the guess/answer extent IMMEDIATELY, concurrent
      // with the host's slide-up — the re-center has been compensated so the fly
      // starts cleanly from the guessing view. Other hosts use the normal delay.
      const remaining = (bandFraction > 0 && bandFraction < 1)
        ? 0
        : Math.max(0, baseDelay - elapsed);
      flyTimer = setTimeout(startFly, remaining);
    };

    if (!container) {
      signalReady();
      flyTimer = setTimeout(startFly, baseDelay);
      return () => { cancelled = true; cleanup(); };
    }

    resizingRef.current = true;
    const resizeStart = performance.now();
    let lastW = container.clientWidth;
    let lastH = container.clientHeight;
    let stableFrames = 0;
    const STABLE_FRAMES_REQUIRED = 3;
    // Band mode does its resize + compensation synchronously in the useLayoutEffect
    // above; here the tick just confirms the size is stable, then flies.

    const tick = () => {
      if (cancelled || !resizingRef.current) return;
      try { map.invalidateSize(); } catch {}
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === lastW && h === lastH) {
        if (++stableFrames >= STABLE_FRAMES_REQUIRED) { finishResize(); return; }
      } else {
        stableFrames = 0;
        lastW = w;
        lastH = h;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    resizeCapTimer = setTimeout(finishResize, REVEAL.resizeCapMs);

    return () => { cancelled = true; cleanup(); };
    // pin/country/dest captured at reveal start; re-running mid-reveal would
    // restart the animation, which we don't want.
  }, [answerShown, stopCameraAnimations, cameraCancelKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
});

/**
 * Single ResizeObserver bridge. Suppressed while RevealController owns the
 * resize phase, otherwise coalesces invalidateSize to one rAF.
 */
const ContainerResizeBridge = memo(function ContainerResizeBridge({ resizingRef }) {
  const map = useMap();
  useResizeWatcher(map, resizingRef);
  // Stop any in-progress map animation when the map unmounts so Leaflet
  // doesn't try to access destroyed panes.
  useEffect(() => {
    if (!map) return;
    return () => { try { map.stop(); } catch {} };
  }, [map]);
  // Map forensics: run __dumpMap() in the console the moment something looks
  // wrong (seams, blur, wrong camera), and again after any cure. The diff of
  // zoom/origin/transform/zIndex/tile counts between two dumps names the
  // guilty subsystem outright.
  //
  // Dev by default, plus `?mapdebug=1` anywhere: these bugs surface during real
  // multiplayer play on prod, which is the one place a dev-only tool can never
  // reach. Opt-in per URL, same pattern the (since-removed) ?pinprobe=1 phone
  // overlay used. Read-only DOM/Leaflet state, no listeners, no side effects.
  useEffect(() => {
    if (!map || typeof window === 'undefined') return;
    const optedIn = (() => {
      try { return new URLSearchParams(window.location.search).get('mapdebug') === '1'; }
      catch { return false; }
    })();
    if (process.env.NODE_ENV === 'production' && !optedIn) return;
    window.__dumpMap = () => {
      const out = {
        zoom: map.getZoom(),
        integerZoom: map.getZoom() === Math.round(map.getZoom()),
        center: map.getCenter(),
        size: map.getSize(),
        container: {
          w: map.getContainer()?.clientWidth,
          h: map.getContainer()?.clientHeight,
        },
        panePos: (() => { try { return L.DomUtil.getPosition(map._mapPane); } catch { return null; } })(),
        pixelOrigin: map.getPixelOrigin(),
        suspendTileUpdates: !!map._suspendTileUpdates,
        animatingZoom: !!map._animatingZoom,
        // BLUR FORENSICS (Aug 10). On desktop every tile pixel is painted by
        // the canvas compositor, so "imagery soft but pins sharp" lives here.
        // backing must equal rect * dpr: if it is SMALLER the bitmap is being
        // stretched to fit (deterministic blur, fix the sizing); if it MATCHES
        // and the imagery is still soft, the pixels are right and the layer's
        // GPU texture is degraded (the backing-churn family — a display
        // none/restore toggle on the canvas cures that and proves it).
        compositor: (() => {
          try {
            const c = map._wgCompositor;
            const el = map.getContainer()?.querySelector('.wg-tile-compositor');
            if (!el) return { present: false, alive: !!(c && c._map === map) };
            const r = el.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            return {
              present: true,
              alive: !!(c && c._map === map),
              classOnContainer: !!map.getContainer()?.classList.contains('wg-canvas-tiles'),
              backing: [el.width, el.height],
              styleSize: [el.style.width, el.style.height],
              rect: [+r.width.toFixed(1), +r.height.toFixed(1)],
              expectBacking: [Math.round(r.width * dpr), Math.round(r.height * dpr)],
              // Allocation vs content: divergence here is EXPECTED and healthy
              // (that is the reuse working); it is only a bug if styleSize
              // stops matching backing/dpr.
              alloc: c ? [c._allocW, c._allocH] : null,
              content: c ? [c._lastW, c._lastH] : null,
              drawnAtDpr: c ? c._lastDpr : null,
              liveDpr: dpr,
              transform: el.style.transform,
              drawnZoom: c ? c._drawnZoom : null,
              shrinkPending: !!(c && c._shrinkTimer),
            };
          } catch (e) { return { error: String(e) }; }
        })(),
        heapMB: (() => {
          try { return Math.round(performance.memory.usedJSHeapSize / 1e6); }
          catch { return null; }
        })(),
        layers: [],
      };
      map.eachLayer((layer) => {
        if (!(layer instanceof L.GridLayer)) return;
        const tiles = Object.values(layer._tiles || {});
        // Tile SOURCE resolution. `scale=2` in the Google vt URL should make
        // every tile 512px natural; a histogram showing 256s means the imagery
        // itself arrived degraded and the renderer is innocent.
        const byNaturalWidth = {};
        // Which LEVEL the loaded tiles actually sit at, vs tileZoom. This is
        // the discriminator for "blurry but the pixels are fine" vs "genuinely
        // coarse content": if the corner map rests at zoom 2 and the loaded
        // tiles are mostly z0/z1, the imagery IS upscaled — either the
        // ancestor-cover pass standing in for tiles that never arrived, or a
        // retained coarse level drawing above the current one (compare the
        // per-level zIndex + children below). Neither is a texture fault, so
        // __blurTest would not cure those; they need the load/prune path.
        const byZ = {};
        for (const t of tiles) {
          const w = t.el?.naturalWidth;
          if (w != null) byNaturalWidth[w] = (byNaturalWidth[w] || 0) + 1;
          const z = t.coords?.z;
          if (z != null) {
            const k = t.loaded ? `z${z}` : `z${z}-pending`;
            byZ[k] = (byZ[k] || 0) + 1;
          }
        }
        const info = {
          tileZoom: layer._tileZoom,
          noPrune: !!layer._noPrune,
          tiles: tiles.length,
          current: tiles.filter((t) => t.current).length,
          loaded: tiles.filter((t) => t.loaded).length,
          byNaturalWidth,
          byZ,
          levels: {},
        };
        for (const z in (layer._levels || {})) {
          const lv = layer._levels[z];
          info.levels[z] = {
            origin: lv.origin,
            zoom: lv.zoom,
            zIndex: lv.el?.style?.zIndex,
            transform: lv.el?.style?.transform,
            children: lv.el?.childElementCount,
          };
        }
        out.layers.push(info);
      });
      console.log('[__dumpMap]', JSON.stringify(out, null, 1));
      return out;
    };

    // BLUR TRIAGE: run while the imagery looks soft. Each step is a strictly
    // bigger hammer, so the FIRST one that cures it names the cause:
    //  1 redraw  — repaints the same camera. Cure = stale/insufficient draw.
    //  2 relayer — hides/reshows the canvas for two frames. Touches ZERO
    //              pixels; only forces Chrome to drop and re-upload the
    //              layer's GPU texture. Cure = texture degradation, i.e. the
    //              backing-churn family (that is what _resizeBacking targets).
    //  3 realloc — rebuilds the backing store itself. Cure here but not at 2
    //              points at the buffer contents rather than the texture.
    window.__blurTest = (step = 2) => {
      const c = map._wgCompositor;
      const el = map.getContainer()?.querySelector('.wg-tile-compositor');
      if (!el || !c) return 'no compositor on this map (DOM tile fallback)';
      if (step === 1) {
        try { map.invalidateSize({ pan: false, animate: false }); } catch {}
        c.draw();
        return 'redrew same camera — cured? => stale draw';
      }
      if (step === 3) {
        c._allocW = 0;
        c._allocH = 0;
        c._lastDpr = 0;
        c.draw();
        return 'reallocated backing — cured? => buffer contents, not texture';
      }
      el.style.display = 'none';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        el.style.display = '';
        console.log('[__blurTest] layer texture re-uploaded — cured? => GPU texture degradation');
      }));
      return 'relayering...';
    };
    return () => {
      try { delete window.__dumpMap; } catch {}
      try { delete window.__blurTest; } catch {}
    };
  }, [map]);
  return null;
});

// The old ZoomFix component (finish an in-flight pinch zoom on the next
// touchstart so TouchZoom._onTouchStart isn't swallowed and vectors reproject
// in lock-step with markers) now lives as an app-wide mechanism in
// lib/leafletSettleZoomAnim.js — every map gets the identical capture-phase
// touchstart settler via a Map init hook, plus settling at Map._stop().

/**
 * Leaflet 1.9.4 canvas-teardown guard (installed once, on the prototype so it
 * covers BOTH our shared polyline renderer and the map's own preferCanvas
 * default renderer). A redraw scheduled in the narrow window while the
 * renderer is being removed (round transitions unmount the map mid pan/zoom
 * constantly) fires its animation frame after `_destroyContainer` has deleted
 * the 2d context, crashing in `_clear` with "Cannot read properties of
 * undefined (reading 'save')" — upstream Leaflet #8577. `_redraw` is the
 * single choke point that touches the context (`_clear`/`_draw` are only ever
 * called from it), and skipping the orphaned redraw is correct, not a
 * suppression: a destroyed renderer has nothing to draw to, and a re-added one
 * gets a fresh context plus a full redraw from `onAdd`.
 */
let canvasTeardownGuardInstalled = false;
function installCanvasTeardownGuard(L) {
  if (canvasTeardownGuardInstalled || !L?.Canvas?.prototype?._redraw) return;
  canvasTeardownGuardInstalled = true;
  const origRedraw = L.Canvas.prototype._redraw;
  L.Canvas.prototype._redraw = function () {
    if (!this._ctx) {
      // Mirror _redraw's own state reset so a later legitimate redraw
      // starts clean instead of inheriting stale request/bounds.
      this._redrawRequest = null;
      this._redrawBounds = null;
      return;
    }
    origRedraw.call(this);
  };
}

/* ---------------------------------------------------------------------------
 *  Overlay layers — each is React.memo'd so unrelated parent re-renders
 *  (e.g. WebSocket-driven multiplayerState updates) don't recreate the
 *  underlying Leaflet objects.
 * ------------------------------------------------------------------------ */

const DestMarker = memo(function DestMarker({ location, icon }) {
  if (!location) return null;
  return <Marker position={{ lat: location.lat, lng: location.long }} icon={icon} />;
}, (a, b) =>
  a.icon === b.icon &&
  a.location?.lat === b.location?.lat &&
  a.location?.long === b.location?.long
);

// NO GLOW ON THIS LABEL, DELIBERATELY. Opponents' labels are NAMES and carry
// the owner's glow off their roster entry (PlayerLine below); this one says
// "Your guess", which is chrome, not identity — there is nobody to identify on
// your own pin. It briefly wore the viewer's sku, threaded all the way in from
// the session and across the mobile bridge, and it was the loudest thing on the
// map for the least information. See components/utils/guessPinLabel.js.
const YourGuessLayer = memo(function YourGuessLayer({
  pinPoint, location, icon, polylineRenderer, showLine, tooltipText,
}) {
  const pinLat = pinPoint?.lat;
  const pinLng = pinPoint?.lng;
  const locationLat = location?.lat;
  const locationLng = location?.long;
  // Memoized positions — react-leaflet does shallow ref compare; a stable
  // reference avoids re-syncing the underlying Leaflet Polyline on every
  // parent render (multiplayer state churns ~10x/sec).
  const linePositions = useMemo(() => {
    if (!showLine || pinLat == null || pinLng == null || locationLat == null || locationLng == null) return null;
    return [[pinLat, pinLng], [locationLat, locationLng]];
  }, [showLine, pinLat, pinLng, locationLat, locationLng]);

  // A NODE, not a string: Leaflet renders string content through innerHTML and
  // an element is appended as-is, so nothing here can ever become a markup
  // path. Recreated only when the text changes — see guessPinLabelNode.
  const tooltipContent = useMemo(() => guessPinLabelNode(tooltipText), [tooltipText]);

  if (!pinPoint) return null;
  return (
    <>
      <Marker position={pinPoint} icon={icon}>
        {/* Content goes in via Leaflet's `content` option, NOT React children:
            react-leaflet portals children into the tooltip only after it has
            opened and been positioned, so the first paint centers an EMPTY
            box — the text then lands half a width to the right until a
            post-paint update() re-centers it. `content` is measured before
            the first _setPosition, so frame 1 is correct. Keyed on the text
            because react-leaflet never syncs option changes to a live
            instance — a fresh node with a stale key is never shown. */}
        <Tooltip
          key={tooltipText}
          direction="top"
          offset={[0, -45]}
          opacity={1}
          permanent
          content={tooltipContent}
          position={{ lat: pinPoint.lat, lng: pinPoint.lng }}
        />
      </Marker>
      {linePositions && (
        <Polyline positions={linePositions} renderer={polylineRenderer} />
      )}
    </>
  );
});

const CountryGuessLayer = memo(function CountryGuessLayer({
  countryGuessPin, location, icon, polylineRenderer, tooltipText,
}) {
  const guessLat = countryGuessPin?.lat;
  const guessLng = countryGuessPin?.lng;
  const locationLat = location?.lat;
  const locationLng = location?.long;
  const linePositions = useMemo(() => {
    if (guessLat == null || guessLng == null || locationLat == null || locationLng == null) return null;
    return [
      [guessLat, guessLng],
      [locationLat, locationLng],
    ];
  }, [guessLat, guessLng, locationLat, locationLng]);

  // Same node-not-string content as YourGuessLayer, and for the same reason:
  // this is the country/continent mode's version of your own guess label. No
  // glow here either — same label, same rule.
  const tooltipContent = useMemo(() => guessPinLabelNode(tooltipText), [tooltipText]);

  if (!countryGuessPin || !location) return null;
  return (
    <>
      <Marker
        position={{ lat: countryGuessPin.lat, lng: countryGuessPin.lng }}
        icon={icon}
      >
        {/* `content` option instead of children — same first-paint
            mispositioning fix as YourGuessLayer's tooltip above. */}
        <Tooltip
          key={tooltipText}
          direction="top"
          offset={[0, -45]}
          opacity={1}
          permanent
          content={tooltipContent}
          position={{ lat: countryGuessPin.lat, lng: countryGuessPin.lng }}
        />
      </Marker>
      {linePositions && (
        <Polyline positions={linePositions} dashArray="8 8" renderer={polylineRenderer} />
      )}
    </>
  );
});

/**
 * One row per other multiplayer player. Memoized on player identity + guess
 * coords + the dest coords so a parent re-render with the same data is a no-op.
 */
const PlayerLine = memo(function PlayerLine({
  playerId, displayName, countryCode, guess, dest, icon, polylineRenderer,
  // Equipped name-glow sku. ⚠ A new per-player field has to be added in BOTH
  // places — the prop list here AND the comparator at the bottom of this
  // component. Miss the comparator and the pin renders once with whatever the
  // field was on first mount and never updates again, with no error anywhere.
  nameGlow = null,
  // Faded pins mark guesses still in motion (interim teammate placements).
  markerOpacity = 1,
}) {
  const guessLat = guess[0];
  const guessLng = guess[1];
  const destLat = dest?.lat;
  const destLng = dest?.long;
  const linePositions = useMemo(() => (
    destLat != null && destLng != null ? [[guessLat, guessLng], [destLat, destLng]] : null
  ), [guessLat, guessLng, destLat, destLng]);
  const glow = cachedNameGlowProps(nameGlow, GLOW_LIGHT, { ownBox: true });

  return (
    <>
      <Marker position={{ lat: guess[0], lng: guess[1] }} icon={icon} opacity={markerOpacity}>
        <Tooltip
          direction="top"
          offset={[0, -45]}
          opacity={markerOpacity < 1 ? 0.75 : 1}
          permanent
          position={{ lat: guess[0], lng: guess[1] }}
        >
          {/* Leaflet's tooltip chrome is WHITE and this text is forced black,
              so the glow takes the LIGHT variant — the dark neon is invisible
              here. CLASS *AND* INLINE STYLE, both: the inline stack is the
              static halo, the class is the only thing carrying the @keyframes
              (styles/nameGlow.css). This wore the shadow alone and so every
              animated sku sat still on the live map. A tooltip is portalled out
              of the React tree, not out of the document, so a global class
              reaches it; the mobile embed injects nameGlow.css itself
              (embed/entry.jsx). `ownBox` because this span is already a flex
              box. See components/utils/guessPinLabel.js — same label, one
              recipe. */}
          <span className={glow?.className} style={{ color: "black", display: 'flex', alignItems: 'center', gap: '4px', ...glow?.style }}>
            {displayName}
            {countryCode && (
              <CountryFlag countryCode={countryCode} style={{ fontSize: '0.9em', marginRight: '0' }} />
            )}
          </span>
        </Tooltip>
      </Marker>
      {linePositions && (
        <Polyline
          positions={linePositions}
          color="green"
          renderer={polylineRenderer}
        />
      )}
    </>
  );
}, (a, b) =>
  a.playerId === b.playerId &&
  a.displayName === b.displayName &&
  a.countryCode === b.countryCode &&
  a.nameGlow === b.nameGlow &&
  a.guess[0] === b.guess[0] &&
  a.guess[1] === b.guess[1] &&
  a.dest?.lat === b.dest?.lat &&
  a.dest?.long === b.dest?.long &&
  a.icon === b.icon &&
  (a.markerOpacity ?? 1) === (b.markerOpacity ?? 1)
);

const MultiplayerLayer = memo(function MultiplayerLayer({
  players, myId, dest, srcIcon, polylineRenderer, isCoolMath,
  // The whole memoized icon set, so an equipped marker skin can be resolved by
  // key (markerSkinIconKey) instead of needing one more prop per sku.
  icons = null,
  // Team games: teammates render with YOUR (blue src) pin so the map reads
  // team-vs-team, and each team's closest guesser renders ENLARGED so the
  // counting guess pops out. Callers pass ids + the matching icons.
  teammateIds = null, teammateIcon = null,
  bestIds = null, bigSrcIcon = null, bigTeammateIcon = null,
  // Best-guess team reveals: only these ids draw a guess→dest line (null =
  // everyone does). Non-best players keep their pin via dest=null, the same
  // pin-only path the interim teammate layer uses.
  lineIds = null,
  // Faded pins: guesses still in motion (teammate hasn't locked in yet).
  fadedIds = null,
}) {
  if (!Array.isArray(players)) return null;
  return players.map((player) => {
    if (player.id === myId || !player.guess) return null;
    const displayName = isCoolMath ? guestNameString(player.username) : player.username;
    const isTeammate = teammateIcon && teammateIds?.has?.(player.id);
    const base = isTeammate ? teammateIcon : srcIcon;
    const big = isTeammate ? bigTeammateIcon : bigSrcIcon;
    const isBest = !!bestIds?.has?.(player.id);
    // Pin priority: the player's purchased skin beats the stock team pin. A
    // skinned pin gives up the blue/green team colour by design: the skin IS
    // that player's identity, and the permanent name label on the tooltip
    // already says whose guess it is.
    const skinIcon = icons?.[markerSkinIconKey(player.markerSkin, isBest ? 'Big' : 'Small')];
    const icon = skinIcon || (big && isBest ? big : base);
    return (
      <PlayerLine
        key={player.id}
        playerId={player.id}
        displayName={displayName}
        countryCode={player.countryCode}
        nameGlow={player.nameGlow ?? null}
        guess={player.guess}
        dest={lineIds && !lineIds.has(player.id) ? null : dest}
        icon={icon}
        polylineRenderer={polylineRenderer}
        markerOpacity={fadedIds?.has?.(player.id) ? 0.55 : 1}
      />
    );
  });
});

/**
 * Hint circle — geospatial radius preserves on-screen size at world view
 * while staying anchored during pan/zoom (matches legacy CircleMarker behavior).
 */
const HintCircle = memo(function HintCircle({ location, gameOptions, round }) {
  const maxDist = gameOptions?.maxDist ?? 20000;
  const maxDistScale = maxDist / 20000;
  const latScale = Math.abs(Math.cos((location.lat * Math.PI) / 180));
  const radiusMeters = OLD_BASE_HINT_RADIUS_M_AT_EQUATOR * maxDistScale * latScale;

  const offsetCenter = useMemo(() => {
    const seed = (round ?? 1) + Math.abs(location.lat * 1000 + location.long * 1000);
    const offsetAngle = seededRandom(seed * 3) * 2 * Math.PI;
    const offsetAmount = Math.sqrt(seededRandom(seed * 7)) * radiusMeters;
    return destinationPoint(location.lat, location.long, offsetAmount, offsetAngle);
  }, [location.lat, location.long, radiusMeters, round]);

  return <Circle center={offsetCenter} radius={radiusMeters} className="hintCircle" />;
});

function copyLocation(location) {
  if (!location || location.lat == null || location.long == null) return null;
  return { ...location };
}

function copyCountryGuessPin(countryGuessPin) {
  if (!countryGuessPin || countryGuessPin.lat == null || countryGuessPin.lng == null) return null;
  return { lat: countryGuessPin.lat, lng: countryGuessPin.lng };
}

// ⚠ This is a PROJECTION, not a comparator. The reveal renders from THIS
// snapshot, not from the live roster, so a per-player field that is not copied
// here is simply gone by the time a pin is drawn — no error, no warning, just
// a plain pin and an unglowing tooltip on the one screen where a cosmetic is
// most visible. Copy the field; do not merely remember to compare it.
function copyMultiplayerAnswerPlayers(multiplayerState) {
  return (multiplayerState?.gameData?.players || []).map((player) => ({
    id: player.id,
    username: player.username,
    countryCode: player.countryCode,
    // Cosmetics frozen with the pins for the same reason `team` is: the reveal
    // must keep showing exactly what was on screen when the round ended.
    nameGlow: player.nameGlow ?? null,
    markerSkin: player.markerSkin ?? null,
    // Team frozen with the pins: a teammate disconnecting mid-reveal must not
    // flip their still-visible pin from teammate-blue to enemy-green.
    team: player.team ?? null,
    guess: player.guess ? [player.guess[0], player.guess[1]] : null,
  }));
}

function createAnswerSnapshot({ location, pinPoint, countryGuessPin, multiplayerState }) {
  return {
    location: copyLocation(location),
    pinPoint,
    countryGuessPin: copyCountryGuessPin(countryGuessPin),
    players: copyMultiplayerAnswerPlayers(multiplayerState),
  };
}

/* ===========================================================================
 *  Public component
 * ======================================================================== */

const MapComponent = ({
  shown,
  options,
  ws,
  session,
  myMarkerSkin: suppliedMarkerSkin,
  pinPoint,
  setPinPoint,
  answerShown,
  location,
  setKm,
  multiplayerState,
  showHint,
  round,
  gameOptions,
  countryGuessPin,
  stopCameraAnimations,
  resetKey,
  cameraCancelKey,
  onRevealReady,
  onTilesLoaded,
  bandFraction,
  lang,
  smoothReset,
  onResetComplete,
}) => {
  const { t: text } = useTranslation("common");
  // Single source of truth for "the reveal animation owns invalidateSize".
  // Lives on a ref so toggling it doesn't trigger renders.
  const resizingRef = useRef(false);
  const answerSnapshotRef = useRef(null);

  // Leaflet fires the tile layer's 'load' whenever the visible tile batch
  // finishes painting. Consumers (onboarding's show-map-while-pano-loads) use
  // the first firing as "safe to reveal without a white flash". Ref + stable
  // handler identity so the layer is never re-created for a callback change.
  const onTilesLoadedRef = useRef(onTilesLoaded);
  onTilesLoadedRef.current = onTilesLoaded;
  const tileEventHandlers = useMemo(() => ({
    load: () => { if (onTilesLoadedRef.current) onTilesLoadedRef.current(); },
  }), []);

  // The answer map can remain mounted while multiplayer has already advanced
  // live props to the next round. Freeze every answer overlay input at reveal
  // start so fade-out cannot expose the upcoming destination or clear old guesses.
  if (answerShown && !answerSnapshotRef.current && location) {
    answerSnapshotRef.current = createAnswerSnapshot({
      location,
      pinPoint,
      countryGuessPin,
      multiplayerState,
    });
  } else if (!answerShown && answerSnapshotRef.current) {
    answerSnapshotRef.current = null;
  }

  const answerSnapshot = answerSnapshotRef.current;
  const answerLocation = answerShown ? (answerSnapshot?.location || location) : location;
  const answerCountryGuessPin = answerShown ? (answerSnapshot?.countryGuessPin || countryGuessPin) : countryGuessPin;
  const answerPlayers = answerShown
    ? (answerSnapshot?.players || multiplayerState?.gameData?.players || [])
    : (multiplayerState?.gameData?.players || []);

  // My own guess pin normally comes from `pinPoint` — the spot I clicked, held in
  // this map's local React state. But that state lives inside the embed (a WebView
  // on mobile) and is wiped if it remounts/reloads — which happens when the app is
  // backgrounded or a profile is opened mid-reveal. Opponents and the destination
  // survive that (both prop/snapshot-driven), so without a fallback my pin silently
  // vanishes on the answer reveal even though the server scored my guess. Recover it
  // from my entry in the (snapshotted) players list — the same durable data that
  // draws everyone else. MultiplayerLayer skips my own id, so this is the ONLY thing
  // that renders my pin; the fallback only kicks in once the click-state is gone, so
  // normal reveals are unchanged.
  const myAnswerGuess = (() => {
    if (!answerShown) return null;
    const myId = multiplayerState?.gameData?.myId;
    const me = myId != null ? answerPlayers.find((p) => p.id === myId) : null;
    return me?.guess ? { lat: me.guess[0], lng: me.guess[1] } : null;
  })();
  const renderedPinPoint = answerShown ? (answerSnapshot?.pinPoint || pinPoint || myAnswerGuess) : pinPoint;

  // Single canvas renderer reused across all polylines. Canvas avoids the SVG
  // overlay-pane desync during pan/zoom (one shared transform pipeline with
  // tiles).
  const canvasRenderer = useMemo(() => {
    if (typeof window === 'undefined' || !window.L) return null;
    installCanvasTeardownGuard(window.L);
    return L.canvas({ padding: 0.5 });
  }, []);

  // Icons are cached globally; just pluck the references we need. Memoizing
  // prevents Marker children from seeing a "new icon" on every render.
  const icons = useMemo(() => {
    const shared = getPinIcons() || {};
    // Shop marker skins are carried through under the EXACT key
    // markerSkinIconKey() emits, so resolving a sku is a plain lookup and a
    // new sku added to the catalogue needs no change here.
    const skins = {};
    Object.values(MARKER_SKIN_ICONS).forEach((k) => {
      skins[`${k}Small`] = shared[`${k}Small`];
      skins[`${k}Mid`] = shared[`${k}Mid`];
      skins[`${k}Big`] = shared[`${k}Big`];
    });
    return {
      destSmall: shared.destSmall,
      destMid: shared.destMid,
      srcSmall: shared.srcSmall,
      srcMid: shared.srcMid,
      src2Small: shared.src2Small,
      srcBig: shared.srcBig,
      src2Big: shared.src2Big,
      ...skins,
    };
  }, []);

  // MY equipped skin. Mobile's WebView cannot carry the web session object, so
  // its host sends the sku explicitly. Web keeps resolving from the session,
  // and the multiplayer roster remains the final backfill for either client.
  const myMarkerSkin = suppliedMarkerSkin
    ?? session?.token?.cosmetics?.equipped?.markerSkin
    ?? multiplayerState?.gameData?.players?.find((p) => p.id === multiplayerState?.gameData?.myId)?.markerSkin
    ?? null;
  // THERE IS NO `myNameGlow` HERE ANY MORE, and it is not an oversight. The
  // viewer's glow was resolved exactly like the skin above (session, then a
  // host-supplied prop for the mobile WebView, then the roster) for one
  // consumer: the "Your guess" pin label. That label does not wear a glow —
  // it is chrome, not a name — so the whole chain came out, from here back
  // through the embed bridge. The SKIN stays: a pin is identity, a label that
  // says "Your guess" is not.
  // Same priority as MultiplayerLayer: purchased skin > stock pin. Falls back
  // whenever the skin's icon is missing (unknown sku, or Leaflet not loaded yet
  // and getPinIcons() returned nothing).
  const pinKeyFor = (skin, tier, fallbackKey) => {
    const key = markerSkinIconKey(skin, tier);
    return (key && icons[key]) ? key : fallbackKey;
  };
  // Singleplayer reveals hold exactly two markers, so your pin and the dest
  // wear the Mid 28x46 tier. Multiplayer keeps the Small tier: a full-roster
  // reveal is a pin CLUSTER, and Small is what keeps it readable.
  const inMultiplayer = Boolean(multiplayerState?.inGame);
  const myIconKey = inMultiplayer
    ? pinKeyFor(myMarkerSkin, 'Small', 'srcSmall')
    : pinKeyFor(myMarkerSkin, 'Mid', 'srcMid');
  const myBigIconKey = pinKeyFor(myMarkerSkin, 'Big', 'srcBig');
  const myIcon = icons[myIconKey];

  // Distance reporting: when reveal lands and we have both points, compute km.
  useEffect(() => {
    if (!(answerShown && renderedPinPoint && answerLocation)) return;
    const guessLatLng = typeof renderedPinPoint.distanceTo === "function"
      ? renderedPinPoint
      : L.latLng(renderedPinPoint.lat, renderedPinPoint.lng);
    const meters = guessLatLng.distanceTo({ lat: answerLocation.lat, lng: answerLocation.long });
    setKm(formatKm(meters));
  }, [answerShown, renderedPinPoint, answerLocation, setKm]);

  // Team reveal context: teammate ids (blue pins) + each team's BEST guesser
  // (enlarged pin). Scored with the game's own calcPoints so it matches
  // teamRoundScore, but exact point ties (capped 5000s / same rounded score
  // between close teammates) fall back to raw distance — only ONE pin per
  // team enlarges + draws its line (same rule as roundOverScreen/ResultsMap).
  const teamRevealCtx = useMemo(() => {
    const gd = multiplayerState?.gameData;
    if (!answerShown || !(gd?.team2v2 || gd?.teamGame) || !answerLocation) return null;
    // Teams come from the same frozen roster as the pins (answerPlayers IS
    // the reveal snapshot): reading the live roster here let a mid-reveal
    // disconnect flip a frozen pin from teammate-blue to enemy-green. Live
    // roster only backfills entries from pre-snapshot payloads.
    const live = gd?.players || [];
    const teamFor = (p) => p.team ?? live.find(g => g.id === p.id)?.team ?? null;
    const roster = (answerPlayers?.length ? answerPlayers : live);
    const myId = gd?.myId;
    const myTeam = roster.some(p => p.id === myId)
      ? teamFor(roster.find(p => p.id === myId))
      : live.find(p => p.id === myId)?.team;
    if (!myTeam) return null;
    const teammateIds = new Set(roster.filter(p => teamFor(p) === myTeam).map(p => p.id));
    // Under 'average' scoring no single guess "counted" — enlarging the
    // closest pin would be a lie, so nothing gets the big icon. lineIds
    // follows the same logic for the guess→dest lines: null = every guess
    // draws its line (average mode), a Set = only the counted guesses do
    // (best-guess modes) so the reveal isn't a tangle.
    if (gd?.teamGame && gd?.teamScoring === 'average') {
      return { myId, teammateIds, bestIds: new Set(), lineIds: null };
    }
    const maxDist = gameOptions?.maxDist ?? 20000;
    const entries = []; // { id, team, pts, dist }
    const consider = (id, team, lat, lng) => {
      if (!team || lat == null || lng == null) return;
      const pts = calcPoints({
        lat: answerLocation.lat, lon: answerLocation.long,
        guessLat: lat, guessLon: lng,
        usedHint: false, maxDist
      });
      entries.push({ id, team, pts, dist: findDistance(answerLocation.lat, answerLocation.long, lat, lng) });
    };
    (answerPlayers || []).forEach(p => {
      if (p.guess) consider(p.id, teamFor(p), p.guess[0], p.guess[1]);
    });
    if (renderedPinPoint) consider(myId, myTeam, renderedPinPoint.lat, renderedPinPoint.lng);
    const bestIds = pickBestTeamGuessIds(entries);
    return { myId, teammateIds, bestIds, lineIds: bestIds };
  }, [answerShown, answerLocation, answerPlayers, renderedPinPoint, gameOptions?.maxDist,
      multiplayerState?.gameData?.team2v2, multiplayerState?.gameData?.teamGame, multiplayerState?.gameData?.teamScoring,
      multiplayerState?.gameData?.players, multiplayerState?.gameData?.myId]);

  // Tooltip strings — captured once per language change so we don't churn
  // memoized layers.
  const yourGuessText = text("yourGuess");

  const isCoolMath = process.env.NEXT_PUBLIC_COOLMATH === "true";
  // Client-only map: read DPR once per mount for Google vt `scale`.
  const tileScale = useMemo(() => googleTileScale(), []);

  return (
    <MapContainer
      center={[0, 0]}
      zoom={2}
      minZoom={2}
      preferCanvas={true}
      // Crossfade the final raster level over the scaled level used during a
      // smooth camera glide. The tile layer below defers intermediate levels;
      // held pinch preloads one stable target, then uses one short crossfade.
      fadeAnimation={true}
      // Vertical clamp via viscosity 1.0 — drag is hard-walled at the bound
      // (Leaflet's drag handler reads this option at drag-start; default 0
      // means no clamp). Viscosity also clamps inertial pan, so momentum
      // works without overshooting the wall. Must be set at construction
      // because the drag handler captures it then.
      // The bounds themselves (vertical-only) are applied in <BoundsApplier>
      // so they can stay disabled while the answer is shown.
      maxBoundsViscosity={1.0}
      style={{ height: "100%", width: "100%" }}
    >
      <div className="mapAttr">
        <img
          width="60"
          src="https://lh3.googleusercontent.com/d_S5gxu_S1P6NR1gXeMthZeBzkrQMHdI5uvXrpn3nfJuXpCjlqhLQKH_hbOxTHxFhp5WugVOEcl4WDrv9rmKBDOMExhKU5KmmLFQVg"
          alt="Google"
        />
      </div>

      <CameraAnimationStopper active={stopCameraAnimations} cameraCancelKey={cameraCancelKey} resizingRef={resizingRef} />
      <BoundsApplier bounds={answerShown ? null : VIEW_BOUNDS} extent={gameOptions?.extent} smoothReset={smoothReset} />
      <ClickHandler
        answerShown={answerShown}
        multiplayerState={multiplayerState}
        ws={ws}
        setPinPoint={setPinPoint}
        pinPoint={pinPoint}
      />
      <ExtentFitter
        extent={gameOptions?.extent}
        answerShown={answerShown}
        shown={shown}
        resetKey={resetKey}
        smoothReset={smoothReset}
        onResetComplete={onResetComplete}
      />
      <RevealController
        answerShown={answerShown}
        dest={answerLocation}
        pinPoint={renderedPinPoint}
        countryGuessPin={answerCountryGuessPin}
        resizingRef={resizingRef}
        stopCameraAnimations={stopCameraAnimations}
        cameraCancelKey={cameraCancelKey}
        onRevealReady={onRevealReady}
        bandFraction={bandFraction}
      />
      <ContainerResizeBridge resizingRef={resizingRef} />

      {answerShown && (
        <DestMarker location={answerLocation} icon={inMultiplayer ? icons.destSmall : icons.destMid} />
      )}

      <YourGuessLayer
        pinPoint={renderedPinPoint}
        location={answerLocation}
        // Your pin enlarges too when YOU are your team's closest guesser.
        icon={teamRevealCtx?.bestIds?.has(teamRevealCtx.myId) && icons[myBigIconKey]
          ? icons[myBigIconKey]
          : myIcon}
        polylineRenderer={canvasRenderer}
        // Best-guess team reveals: your line only draws if YOUR guess counted.
        showLine={Boolean(answerShown && answerLocation
          && (!teamRevealCtx?.lineIds || teamRevealCtx.lineIds.has(teamRevealCtx.myId)))}
        tooltipText={yourGuessText}
      />

      {answerShown && (
        <CountryGuessLayer
          countryGuessPin={answerCountryGuessPin}
          location={answerLocation}
          icon={myIcon}
          polylineRenderer={canvasRenderer}
          tooltipText={yourGuessText}
        />
      )}

      {answerShown && multiplayerState?.inGame && answerLocation && (
        <MultiplayerLayer
          players={answerPlayers}
          myId={multiplayerState?.gameData?.myId}
          dest={answerLocation}
          srcIcon={icons.src2Small}
          teammateIds={teamRevealCtx?.teammateIds || null}
          teammateIcon={icons.srcSmall}
          bestIds={teamRevealCtx?.bestIds || null}
          lineIds={teamRevealCtx?.lineIds || null}
          bigSrcIcon={icons.src2Big}
          bigTeammateIcon={icons.srcBig}
          icons={icons}
          polylineRenderer={canvasRenderer}
          isCoolMath={isCoolMath}
        />
      )}

      {/* 2v2: show teammate's live (interim) guess during the guess phase */}
      {!answerShown && (multiplayerState?.gameData?.team2v2 || multiplayerState?.gameData?.teamGame) && multiplayerState?.gameData?.state === 'guess' && (() => {
        const myId = multiplayerState?.gameData?.myId;
        const players = multiplayerState?.gameData?.players || [];
        const myTeam = getMyTeam(players, myId);
        const mates = players
          .filter(p => p.id !== myId && p.team && p.team === myTeam && (p.latLong || p.guess))
          .map(p => ({ ...p, guess: p.latLong || p.guess }));
        if (!mates.length) return null;
        return (
          <MultiplayerLayer
            players={mates}
            myId={myId}
            dest={null}
            // This layer only ever contains teammates — blue, same as you.
            srcIcon={icons.srcSmall}
            icons={icons}
            polylineRenderer={canvasRenderer}
            isCoolMath={isCoolMath}
            // A locked teammate pin is a commitment; a faded one is still
            // moving — same signal the minimap status line gives in text.
            fadedIds={new Set(mates.filter(p => !p.final).map(p => p.id))}
          />
        );
      })()}

      {showHint && location && (
        <HintCircle location={location} gameOptions={gameOptions} round={round} />
      )}

      <TileLayer
        eventHandlers={tileEventHandlers}
        // Tiles repeat horizontally to give a continuous "world strip"
        // background as the user pans through the dateline.
        noWrap={false}
        // Hold one raster level through fly/fluid-wheel motion. During pinch,
        // the grouped-tile patch preloads only a briefly stable rounded target
        // while fingers remain down, avoiding both end-delay and per-frame churn.
        updateWhenZooming={false}
        // Leaflet's mobile default (true) starts tile REQUESTS only after the
        // drag ends — panning on phones felt like constantly waiting for
        // tiles that hadn't even been asked for yet. false = desktop
        // behavior everywhere: requests stream during the pan on a 200ms
        // cadence, so imagery is usually decoded by the time it's revealed.
        updateWhenIdle={false}
        // `lang` prop (mobile embed) drives the tile-label language deterministically;
        // web renders Map.js without it and falls back to the i18n's text("lang").
        // `scale` packs extra pixels into each 256 CSS tile — 4 on 3x phones so
        // labels aren't soft/blocky after the compositor upscales a 2x raster.
        url={`https://mt{s}.google.com/vt/lyrs=${options?.mapType ?? 'm'}&x={x}&y={y}&z={z}&hl=${lang || text("lang")}&scale=${tileScale}`}
        subdomains={['0', '1', '2', '3']}
        attribution='&copy; <a href="https://maps.google.com">Google</a>'
        maxZoom={22}
      />
    </MapContainer>
  );
};

// Memoized on purpose. GameUI ticks a 100ms multiplayer countdown for the whole
// match, so it re-renders ~10x/sec — and every one of those renders used to walk
// this entire Leaflet subtree (MapContainer + every overlay + the tile layer)
// even though not one map prop had changed. That React work landed ON TOP of the
// answer reveal, which is the frame budget's worst moment of the round: the
// container is CSS-animating to fullscreen while RevealController invalidates
// Leaflet once per frame and flyToBounds pulls a new tile set.
//
// Shallow prop compare is enough — every prop this takes is either a primitive,
// a useState setter, or an object whose identity is already stable between
// WebSocket messages (`multiplayerState`, `location`, `options`). The one
// callback prop (`onTilesLoaded`) is useCallback'd at the call site; if a new
// prop is added here, keep it referentially stable or this memo goes inert.
export default memo(MapComponent);
