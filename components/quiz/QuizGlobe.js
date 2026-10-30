// The quiz click surface: a MapLibre globe drawn from our own country polygons
// (public/modes/countries.json) over a starfield. No tiles, no labels, no
// third-party style: the land is the data, so there is nothing to read and
// nothing to rate-limit.
//
// The motion follows MapFinder's globe: the planet scales in while the camera
// eases onto it; the reveal is ONE flight whose answer lands inside it (wash
// and flag at 80%), with the guess-to-answer arc drawn on the same clock; and
// between rounds the camera only pulls back, it never pans toward the next
// answer.
//
// Declarative outside, imperative inside: QuizGame passes `pin`, `reveal`,
// `roundKey` and `insets` (the screen area the card covers); effects reconcile
// the map to them, and `onLanded(revealId)` fires when the reveal flight has
// arrived so the card can show the result on that beat.

import { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, Marker, LngLat, LngLatBounds, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { asset } from '@/lib/basePath';
import { haversineKm } from '../../shared/modes/score.js';
import { flagSrc } from '../modes/quizClient';
import { countryFeatures } from './loadCountries';
import { isDocked } from './layout';

// MapLibre 6 finds its worker next to its own import.meta.url, which webpack
// rewrites to a non-http URL, so no worker starts and no country draws. Emit
// the (self-contained) worker file as an asset and point MapLibre at it. The
// path is relative on purpose: Next rejects a bare package path in new URL().
setWorkerUrl(new URL('../../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).href);

const LAND = 'quiz-land';
const EMPTY = { type: 'FeatureCollection', features: [] };
const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

const OCEAN = '#0b2231';
const LAND_FILL = '#2c5638';
const HOVER_FILL = '#3d7a4e';
const PICKED_FILL = '#3a8fd6';
const ANSWER_FILL = '#4ade80';
const FLARE_FILL = '#eafff0';
// How a find went (MapFinder's colours): first try, a later try, not found.
const TIER_FILL = { first: ANSWER_FILL, few: '#fcd34d', missed: '#fda4af' };
// Countries answered earlier in the run, on the land (quieter than a wash).
const DONE_FILL = { first: '#3f9f62', few: '#b8952f', missed: '#b23a49' };
const WRONG_FLARE = '#ffb3c1';
// A click's flash, by how it went (QuizFind's stamp).
const STAMP_FLARE = { first: ANSWER_FILL, few: '#fcd34d', missed: '#fda4af', wrong: WRONG_FLARE };
// How long a click's name stands on the globe before it fades.
const LABEL_MS = 2200;

const STYLE = {
  version: 8,
  projection: { type: 'globe' },
  // Transparent sky: the CSS starfield and glow behind the canvas are the space.
  sky: { 'sky-color': 'rgba(0,0,0,0)', 'horizon-color': 'rgba(0,0,0,0)', 'fog-color': 'rgba(0,0,0,0)', 'atmosphere-blend': 0 },
  sources: {
    countries: { type: 'geojson', data: asset('/modes/countries.json'), promoteId: 'code' },
    answer: { type: 'geojson', data: EMPTY },
    flare: { type: 'geojson', data: EMPTY },
    arc: { type: 'geojson', data: EMPTY },
    arcHead: { type: 'geojson', data: EMPTY },
    hint: { type: 'geojson', data: EMPTY },
  },
  layers: [
    { id: 'quiz-ocean', type: 'background', paint: { 'background-color': OCEAN } },
    {
      id: LAND,
      type: 'fill',
      source: 'countries',
      paint: {
        'fill-color': [
          'case',
          ['boolean', ['feature-state', 'picked'], false], PICKED_FILL,
          ['boolean', ['feature-state', 'hover'], false], HOVER_FILL,
          ['==', ['feature-state', 'done'], 'first'], DONE_FILL.first,
          ['==', ['feature-state', 'done'], 'few'], DONE_FILL.few,
          ['==', ['feature-state', 'done'], 'missed'], DONE_FILL.missed,
          LAND_FILL,
        ],
      },
    },
    {
      id: 'quiz-answer',
      type: 'fill',
      source: 'answer',
      paint: { 'fill-color': ANSWER_FILL, 'fill-opacity': 0, 'fill-opacity-transition': { duration: 700, delay: 0 } },
    },
    {
      id: 'quiz-flare',
      type: 'fill',
      source: 'flare',
      paint: { 'fill-color': FLARE_FILL, 'fill-opacity': 0, 'fill-opacity-transition': { duration: 120, delay: 0 } },
    },
    {
      id: 'quiz-borders',
      type: 'line',
      source: 'countries',
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': 'rgba(6, 20, 12, 0.75)',
        'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.5, 5, 1.4],
      },
    },
    {
      id: 'quiz-hint',
      type: 'line',
      source: 'hint',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#fda4af', 'line-width': 3, 'line-opacity': 0, 'line-opacity-transition': { duration: 300, delay: 0 } },
    },
    {
      id: 'quiz-arc-glow',
      type: 'line',
      source: 'arc',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#9fd8ff', 'line-width': 9, 'line-opacity': 0.22, 'line-blur': 6, 'line-opacity-transition': { duration: 400, delay: 0 } },
    },
    {
      id: 'quiz-arc',
      type: 'line',
      source: 'arc',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': 2.4, 'line-dasharray': [2, 1.6], 'line-opacity': 0.95, 'line-opacity-transition': { duration: 400, delay: 0 } },
    },
    {
      id: 'quiz-arc-head-glow',
      type: 'circle',
      source: 'arcHead',
      paint: { 'circle-radius': 12, 'circle-color': '#9fd8ff', 'circle-opacity': 0.4, 'circle-blur': 1, 'circle-pitch-alignment': 'map' },
    },
    {
      id: 'quiz-arc-head',
      type: 'circle',
      source: 'arcHead',
      paint: { 'circle-radius': 4.5, 'circle-color': '#ffffff', 'circle-blur': 0.3, 'circle-pitch-alignment': 'map' },
    },
  ],
};

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
const easeInCubic = (t) => t * t * t;
// Flat at the whole-globe view, tilting as the reveal closes in on a country.
const pitchForZoom = (z) => Math.min(1, Math.max(0, (z - 3) / 4)) * 30;

// The globe keeps its on-screen size while the centre moves toward a pole by
// changing the zoom number: compare zooms with this taken out.
const latScale = (lat) => Math.log2(Math.cos(Math.min(Math.abs(lat), 85.05) * Math.PI / 180));

const BEAT_MS = 450; // pin + verdict sound first, then the camera
// A hit: the player is already looking at the country, so the camera goes
// sooner and quicker (the round then moves on by itself).
const HIT_BEAT_MS = 200;
const REVEAL_MAX_ZOOM = 5.2;
const START_LNGS = [-60, 15, 80, 120];

// A region run frames its region instead of the whole planet: the opening
// flight lands on it and every round pulls back to it. Hand-set boxes of a
// continent's own countries, not every far-flung territory: Europe is its
// dense core, Portugal to Ukraine and Greece to southern Scandinavia (Iceland,
// the far north and Russia are a short pan away), Oceania runs across 180.
const REGION_VIEW = {
  Europe: [[-11, 35], [36, 61]],
  Africa: [[-20, -36], [52, 38]],
  Asia: [[25, -11], [150, 56]],
  'North America': [[-130, 6], [-56, 62]],
  'South America': [[-82, -56], [-34, 13]],
  Oceania: [[112, -47], [190, 12]],
};

// The planet's on-screen circle. The camera has perspective, so it is found,
// not derived: a screen point is on the planet when unproject -> project
// returns it (MapFinder's test), bisected outward from a start point. Flat,
// the circle is centred on the map centre; tilted (the reveal pitches the
// camera), the planet sits lower than the point the camera looks at, so the
// centre comes from the top and bottom edges and the radius is measured
// across that centre. The glow and shading follow this circle.
function edgeDistance(map, x, y, dx, dy) {
  let lo = 0;
  let hi = 20000;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const px = x + dx * mid;
    const py = y + dy * mid;
    const back = map.project(map.unproject([px, py]));
    if (Math.abs(back.x - px) < 1.5 && Math.abs(back.y - py) < 1.5) lo = mid;
    else hi = mid;
  }
  return lo;
}
function globeMetrics(map) {
  const p = map.project(map.getCenter());
  if (map.getPitch() < 0.5) return { x: p.x, y: p.y, r: edgeDistance(map, p.x, p.y, 1, 0) };
  const up = edgeDistance(map, p.x, p.y, 0, -1);
  const down = edgeDistance(map, p.x, p.y, 0, 1);
  const y = p.y + (down - up) / 2;
  return { x: p.x, y, r: edgeDistance(map, p.x, y, 1, 0) };
}

// The zoom at which the whole, untilted planet fills 92% of the free screen
// area. Perspective makes the radius only roughly 2^zoom, so a few probes
// converge on it; the camera is restored before anything paints.
function homeZoom(map, ins) {
  const el = map.getContainer();
  const w = el.clientWidth - ins.left - ins.right;
  const h = el.clientHeight - ins.top - ins.bottom;
  if (w <= 0 || h <= 0) return map.getZoom();
  // A docked card leaves a width-bound area: run the planet nearly edge to edge.
  const target = (isDocked() ? 0.49 : 0.46) * Math.min(w, h);
  const saved = { center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() };
  let z = saved.zoom;
  for (let i = 0; i < 4; i++) {
    map.jumpTo({ zoom: z, pitch: 0, bearing: 0 });
    const { r } = globeMetrics(map);
    if (!r || !Number.isFinite(r)) break;
    const step = Math.log2(target / r);
    z += step;
    if (Math.abs(step) < 0.005) break;
  }
  map.jumpTo(saved);
  return z;
}

// Great-circle path, longitudes unwrapped so the line never loops the globe.
function greatCircle(a, b, steps = 160) {
  const rad = Math.PI / 180;
  const vec = (p) => [Math.cos(p.lat * rad) * Math.cos(p.lng * rad), Math.cos(p.lat * rad) * Math.sin(p.lng * rad), Math.sin(p.lat * rad)];
  const va = vec(a);
  const vb = vec(b);
  const om = Math.acos(Math.min(1, Math.max(-1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2])));
  const out = [];
  let prev = null;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let v = va;
    if (om > 1e-6) {
      const s = Math.sin(om);
      const k1 = Math.sin((1 - t) * om) / s;
      const k2 = Math.sin(t * om) / s;
      v = [k1 * va[0] + k2 * vb[0], k1 * va[1] + k2 * vb[1], k1 * va[2] + k2 * vb[2]];
    }
    const lat = Math.atan2(v[2], Math.hypot(v[0], v[1])) / rad;
    let lng = Math.atan2(v[1], v[0]) / rad;
    if (prev != null) {
      while (lng - prev > 180) lng -= 360;
      while (lng - prev < -180) lng += 360;
    }
    prev = lng;
    out.push([lng, lat]);
  }
  return out;
}

