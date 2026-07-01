import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from "react";
import dynamic from "next/dynamic";
import { Circle, Marker, Polyline, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { useTranslation } from '@/components/useTranslations';
import { getPinIcons } from '@/lib/markerIcons';
import 'leaflet/dist/leaflet.css';
import customPins from '../public/customPins.json' with { type: "module" };
import guestNameString from "@/serverUtils/guestNameFromString";
import CountryFlag from './utils/countryFlag';
import SafeMapContainer from './SafeMapContainer';

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
    target = map._getBoundsCenterZoom(bounds, { padding: L.point(EXTENT_FIT_PADDING) });
  } catch {
    target = {
      center: bounds.getCenter(),
      zoom: map.getBoundsZoom(bounds, false, EXTENT_FIT_PADDING),
    };
  }

  return constrainResetTarget(map, target.center, target.zoom);
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
  try {
    if (map._animatingZoom) {
      map._animatingZoom = false;
      delete map._animateToCenter;
      delete map._animateToZoom;
      delete map._tempFireZoomEvent;
      L?.DomUtil?.removeClass?.(map._mapPane, "leaflet-zoom-anim");
    }
  } catch {}
  try { map.stop(); } catch {}
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

function forceCrispViewReset(map, center, zoom) {
  // Resetting at 0×0 projects onto a degenerate viewport and lands on a garbage
  // centre; the size-gated callers re-run this once the container has real size.
  if (!hasRenderSize(map)) return;
  // During reveal Leaflet may be mid fly/pan/zoom animation. A normal fitBounds
  // can inherit that pixel origin and leave scaled, blurry tiles until the user
  // zooms. Cancel animation state first, then apply a target already constrained
  // to the vertical play bounds so the next user interaction has nothing to snap.
  const playBounds = toValidLatLngBounds(VIEW_BOUNDS);
  stopMapAnimations(map);
  try { map.invalidateSize({ pan: false, animate: false }); } catch {}
  const target = constrainResetTarget(map, center, zoom, playBounds);

  setMaxBoundsWithoutAutoPan(map, null);
  try { map.setView(target.center, target.zoom, { animate: false, reset: true }); } catch {}
  try { map._resetView?.(target.center, target.zoom, true); } catch {}
  stopMapAnimations(map);
  setMaxBoundsWithoutAutoPan(map, playBounds);
  try { map.panInsideBounds(playBounds, { animate: false }); } catch {}
  try { map._resetView?.(map.getCenter(), map.getZoom(), true); } catch {}
  try { map.invalidateSize({ pan: false, animate: false }); } catch {}
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
  answerShown, multiplayerState, ws, setPinPoint,
}) {
  const ref = useRef({ answerShown, multiplayerState, ws });
  useEffect(() => {
    ref.current = { answerShown, multiplayerState, ws };
  }, [answerShown, multiplayerState, ws]);

  useMapEvents({
    click(e) {
      const { answerShown: shown, multiplayerState: mp, ws: socket } = ref.current;
      if (shown) return;
      const me = mp?.gameData?.players?.find(p => p.id === mp?.gameData?.myId);
      if (mp?.inGame && me?.final) return;

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
        const center = map.getCenter();
        map.setView([center.lat, center.lng - lngShift], map.getZoom(), { animate: false });
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
const BoundsApplier = memo(function BoundsApplier({ bounds, extent }) {
  const map = useMap();
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
    try { map.invalidateSize({ pan: false, animate: false }); } catch {}
  }, [map, active, cameraCancelKey, resizingRef]);
  return null;
});

/**
 * Fits the map to a custom extent during the guessing phase. It waits for the
 * minimap to be visible so Leaflet computes zoom from the real play viewport.
 */
const ExtentFitter = memo(function ExtentFitter({ extent, answerShown, shown, resetKey }) {
  const map = useMap();
  const [resettingCamera, setResettingCamera] = useState(false);
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
      if (answerShown) needsFitRef.current = true;
      setResettingCamera(false);
      return;
    }

    if (!needsFitRef.current) {
      requestAnimationFrame(() => {
        try { map.invalidateSize({ pan: false, animate: false }); } catch {}
      });
      return;
    }

    // "Play again" from the summary keeps this Leaflet map mounted, then
    // starts a hidden loading phase. Fit only after the minimap is visible
    // again and its container has reported the same size for a few frames.
    setResettingCamera(true);
    const container = map.getContainer();
    let cancelled = false;
    let rafId = null;
    let finalRafId = null;
    let fallbackTimer = null;
    let lastW = container?.clientWidth ?? 0;
    let lastH = container?.clientHeight ?? 0;
    let stableFrames = 0;
    const STABLE_FRAMES_REQUIRED = 3;

    const applyFit = () => {
      if (cancelled) return;
      cancelled = true;
      if (rafId != null) cancelAnimationFrame(rafId);
      if (fallbackTimer != null) clearTimeout(fallbackTimer);
      try {
        const target = getResetTarget(map, extent);
        forceCrispViewReset(map, target.center, target.zoom);
        finalRafId = requestAnimationFrame(() => {
          // Re-derive the canonical target rather than trusting getCenter(): between
          // the reset above and this frame, the hard maxBounds clamp (viscosity 1.0)
          // can shove a tall low-zoom viewport to the ±85° edge. Reading getCenter()
          // here cemented that drift (logged target≈72°N instead of 30,0); re-fitting
          // to getResetTarget snaps it back to the intended world/extent view.
          try {
            const t = getResetTarget(map, extent);
            forceCrispViewReset(map, t.center, t.zoom);
          } catch {}
          needsFitRef.current = false;
          setResettingCamera(false);
        });
      } catch {
        setResettingCamera(false);
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
  useLayoutEffect(() => {
    if (!answerShown || !map || !(bandFraction > 0 && bandFraction < 1)) return;
    try {
      const s0 = map.getSize();
      const anchor = map.containerPointToLatLng([s0.x / 2, s0.y]);
      map.invalidateSize({ animate: false });
      const s1 = map.getSize();
      const cur = map.latLngToContainerPoint(anchor);
      map.panBy(cur.subtract([s1.x / 2, s1.y]), { animate: false });
    } catch (e) {}
  }, [map, answerShown, bandFraction]);

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
          map.flyToBounds(bounds, { duration: durationSec });
        } else if (countryGuessPin) {
          durationSec = REVEAL.flyDurations.country;
          const bounds = L.latLngBounds(
            [{ lat: countryGuessPin.lat, lng: countryGuessPin.lng }, { lat: dest.lat, lng: dest.long }]
          ).pad(0.5);
          map.flyToBounds(bounds, { duration: durationSec });
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
  return null;
});

/**
 * Finishes an in-flight PINCH zoom the instant the next touch gesture starts.
 * While a zoom animation runs, Leaflet's `_animatingZoom` flag makes
 * `TouchZoom._onTouchStart` bail, so a fast second pinch (and the first pan/tap
 * after a pinch) is swallowed — the "every other zoom rejected" mobile bug.
 * Finishing the in-flight zoom on `touchstart` (capture phase, before Leaflet's
 * own handlers) unblocks it.
 *
 * We FINISH the zoom via Leaflet's own `_onZoomTransitionEnd` — we do NOT abort it
 * with `stopMapAnimations`. Aborting only clears `_animatingZoom` and strips the
 * `leaflet-zoom-anim` class; it never fires `zoomend`, so the canvas renderer's
 * `_onZoomEnd → path._project()` never runs and every vector (guess/answer lines,
 * opponent lines, hint circle) keeps the pixel geometry (`_rings`) it had at the
 * PREVIOUS committed zoom. Markers re-derive their position from lat/lng on every
 * `zoom` event (Marker.getEvents), so they stay glued to the map while the vectors
 * sit at a stale offset — the "lines detach from the pins during fast pan/zoom,
 * then snap back on a clean zoom" glitch (mobile-only because this handler is
 * touch-only). `_onZoomTransitionEnd` commits the in-flight zoom to its target AND
 * fires the normal zoom/move(end) events, so the renderer reprojects the vectors in
 * lock-step with the markers. It only runs while a pinch settle is in flight
 * (`_animatingZoom`); a camera-controller fly uses `_flyToFrame` and never sets that
 * flag, so this can't disturb RevealController / ExtentFitter. (Mirrors the
 * standalone LeafletMap fallback.)
 *
 * TOUCH-ONLY by design. On desktop, zoom is the mouse wheel, and Leaflet's
 * ScrollWheelZoom already accumulates wheel deltas and drives its own animation
 * correctly. Intercepting `wheel`/`mousedown` here aborted that animation
 * mid-flight on every tick (clearing `_animatingZoom`, stripping the
 * `leaflet-zoom-anim` class), desyncing the pane transform from the zoom level
 * and making desktop zoom jump wildly. Leaving those paths to Leaflet restores
 * the original (master) desktop behaviour while keeping the mobile pinch fix.
 */
const ZoomFix = memo(function ZoomFix() {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const container = map.getContainer?.();
    if (!container) return;
    const finishZoom = () => {
      if (map._animatingZoom) {
        // Finish (don't abort) the settle so the canvas renderer reprojects its
        // vectors to the committed zoom — keeping them locked to the markers.
        try { map._onZoomTransitionEnd(); } catch {}
      }
    };
    container.addEventListener("touchstart", finishZoom, true);
    return () => {
      container.removeEventListener("touchstart", finishZoom, true);
    };
  }, [map]);
  return null;
});

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

  if (!pinPoint) return null;
  return (
    <>
      <Marker position={pinPoint} icon={icon}>
        <Tooltip
          direction="top"
          offset={[0, -45]}
          opacity={1}
          permanent
          position={{ lat: pinPoint.lat, lng: pinPoint.lng }}
        >
          {tooltipText}
        </Tooltip>
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

  if (!countryGuessPin || !location) return null;
  return (
    <>
      <Marker
        position={{ lat: countryGuessPin.lat, lng: countryGuessPin.lng }}
        icon={icon}
      >
        <Tooltip
          direction="top"
          offset={[0, -45]}
          opacity={1}
          permanent
          position={{ lat: countryGuessPin.lat, lng: countryGuessPin.lng }}
        >
          {tooltipText}
        </Tooltip>
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
}) {
  const guessLat = guess[0];
  const guessLng = guess[1];
  const destLat = dest?.lat;
  const destLng = dest?.long;
  const linePositions = useMemo(() => (
    destLat != null && destLng != null ? [[guessLat, guessLng], [destLat, destLng]] : null
  ), [guessLat, guessLng, destLat, destLng]);

  return (
    <>
      <Marker position={{ lat: guess[0], lng: guess[1] }} icon={icon}>
        <Tooltip
          direction="top"
          offset={[0, -45]}
          opacity={1}
          permanent
          position={{ lat: guess[0], lng: guess[1] }}
        >
          <span style={{ color: "black", display: 'flex', alignItems: 'center', gap: '4px' }}>
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
  a.guess[0] === b.guess[0] &&
  a.guess[1] === b.guess[1] &&
  a.dest?.lat === b.dest?.lat &&
  a.dest?.long === b.dest?.long &&
  a.icon === b.icon
);

const MultiplayerLayer = memo(function MultiplayerLayer({
  players, myId, dest, srcIcon, polandballIcon, polylineRenderer, isCoolMath,
}) {
  if (!Array.isArray(players)) return null;
  return players.map((player) => {
    if (player.id === myId || !player.guess) return null;
    const displayName = isCoolMath ? guestNameString(player.username) : player.username;
    const icon = customPins[displayName] === "polandball" ? polandballIcon : srcIcon;
    return (
      <PlayerLine
        key={player.id}
        playerId={player.id}
        displayName={displayName}
        countryCode={player.countryCode}
        guess={player.guess}
        dest={dest}
        icon={icon}
        polylineRenderer={polylineRenderer}
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

function copyMultiplayerAnswerPlayers(multiplayerState) {
  return (multiplayerState?.gameData?.players || []).map((player) => ({
    id: player.id,
    username: player.username,
    countryCode: player.countryCode,
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
  bandFraction,
  lang,
}) => {
  const { t: text } = useTranslation("common");
  // Single source of truth for "the reveal animation owns invalidateSize".
  // Lives on a ref so toggling it doesn't trigger renders.
  const resizingRef = useRef(false);
  const answerSnapshotRef = useRef(null);

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
    return L.canvas({ padding: 0.5 });
  }, []);

  // Icons are cached globally; just pluck the references we need. Memoizing
  // prevents Marker children from seeing a "new icon" on every render.
  const icons = useMemo(() => {
    const shared = getPinIcons() || {};
    return {
      dest: shared.destSmall,
      src: shared.srcSmall,
      src2: shared.src2Small,
      polandball: shared.polandball,
    };
  }, []);

  const myUsername = session?.token?.username;
  const myIconKey = customPins[myUsername] === "polandball" ? "polandball" : "src";
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

  // Tooltip strings — captured once per language change so we don't churn
  // memoized layers.
  const yourGuessText = text("yourGuess");

  const isCoolMath = process.env.NEXT_PUBLIC_COOLMATH === "true";

  return (
    <MapContainer
      center={[0, 0]}
      zoom={2}
      minZoom={2}
      preferCanvas={true}
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
      <BoundsApplier bounds={answerShown ? null : VIEW_BOUNDS} extent={gameOptions?.extent} />
      <ClickHandler
        answerShown={answerShown}
        multiplayerState={multiplayerState}
        ws={ws}
        setPinPoint={setPinPoint}
      />
      <ExtentFitter extent={gameOptions?.extent} answerShown={answerShown} shown={shown} resetKey={resetKey} />
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
      <ZoomFix />

      {answerShown && (
        <DestMarker location={answerLocation} icon={icons.dest} />
      )}

      <YourGuessLayer
        pinPoint={renderedPinPoint}
        location={answerLocation}
        icon={myIcon}
        polylineRenderer={canvasRenderer}
        showLine={Boolean(answerShown && answerLocation)}
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
          srcIcon={icons.src2}
          polandballIcon={icons.polandball}
          polylineRenderer={canvasRenderer}
          isCoolMath={isCoolMath}
        />
      )}

      {/* 2v2: show teammate's live (interim) guess during the guess phase */}
      {!answerShown && multiplayerState?.gameData?.team2v2 && multiplayerState?.gameData?.state === 'guess' && (() => {
        const myId = multiplayerState?.gameData?.myId;
        const players = multiplayerState?.gameData?.players || [];
        const myTeam = players.find(p => p.id === myId)?.team;
        const mates = players
          .filter(p => p.id !== myId && p.team && p.team === myTeam && (p.latLong || p.guess))
          .map(p => ({ ...p, guess: p.latLong || p.guess }));
        if (!mates.length) return null;
        return (
          <MultiplayerLayer
            players={mates}
            myId={myId}
            dest={null}
            srcIcon={icons.src2}
            polandballIcon={icons.polandball}
            polylineRenderer={canvasRenderer}
            isCoolMath={isCoolMath}
          />
        );
      })()}

      {showHint && location && (
        <HintCircle location={location} gameOptions={gameOptions} round={round} />
      )}

      <TileLayer
        // Tiles repeat horizontally to give a continuous "world strip"
        // background as the user pans through the dateline.
        noWrap={false}
        // Disable the 200ms opacity fade-in. When the click handler shifts
        // the camera by a 360° lng wrap, Leaflet rebuilds the tile pane and
        // newly-added tiles would otherwise spend ~13 frames at <1 opacity,
        // showing the bare container behind them. Underlying images are the
        // same as the wrap copies the user was already viewing (browser
        // cache hit), so painting them at full opacity is correct and
        // makes the wrap-snap effectively invisible.
        fadeAnimation={false}
        // `lang` prop (mobile embed) drives the tile-label language deterministically;
        // web renders Map.js without it and falls back to the i18n's text("lang").
        url={`https://mt{s}.google.com/vt/lyrs=${options?.mapType ?? 'm'}&x={x}&y={y}&z={z}&hl=${lang || text("lang")}&scale=2`}
        subdomains={['0', '1', '2', '3']}
        attribution='&copy; <a href="https://maps.google.com">Google</a>'
        maxZoom={22}
      />
    </MapContainer>
  );
};

export default MapComponent;