// Frame the answer country, with the guess too when it was a near miss, inside
// the free area. A wide miss frames the answer alone (the arc tells the rest):
// a box spanning half the planet has no sensible fit on a globe.
//
// Every zoom here is compared with the latitude taken out (latScale): the
// same zoom number shows a far bigger planet centred at 70N than at the
// equator, which flew Canada in three times too close. The country shows
// whole with room around it, a step back from a tight fit; only a speck (an
// island) rides up to the cap. Never wider than the planet view.
const NEAR_MISS_KM = 1800;
const REVEAL_STEP_BACK = 1;
function revealCamera(map, reveal, homeNorm, km) {
  // A phone shows a quarter of the ground a laptop does at the same zoom:
  // stay a step wider so the neighbours stay in view.
  const capNorm = REVEAL_MAX_ZOOM - (map.getContainer().clientWidth <= 600 ? 0.9 : 0);
  let center = [reveal.answerPoint.lng, reveal.answerPoint.lat];
  // No box (a country across 180): a little closer than the planet view.
  let wantNorm = homeNorm + 1;
  if (reveal.bounds) {
    const b = new LngLatBounds(reveal.bounds[0], reveal.bounds[1]);
    if (reveal.guess && km < NEAR_MISS_KM) {
      // Unwrap next to the box, or a Fiji click on a Tonga round makes a
      // 354-degree box centred on the far side of the planet.
      const mid = (b.getWest() + b.getEast()) / 2;
      let g = reveal.guess.lng;
      while (g - mid > 180) g -= 360;
      while (g - mid < -180) g += 360;
      b.extend([g, reveal.guess.lat]);
    }
    const cam = map.cameraForBounds(b, { padding: 48 });
    if (cam) {
      wantNorm = cam.zoom - latScale(LngLat.convert(cam.center).lat) - REVEAL_STEP_BACK;
      // The country's middle, not the mercator middle of its box (which sits
      // far north for Canada or Russia).
      center = [(b.getWest() + b.getEast()) / 2, (b.getSouth() + b.getNorth()) / 2];
    }
  }
  const norm = Math.min(capNorm, Math.max(homeNorm, wantNorm));
  return { center, zoom: norm + latScale(center[1]), pitch: pitchForZoom(norm), bearing: 0 };
}

function pinElement() {
  const el = document.createElement('div');
  el.className = 'quizPin';
  const ring = document.createElement('span');
  ring.className = 'quizPin__ring';
  const img = document.createElement('img');
  img.className = 'quizPin__img';
  img.src = asset('/src-v2.png');
  img.alt = '';
  img.draggable = false;
  el.append(ring, img);
  return el;
}

// The answer marker: the round's own flag planted at the country.
function poleElement(code, hit) {
  const el = document.createElement('div');
  el.className = hit ? 'quizPole quizPole--hit' : 'quizPole';
  const span = (cls) => { const n = document.createElement('span'); n.className = cls; return n; };
  const flag = document.createElement('img');
  flag.className = 'quizPole__flag';
  flag.src = flagSrc(code, 80);
  flag.alt = '';
  flag.draggable = false;
  el.append(span('quizPole__dust'), span('quizPole__ring'), span('quizPole__ring quizPole__ring--late'), span('quizPole__stick'), flag);
  return el;
}

// A wrong try's name, standing where the player clicked.
function tryLabelElement(text) {
  const el = document.createElement('div');
  el.className = 'quizTryLabel';
  const span = document.createElement('span');
  span.className = 'quizTryLabel__text';
  span.textContent = text;
  el.append(span);
  return el;
}

// A circle of `km` around a point, as a closed line (the out-of-tries ring).
function ringLine(lat, lng, km) {
  const rad = Math.PI / 180;
  const d = km / 6371;
  const la = lat * rad;
  const lo = lng * rad;
  const coords = [];
  for (let i = 0; i <= 96; i++) {
    const b = (i / 96) * 2 * Math.PI;
    const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
    const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
    coords.push([lo2 / rad, la2 / rad]);
  }
  // Unwrapped next to each other, so the ring never loops the globe.
  for (let i = 1; i < coords.length; i++) {
    while (coords[i][0] - coords[i - 1][0] > 180) coords[i][0] -= 360;
    while (coords[i][0] - coords[i - 1][0] < -180) coords[i][0] += 360;
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } };
}

// An ocean click: a ripple, no try spent.
function splashElement() {
  const el = document.createElement('div');
  el.className = 'quizSplash';
  return el;
}

// The home camera: the whole planet, or the region's box fitted into the
// free area (never wider than the planet view). Sets homeRef (zoom),
// homeCenterRef (null = keep the centre) and homeNormRef (decor fade).
// The camera that shows a region's box whole inside the free area (the screen
// minus the insets, less a margin). MapLibre's cameraForBounds ignores the
// padding on the globe, so this probes: project the box's outline (its
// edges bow on a sphere, so several points per edge), scale the zoom by the
// shortfall and re-centre on the outline, a few times; the camera is
// restored before anything paints.
function fitBox(map, ins, box) {
  const el = map.getContainer();
  const W = el.clientWidth;
  const H = el.clientHeight;
  // A region may run up under the navbar band (the docked layouts keep 104px
  // clear for the planet; only the Round/Points box sits in that band's
  // corner), and short screens get a thinner margin: there every pixel of
  // height decides how big the region is.
  const top = Math.min(ins.top, 60);
  const margin = H - top - ins.bottom < 300 ? 6 : 16;
  const fw = W - ins.left - ins.right - 2 * margin;
  const fh = H - top - ins.bottom - 2 * margin;
  if (fw <= 0 || fh <= 0) return null;
  const fcx = (ins.left + W - ins.right) / 2;
  const fcy = (top + H - ins.bottom) / 2;
  const [[w, s], [e, n]] = box;
  const pts = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    pts.push([w + (e - w) * t, s], [w + (e - w) * t, n], [w, s + (n - s) * t], [e, s + (n - s) * t]);
  }
  const saved = { center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing(), padding: map.getPadding() };
  let center = [(w + e) / 2, (s + n) / 2];
  let zoom = saved.zoom;
  for (let k = 0; k < 8; k++) {
    map.jumpTo({ center, zoom, pitch: 0, bearing: 0, padding: ins });
    const ps = pts.map((p) => map.project(p));
    const xs = ps.map((p) => p.x);
    const ys = ps.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const step = Math.log2(Math.min(fw / (maxX - minX), fh / (maxY - minY)));
    const dx = (minX + maxX) / 2 - fcx;
    const dy = (minY + maxY) / 2 - fcy;
    const c = map.unproject([fcx + dx, fcy + dy]);
    center = [c.lng, c.lat];
    zoom += step;
    if (Math.abs(step) < 0.005 && Math.abs(dx) < 1 && Math.abs(dy) < 1) break;
  }
  map.jumpTo(saved);
  return Number.isFinite(zoom) ? { center: LngLat.convert(center), zoom } : null;
}

function setHome(map, ins, region, homeRef, homeNormRef, homeCenterRef) {
  let zoom = homeZoom(map, ins);
  let center = null;
  const box = REGION_VIEW[region];
  const fit = box ? fitBox(map, ins, box) : null;
  if (fit) {
    zoom = Math.max(zoom, fit.zoom);
    center = fit.center;
  }
  homeRef.current = zoom;
  homeCenterRef.current = center;
  homeNormRef.current = zoom - latScale((center || map.getCenter()).lat);
  return zoom;
}

function removeMarker(marker, outClass, ms) {
  if (!marker) return;
  const el = marker.getElement();
  el.classList.add(outClass);
  setTimeout(() => marker.remove(), ms);
}

export default function QuizGlobe({ region = 'all', pin, reveal, roundKey, insets, interactive, painted = [], splash = null, labels = [], stamp = null, hint = null, onPick, onLanded, onPlanted, leaving = false }) {
  const rootRef = useRef(null);
  const mapElRef = useRef(null);
  const starRefs = [useRef(null), useRef(null), useRef(null)];
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const revealingRef = useRef(false);
  const homeRef = useRef(1.5);
  const homeNormRef = useRef(1.5);
  const homeCenterRef = useRef(null);
  const regionRef = useRef(region);
  regionRef.current = region;
  // The home camera as easeTo options (a region adds its centre).
  const homeCamera = () => (homeCenterRef.current ? { zoom: homeRef.current, center: homeCenterRef.current } : { zoom: homeRef.current });
  const [ready, setReady] = useState(false);
  const insetsRef = useRef(insets || NO_INSETS);
  insetsRef.current = insets || NO_INSETS;
  const live = useRef({});
  live.current = { onPick, onLanded, onPlanted, interactive };
  const pinMarkerRef = useRef(null);
  const poleMarkerRef = useRef(null);
  const pickedRef = useRef(null);
  const hoverRef = useRef(null);
  const arcRafRef = useRef(null);
  const flareTimerRef = useRef(null);
  const setHoverRef = useRef(() => {});
  const paintedRef = useRef(new Map()); // code -> tier
  const labelMarksRef = useRef(new Set()); // label keys already shown
  const hintTimersRef = useRef([]);

  // ---- create once ----
  useEffect(() => {
    const startLng = START_LNGS[Math.floor(Math.random() * START_LNGS.length)];
    let map;
    try {
      map = new MapLibreMap({
        container: mapElRef.current,
        style: STYLE,
        center: [startLng, 18],
        zoom: 1,
        minZoom: 0.4,
        maxZoom: 7,
        attributionControl: false,
        renderWorldCopies: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        doubleClickZoom: false,
        canvasContextAttributes: { alpha: true, antialias: true },
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        fadeDuration: 0,
      });
    } catch (e) {
      console.error('[quiz] globe failed to start', e);
      return undefined;
    }
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    mapRef.current = map;

    // The shading disc sits on the canvas but under the markers, so it lives
    // in MapLibre's container (plain DOM, not React's).
    const shade = document.createElement('div');
    shade.className = 'quizGlobe__shade';
    map.getCanvas().after(shade);

    // Decor that follows the planet: glow and shading sized to its circle,
    // stars drifting with the camera. Faded out once the reveal zooms in.
    const TILE = 620;
    const FACTORS = [1.2, 2.6, 4.4];
    const paint = () => {
      const root = rootRef.current;
      if (!root) return;
      const m = globeMetrics(map);
      root.style.setProperty('--gx', `${m.x}px`);
      root.style.setProperty('--gy', `${m.y}px`);
      root.style.setProperty('--gr', `${m.r}px`);
      const norm = map.getZoom() - latScale(map.getCenter().lat);
      const decor = Math.min(1, Math.max(0, (homeNormRef.current + 1.4 - norm) / 1.1));
      root.style.setProperty('--decor', decor.toFixed(3));
      const c = map.getCenter();
      FACTORS.forEach((f, i) => {
        const el = starRefs[i].current;
        if (!el) return;
        const x = (((-c.lng * f) % TILE) + TILE) % TILE;
        el.style.transform = `translate3d(${x}px, ${c.lat * f}px, 0)`;
      });
    };
    map.on('move', paint);
    map.on('resize', paint);

    map.once('load', () => {
      readyRef.current = true;
      map.setPadding(insetsRef.current);
      const home = setHome(map, insetsRef.current, regionRef.current, homeRef, homeNormRef, homeCenterRef);
      const land = homeCenterRef.current ? [homeCenterRef.current.lng, homeCenterRef.current.lat] : [startLng, 18];
      map.jumpTo({ center: [land[0] - 110, 8], zoom: home - 1.8 });
      paint();
      rootRef.current?.classList.add('quizGlobe--in');
      map.easeTo({ center: land, zoom: home, duration: 2600, easing: easeOutQuart, essential: true });
      setReady(true);
    });

    // Hover lights a country (mouse only, while a pick is open).
    const finePointer = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
    const setHover = (id) => {
      if (hoverRef.current === id) return;
      try {
        if (hoverRef.current != null) map.setFeatureState({ source: 'countries', id: hoverRef.current }, { hover: false });
        if (id != null) map.setFeatureState({ source: 'countries', id }, { hover: true });
      } catch {}
      hoverRef.current = id;
      map.getCanvas().style.cursor = id != null ? 'pointer' : '';
    };
    setHoverRef.current = setHover;
    if (finePointer) {
      map.on('mousemove', LAND, (e) => setHover(live.current.interactive ? (e.features?.[0]?.id ?? null) : null));
      map.on('mouseleave', LAND, () => setHover(null));
    }

    // A drag never counts as a pick, however close to its start it ends.
    let dragged = false;
    map.on('mousedown', () => { dragged = false; });
    map.on('touchstart', () => { dragged = false; });
    map.on('dragstart', () => { dragged = true; });
    map.on('click', (e) => {
      if (dragged || !readyRef.current || !live.current.interactive) return;
      const f = map.queryRenderedFeatures(e.point, { layers: [LAND] })[0];
      const lng = ((e.lngLat.lng % 360) + 540) % 360 - 180;
      live.current.onPick?.({ lat: e.lngLat.lat, lng, country: f?.id ?? null });
    });

    return () => {
      cancelAnimationFrame(arcRafRef.current);
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the free screen area changed (card measured, window resized) ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || revealingRef.current || !insets) return;
    const apply = () => {
      if (revealingRef.current) return;
      setHome(map, insetsRef.current, regionRef.current, homeRef, homeNormRef, homeCenterRef);
      map.easeTo({ padding: insetsRef.current, ...homeCamera(), duration: 300, essential: true });
    };
    if (map.isMoving()) map.once('moveend', apply);
    else apply();
  }, [insets?.top, insets?.right, insets?.bottom, insets?.left]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- pin + picked country follow `pin` ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const prev = pickedRef.current;
    if (prev && prev !== pin?.country) {
      try { map.setFeatureState({ source: 'countries', id: prev }, { picked: false }); } catch {}
      pickedRef.current = null;
    }
    if (!pin) {
      removeMarker(pinMarkerRef.current, 'quizPin--out', 220);
      pinMarkerRef.current = null;
      return;
    }
    if (pinMarkerRef.current) {
      pinMarkerRef.current.setLngLat([pin.lng, pin.lat]);
      // Re-drop on every new pick: the pin answers each click.
      const el = pinMarkerRef.current.getElement();
      el.classList.remove('quizPin--drop');
      const img = el.querySelector('.quizPin__img');
      img.style.animation = 'none';
      void el.offsetWidth;
      img.style.animation = '';
      el.classList.add('quizPin--drop');
    } else {
      // Behind the planet means hidden, not a ghost through it.
      pinMarkerRef.current = new Marker({ element: pinElement(), anchor: 'bottom', opacityWhenCovered: 0 }).setLngLat([pin.lng, pin.lat]).addTo(map);
      pinMarkerRef.current.getElement().classList.add('quizPin--drop');
    }
    if (pin.country && pin.country !== 'Unknown') {
      try { map.setFeatureState({ source: 'countries', id: pin.country }, { picked: true }); } catch {}
      pickedRef.current = pin.country;
      flash([pin.country], FLARE_FILL, 0.45);
    }
  }, [pin?.lat, pin?.lng, pin?.country]); // eslint-disable-line react-hooks/exhaustive-deps

  // One quick flare of a country (a pick, a wrong try), then it fades.
  const flash = (codes, color, peak) => {
    const map = mapRef.current;
    if (!map || !readyRef.current || revealingRef.current) return;
    map.getSource('flare')?.setData({ type: 'FeatureCollection', features: countryFeatures(codes) });
    map.setPaintProperty('quiz-flare', 'fill-color', color);
    map.setPaintProperty('quiz-flare', 'fill-opacity-transition', { duration: 80, delay: 0 });
    map.setPaintProperty('quiz-flare', 'fill-opacity', peak);
    clearTimeout(flareTimerRef.current);
    flareTimerRef.current = setTimeout(() => {
      if (revealingRef.current || !mapRef.current) return;
      map.setPaintProperty('quiz-flare', 'fill-opacity-transition', { duration: 420, delay: 0 });
      map.setPaintProperty('quiz-flare', 'fill-opacity', 0);
    }, 140);
  };

  // ---- the run's answered countries, painted in how they went ----
  const paintedKey = painted.map((p) => `${p.code}:${p.tier}`).join('|');
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const applied = paintedRef.current;
    const next = new Map(painted.filter((p) => p.code).map((p) => [p.code, p.tier]));
    for (const [code, tier] of applied) {
      if (next.get(code) === tier) continue;
      try { map.removeFeatureState({ source: 'countries', id: code }, 'done'); } catch {}
      applied.delete(code);
    }
    for (const [code, tier] of next) {
      if (applied.get(code) === tier) continue;
      try { map.setFeatureState({ source: 'countries', id: code }, { done: tier }); } catch {}
      applied.set(code, tier);
    }
  }, [paintedKey, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- a click's name where it landed, in how it went; it fades by itself ----
  const labelsKey = labels.map((l) => l.key).join('|');
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const shown = labelMarksRef.current;
    for (const l of labels) {
      if (shown.has(l.key) || !Number.isFinite(l.lat) || !Number.isFinite(l.lng)) continue;
      shown.add(l.key);
      const el = tryLabelElement(l.text);
      el.classList.add(`quizTryLabel--${l.tone}`);
      const marker = new Marker({ element: el, anchor: l.below ? 'top' : 'bottom', offset: [0, l.below ? 8 : -6], opacityWhenCovered: 0 }).setLngLat([l.lng, l.lat]).addTo(map);
      setTimeout(() => removeMarker(marker, 'quizTryLabel--out', 320), LABEL_MS);
    }
  }, [labelsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- a click's flash: rose for a wrong country, the find's own hue ----
  useEffect(() => {
    if (stamp) flash([stamp.code], STAMP_FLARE[stamp.tone] || WRONG_FLARE, stamp.tone === 'wrong' ? 0.7 : 0.85);
  }, [stamp?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- out of tries: a ring around the answer, the camera turned to it ----
  // A region, not the answer: it pulses three times, then holds, and the
  // camera never comes closer than the planet view plus a little.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    hintTimersRef.current.forEach(clearTimeout);
    hintTimersRef.current = [];
    if (!hint) {
      map.setPaintProperty('quiz-hint', 'line-opacity', 0);
      return;
    }
    map.getSource('hint')?.setData(ringLine(hint.lat, hint.lng, hint.km));
    const later = (ms, fn) => hintTimersRef.current.push(setTimeout(() => mapRef.current && fn(), ms));
    [0, 1, 2].forEach((i) => {
      later(i * 560, () => map.setPaintProperty('quiz-hint', 'line-opacity', 1));
      later(i * 560 + 280, () => map.setPaintProperty('quiz-hint', 'line-opacity', 0.45));
    });
    later(3 * 560, () => map.setPaintProperty('quiz-hint', 'line-opacity', 0.9));
    // In zooms with the latitude taken out (see revealCamera).
    const nowNorm = map.getZoom() - latScale(map.getCenter().lat);
    const norm = Math.min(Math.max(nowNorm, homeNormRef.current), homeNormRef.current + 1.4);
    map.easeTo({ center: [hint.lng, hint.lat], zoom: norm + latScale(hint.lat), pitch: 0, duration: 900, easing: easeInOutCubic, essential: true });
  }, [hint?.key, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !splash) return undefined;
    const marker = new Marker({ element: splashElement(), anchor: 'center', opacityWhenCovered: 0 }).setLngLat([splash.lng, splash.lat]).addTo(map);
    const t = setTimeout(() => marker.remove(), 900);
    return () => { clearTimeout(t); marker.remove(); };
  }, [splash?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- reveal: one flight, the answer lands inside it ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !reveal) return undefined;
    const timers = [];
    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    if (!readyRef.current) {
      later(300, () => live.current.onLanded?.(reveal.id));
      return () => timers.forEach(clearTimeout);
    }
    revealingRef.current = true;
    clearTimeout(flareTimerRef.current);
    setHoverRef.current(null);
    if (!reveal.correct) {
      pinMarkerRef.current?.getElement().classList.add('quizPin--nope');
      // A Guess straight after the pick lands inside the pick flash: end it.
      map.setPaintProperty('quiz-flare', 'fill-opacity-transition', { duration: 320, delay: 0 });
      map.setPaintProperty('quiz-flare', 'fill-opacity', 0);
    }

    if (reveal.correct) {
      // Beat one for a hit: the country flares and the pin rings.
      map.getSource('flare')?.setData({ type: 'FeatureCollection', features: countryFeatures(reveal.answerCodes) });
      map.setPaintProperty('quiz-flare', 'fill-color', FLARE_FILL);
      map.setPaintProperty('quiz-flare', 'fill-opacity-transition', { duration: 120, delay: 0 });
      map.setPaintProperty('quiz-flare', 'fill-opacity', 0.85);
      later(260, () => {
        map.setPaintProperty('quiz-flare', 'fill-opacity-transition', { duration: 700, delay: 0 });
        map.setPaintProperty('quiz-flare', 'fill-opacity', 0);
      });
      pinMarkerRef.current?.getElement().classList.add('quizPin--hit');
    }

    const km = reveal.guess ? haversineKm(reveal.guess.lat, reveal.guess.lng, reveal.answerPoint.lat, reveal.answerPoint.lng) : 0;
    const fly = reveal.correct ? Math.round(Math.min(850, 500 + km * 0.05)) : Math.round(Math.min(2400, 1000 + km * 0.11));
    later(reveal.correct ? HIT_BEAT_MS : BEAT_MS, () => {
      map.flyTo({ ...revealCamera(map, reveal, homeNormRef.current, km), duration: fly, curve: 1.3, essential: true });
      if (!reveal.correct && reveal.guess) {
        const path = greatCircle(reveal.guess, reveal.answerPoint);
        const src = map.getSource('arc');
        const head = map.getSource('arcHead');
        // A fast Next + guess can land inside the last reset's fade-out.
        src?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: path.slice(0, 2) } });
        map.setPaintProperty('quiz-arc', 'line-opacity', 0.95);
        map.setPaintProperty('quiz-arc-glow', 'line-opacity', 0.22);
        const t0 = performance.now();
        const step = (now) => {
          const k = Math.min(1, (now - t0) / fly);
          const n = Math.max(2, Math.round(easeInOutCubic(k) * path.length));
          src?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: path.slice(0, n) } });
          head?.setData(k < 1 ? { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: path[n - 1] } } : EMPTY);
          if (k < 1) arcRafRef.current = requestAnimationFrame(step);
        };
        arcRafRef.current = requestAnimationFrame(step);
      }
      later(fly * 0.8, () => {
        map.getSource('answer')?.setData({ type: 'FeatureCollection', features: countryFeatures(reveal.answerCodes) });
        map.setPaintProperty('quiz-answer', 'fill-color', TIER_FILL[reveal.tier] || ANSWER_FILL);
        map.setPaintProperty('quiz-answer', 'fill-opacity', 0.9);
        if (reveal.flagCode) {
          poleMarkerRef.current = new Marker({ element: poleElement(reveal.flagCode, reveal.correct), anchor: 'bottom-left', opacityWhenCovered: 0 })
            .setLngLat([reveal.answerPoint.lng, reveal.answerPoint.lat])
            .addTo(map);
          // The flag's unfurl peaks here: tell the card where it stands.
          later(620, () => {
            const flag = poleMarkerRef.current?.getElement().querySelector('.quizPole__flag');
            if (!flag) return;
            const r = flag.getBoundingClientRect();
            live.current.onPlanted?.({ id: reveal.id, x: r.left + r.width / 2, y: r.top + r.height / 2 });
          });
          // A hit: the pin gives way to the flag it found.
          if (reveal.correct) pinMarkerRef.current?.getElement().classList.add('quizPin--out');
        }
      });
      // With where the answer stands on screen (QuizFind flies the points
      // from there).
      later(fly + 60, () => {
        const box = map.getContainer().getBoundingClientRect();
        const p = map.project([reveal.answerPoint.lng, reveal.answerPoint.lat]);
        live.current.onLanded?.(reveal.id, { x: box.left + p.x, y: box.top + p.y });
      });
    });
    return () => timers.forEach(clearTimeout);
  }, [reveal?.id, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- leaving the screen: the planet falls away (the CSS fades it) ----
  useEffect(() => {
    const map = mapRef.current;
    if (!leaving || !map || !readyRef.current) return;
    setHoverRef.current(null);
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    map.easeTo({ zoom: map.getZoom() - 1.2, pitch: 0, duration: 520, easing: easeInCubic, essential: true });
  }, [leaving]);

  // ---- next round: clear the reveal and pull back (zoom only, no pan) ----
  const firstRoundRef = useRef(true);
  useEffect(() => {
    if (firstRoundRef.current) { firstRoundRef.current = false; return; }
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    revealingRef.current = false;
    cancelAnimationFrame(arcRafRef.current);
    map.setPaintProperty('quiz-answer', 'fill-opacity', 0);
    map.setPaintProperty('quiz-arc', 'line-opacity', 0);
    map.setPaintProperty('quiz-arc-glow', 'line-opacity', 0);
    setTimeout(() => {
      if (revealingRef.current || !mapRef.current) return;
      map.getSource('answer')?.setData(EMPTY);
      map.getSource('flare')?.setData(EMPTY);
      map.getSource('arc')?.setData(EMPTY);
      map.getSource('arcHead')?.setData(EMPTY);
      map.setPaintProperty('quiz-arc', 'line-opacity', 0.95);
      map.setPaintProperty('quiz-arc-glow', 'line-opacity', 0.22);
    }, 720);
    removeMarker(poleMarkerRef.current, 'quizPole--out', 260);
    poleMarkerRef.current = null;
    // A region run returns to its region (a pan, but never toward the next
    // answer); the whole planet only pulls back.
    setHome(map, insetsRef.current, regionRef.current, homeRef, homeNormRef, homeCenterRef);
    map.easeTo({ padding: insetsRef.current, ...homeCamera(), pitch: 0, bearing: 0, duration: 1200, easing: easeInOutCubic, essential: true });
  }, [roundKey]);

  return (
    <div ref={rootRef} className="quizGlobe">
      <div className="quizSpace" aria-hidden>
        <div ref={starRefs[0]} className="quizStars quizStars--far" />
        <div ref={starRefs[1]} className="quizStars quizStars--mid" />
        <div ref={starRefs[2]} className="quizStars quizStars--near" />
        <span className="quizShootingStar" />
        <span className="quizShootingStar" />
        <span className="quizShootingStar" />
      </div>
      <div className="quizGlobe__glow" aria-hidden />
      <div ref={mapElRef} className="quizGlobe__map" />
    </div>
  );
}
