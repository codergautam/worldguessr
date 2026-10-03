import React, { useEffect, useRef, useState } from "react";
import { Loader } from '@googlemaps/js-api-loader';
// ChinaGuessr (temporary): Baidu panorama provider. Pure module, no aliases.
import { tileUrl as baiduTileUrl, fetchSdata, parseSdata, buildBaiduNav, centerBearingDeg } from '../china/baidu';
// ChinaGuessr (temporary): projected movement chrome for Baidu panos.
import SvNavOverlay from './svNavOverlay';

// Same options as findLatLong.js — the Loader is a singleton and throws if
// constructed twice with different options.
const loader = new Loader({
  apiKey: "",
  version: "weekly",
  libraries: ["places"]
});

// In-house WebGL Street View client for No Move mode. Streams raw public SV
// tiles onto a sphere: pan + zoom only, movement is structurally impossible
// (no navigation links, no chevrons, nothing to click). Pan/zoom feel is
// tuned to match Google's renderer.
//
// SHARED WITH MOBILE: embed/build.mjs bundles this exact file (via
// embed/svEntry.jsx) into mobile/src/generated/svEmbedHtml.ts for the app's
// WebView. After ANY edit here, re-run `node embed/build.mjs` or the app
// silently ships the stale renderer.

const TILE = 512;
const MAX_INFLIGHT = 12;      // concurrent tile downloads
const UPLOADS_PER_FRAME = 3;  // GPU texture uploads per frame, keeps frame pacing flat
// GPU texture budget in BYTES. The old cap was 150 TILES: one 512x512 RGBA
// tile plus its mip chain is ~1.4MB, so that was a ~210MB ceiling — on a
// phone, one round of detail panning was enough to get the WebView's render
// process reclaimed. 96/72 not lower: the legitimate visible working set at a
// portrait phone's default zoom is ~64MB (z4 cone + the z3 layer under it),
// and a budget below the working set makes the evictor scan fruitlessly
// forever. z<=2 base levels and the prewarmed pano are never victims.
const TEX_BUDGET = 96 * 1024 * 1024;
// Trim close to the budget: the gap is the flush size, and the retained set
// under trim IS the pan-back history — trimming deep (72MB was tried) left
// ~4-27 tiles of history and made a 360-degree look-around re-download and
// re-blur directions seen seconds earlier. Peak stays capped by TEX_BUDGET;
// history retention is what the trim floor buys.
const TEX_TRIM = 84 * 1024 * 1024;
// full mip chain = 1 + 1/4 + 1/16 + ... = 4/3 of the base level
const texBytes = (w, h) => Math.ceil(w * h * 4 * (4 / 3));
const BIAS = 0.75;            // resolution bias for zoom level selection
const D2R = Math.PI / 180;
const MOVE_FADE_MS = 240;
const MOVE_SETTLE_MS = 140;
// ChinaGuessr (temporary): a click answers at once with a small punch-in and a
// progress cursor while the destination's base tile downloads; the real
// cross-fade continues from wherever that left the view. A far pano is never
// hover-prewarmed, and from outside China its metadata plus z0 take 1.5 s+.
const MOVE_APPROACH_MS = 220;
const MOVE_APPROACH_SCALE = 0.06;   // fraction of fov the approach punches in
const MOVE_BASE_WAIT_MS = 6000;     // was 1000: every far click timed out into a silent no-op
// Reveal a Baidu pano on its single z0 image once z1 has failed to land
// within this window. Moving already fades in at z0; round 1 waited for the
// 1024x512 pair, which the CDN serves cold in 1 to 3.5 s.
const BAIDU_Z0_REVEAL_MS = 400;
// Google's zoom model, applied to the LONG viewport axis. Pinning the limits
// horizontally regardless of orientation made portrait phones derive a ~145
// deg vertical fov at the zoom-out floor (way past desktop's fisheye limit);
// matching on the long axis keeps the same wideness on every device.
// Floor ~110 deg (GeoGuessr-style wide), ceiling = GSV zoom 4. Portrait floor
// sits slightly tighter (user-tuned): default view = floor, so this is also
// the mobile default zoom.
const LFOV_MAX = 110 * D2R, LFOV_MAX_PORTRAIT = 105 * D2R, LFOV_MIN = 11.25 * D2R;
const PI = Math.PI, TAU = 2 * Math.PI;

const tileUrl = (p, z, x, y) =>
  `https://streetviewpixels-pa.googleapis.com/v1/tile?cb_client=maps_sv.tactile&panoid=${encodeURIComponent(p)}&x=${x}&y=${y}&zoom=${z}&nbt=1&fover=2`;
const metaUrl = p =>
  'https://www.google.com/maps/photometa/v1?authuser=0&hl=en&gl=us&pb=!1m4!1smaps_sv.tactile!11m2!2m1!1b1!2m2!1sen!2sus!3m3!1m2!1e2!2s'
  + encodeURIComponent(p)
  + '!4m57!1e1!1e2!1e3!1e4!1e5!1e6!1e8!1e12!2m1!1e1!4m1!1i48!5m1!1e1!5m1!1e2!6m1!1e1!6m1!1e2!9m36!1m3!1e2!2b1!3e2!1m3!1e2!2b0!3e3!1m3!1e3!2b1!3e2!1m3!1e3!2b0!3e3!1m3!1e8!2b0!3e3!1m3!1e1!2b0!3e3!1m3!1e4!2b0!3e3!1m3!1e10!2b1!3e2!1m3!1e10!2b0!3e3';

// providerId: 'google' (default) or 'baidu' (ChinaGuessr, temporary). Fixed for
// the engine's lifetime — a provider switch always arrives with latLong nulled
// first, which unmounts the canvas and rebuilds the engine anyway.
function createEngine(canvas, onPanoReady, isFrozen, onYaw, onPrewarmed, onFatal, providerId = 'google', isMoveAllowed = () => false) {
  const tileFor = providerId === 'baidu' ? baiduTileUrl : tileUrl;
  // antialias:false — MSAA on a fullscreen DPR-2 buffer costs 4x the sample
  // bandwidth to smooth geometry edges this scene does not have: one continuous
  // textured sphere, where the only seams are tile borders, which are
  // texture-continuous and unaffected by MSAA. Pure bandwidth loss on phones.
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) return null;
  // Context loss/restore handlers are attached after initGL below — they read
  // engine state (panos, meshes) declared later and only fire from events.

  // Tiles render as spherical patches on a rigid unit sphere around the camera.
  const VS = `
attribute vec2 a;
uniform vec4 uAng;      // theta0, theta1, phiTop, phiBottom (pano image frame)
uniform vec2 uUV;       // content fraction of the 512px tile
uniform mat4 uVP;
uniform float uYawOff;  // pano heading: image frame -> world frame
varying vec2 vUV;
void main() {
  float th = mix(uAng.x, uAng.y, a.x);
  float ph = mix(uAng.z, uAng.w, a.y);
  float tw = th + uYawOff;
  vec3 dir = vec3(cos(ph) * sin(tw), sin(ph), -cos(ph) * cos(tw));
  vUV = a * uUV;
  gl_Position = uVP * vec4(dir, 1.0);
}`;
  // ChinaGuessr (temporary): uAlpha is 1 for the shared single-pano path and
  // changes only for the incoming pass of a Baidu move.
  const FS = `
precision mediump float;
uniform sampler2D uTex;
uniform float uAlpha;
varying vec2 vUV;
void main() { gl_FragColor = vec4(texture2D(uTex, vUV).rgb, uAlpha); }`;

  function shader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function buildProgram() {
    const vs = shader(gl.VERTEX_SHADER, VS), fs = shader(gl.FRAGMENT_SHADER, FS);
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    // The linked program owns the compiled code; detaching + deleting frees
    // the shader objects now instead of leaking them for the context's life,
    // and leaves destroy() with only the program to delete.
    gl.detachShader(p, vs); gl.deleteShader(vs);
    gl.detachShader(p, fs); gl.deleteShader(fs);
    return p;
  }
  // `let`, not `const`: a context restore re-runs initGL() and reassigns all
  // of these — the old objects (extension object included) die with the lost
  // context and must be re-created, never reused.
  let prog = null, locA = 0, aniso = null, anisoMax = 0;
  const loc = {};
  function initGL() {
    prog = buildProgram();
    gl.useProgram(prog);
    for (const n of ['uAng', 'uUV', 'uVP', 'uYawOff', 'uTex', 'uAlpha'])
      loc[n] = gl.getUniformLocation(prog, n);
    locA = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(locA);
    gl.uniform1i(loc.uTex, 0);
    gl.uniform1f(loc.uAlpha, 1);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.clearColor(0.043, 0.051, 0.063, 1);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    aniso = gl.getExtension('EXT_texture_filter_anisotropic')
      || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
    anisoMax = aniso ? Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)) : 0;
    // No gl.viewport here: resize() owns it, and the restore path calls
    // resize() right after initGL().
  }
  initGL();

  // One shared grid mesh per subdivision count; patch corners arrive via uniforms.
  const meshes = new Map();
  function meshFor(z) {
    const n = Math.max(8, 64 >> z);
    let m = meshes.get(n);
    if (m) return m;
    const verts = new Float32Array((n + 1) * (n + 1) * 2);
    let vi = 0;
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) { verts[vi++] = i / n; verts[vi++] = j / n; }
    const idx = new Uint16Array(n * n * 6);
    let ii = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const p = j * (n + 1) + i;
      idx[ii++] = p; idx[ii++] = p + 1; idx[ii++] = p + n + 1;
      idx[ii++] = p + 1; idx[ii++] = p + n + 2; idx[ii++] = p + n + 1;
    }
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    m = { vb, ib, count: idx.length };
    meshes.set(n, m);
    return m;
  }

  // ---------------------------------------------------------------- view state
  let cssW = 1, cssH = 1, aspect = 1;
  let yaw = 0, pitch = 0;                      // yaw is a WORLD compass bearing
  let fov = 1, fovT = 1;                       // vertical, clamped in resize()
  let FOV_MIN = 0.2, FOV_MAX = 1.6;            // vertical equivalents, derived in resize()
  let vYaw = 0, vPitch = 0;
  let anchor = { x: 0, y: 0 };
  let lastYawOut = null;
  let spinDir = 0, yawAnim = null;
  const keys = new Set();
  // ChinaGuessr (temporary): movement state stays dormant for every other
  // provider. renderFov is the visual punch without changing user zoom state.
  let renderFov = fov;
  let navHover = null;
  let moveBusy = false, moveToken = 0;
  let moveTransition = null, settleTransition = null, approachTransition = null;
  let forwardWarmId = null;
  const cameraListeners = new Set();

  // ---------------------------------------------------------------- render gate
  // The rAF loop stays armed forever (onPanoReady/onPrewarmed fire from inside
  // it and drive the host's preload state machine); what is skipped is PAINT
  // and SCHEDULING. `dirty` = pixels on screen are stale (cleared only by
  // paint()); `schedDirty` = the tile scheduler must run again (camera moved,
  // a download slot freed, zoom stepped, hidden flipped). The lastYaw/...
  // snapshot means "matrices are current" — refreshed only by the camera
  // compare and the unhide path. DECLARED HERE, not next to the loop: resize()
  // below writes `dirty` and is called during createEngine — a later `let`
  // would be a TDZ crash at construction.
  let dirty = true, schedDirty = true, lost = false;
  // gate = the single draw gate. gateHadHidden records whether the web-style
  // `hidden` flag participated in the CURRENT gated stretch — that provenance
  // (not argument order) decides the unhide semantics, so interleaved
  // setGate(h, c) calls cannot flip the sync-paint contract. gateSince feeds
  // the parked-clamp in addDetailJobs.
  let gate = false, gateHadHidden = false, gateSince = 0;
  let restoreFailures = 0;
  // Heartbeat bookkeeping: HEAD's every-frame draw self-healed ANY discarded
  // raster (iOS/Android can drop a composited canvas layer under memory
  // pressure WITHOUT firing webglcontextlost). On-demand rendering loses that,
  // so a visible-and-clean canvas repaints once every 2s as cheap insurance —
  // one draw per 2s versus the 60/s we removed.
  let lastPaintAt = 0;
  let lastYaw = NaN, lastPitch = NaN, lastFov = NaN, lastAspect = NaN;
  // ChinaGuessr (temporary): the transition changes renderFov every frame,
  // but tile selection depends on the user's real camera. Keep a separate
  // scheduler snapshot so the cross-fade does not rescan and sort tiles 60
  // times per second while yaw, pitch, fov, and aspect are unchanged.
  let lastSchedYaw = NaN, lastSchedPitch = NaN, lastSchedFov = NaN, lastSchedAspect = NaN;
  // Byte budget, sized to the backing store: a 2560x1440-class or retina
  // desktop canvas has a legitimate VISIBLE working set (~108MB at z4) that
  // overflows the phone-sized budget and would pin the evictor fruitless.
  let texBudget = TEX_BUDGET, texTrim = TEX_TRIM;

  // The compass is a DOM overlay, not GL, so yaw has to leave the loop. Push
  // it out only when it actually moved (~0.03 deg): a still view costs nothing
  // and a spinning one still updates every frame.
  function emitYaw(force) {
    if (!onYaw) return;
    const w = wrapPi(yaw);
    if (!force && lastYawOut !== null && Math.abs(w - lastYawOut) < 5e-4) return;
    lastYawOut = w;
    onYaw(w);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssW = canvas.clientWidth || window.innerWidth;
    cssH = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    aspect = canvas.width / canvas.height;
    // A 0x0 element (WebView measured before first layout) would make aspect
    // NaN and poison every fov clamp. The strict-!== camera compare fails SAFE
    // on NaN (permanently dirty), but stop it at the source anyway.
    if (!isFinite(aspect) || aspect <= 0) { aspect = 1; }
    // fov state is vertical; the zoom limits live on the long axis. Landscape
    // converts horizontal limits to vertical; portrait's long axis IS vertical.
    if (aspect >= 1) {
      FOV_MAX = 2 * Math.atan(Math.tan(LFOV_MAX / 2) / aspect);
      FOV_MIN = 2 * Math.atan(Math.tan(LFOV_MIN / 2) / aspect);
    } else {
      FOV_MAX = LFOV_MAX_PORTRAIT;
      FOV_MIN = LFOV_MIN;
    }
    fov = Math.min(FOV_MAX, Math.max(FOV_MIN, fov));
    fovT = Math.min(FOV_MAX, Math.max(FOV_MIN, fovT));
    anchor = { x: cssW / 2, y: cssH / 2 };
    gl.viewport(0, 0, canvas.width, canvas.height);
    // Budget follows the surface: >3.5M backing pixels (retina laptop, big
    // desktop) legitimately hold ~50% more visible texture at default zoom.
    if (canvas.width * canvas.height > 3.5e6) {
      texBudget = 160 * 1024 * 1024; texTrim = 140 * 1024 * 1024;
    } else {
      texBudget = TEX_BUDGET; texTrim = TEX_TRIM;
    }
    // The canvas.width write above REALLOCATED AND CLEARED the drawing buffer.
    // Whatever was on screen is gone — a resize is always a repaint, including
    // one that lands while hidden (its repaint is owed at the unhide).
    dirty = true;
    schedDirty = true;
  }

  const clampPitch = p => Math.min(1.535, Math.max(-1.535, p));
  const wrapPi = d => ((d + PI) % TAU + TAU) % TAU - PI;

  function camBasis() {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    return {
      R: [cy, 0, sy],
      U: [-sp * sy, cp, sp * cy],
      F: [cp * sy, sp, -cp * cy],
    };
  }

  function screenToAngles(px, py) {
    const ndcX = (px / cssW) * 2 - 1, ndcY = 1 - (py / cssH) * 2;
    const ty = Math.tan(fov / 2), tx = ty * aspect;
    const { R, U, F } = camBasis();
    const dx = R[0] * ndcX * tx + U[0] * ndcY * ty + F[0];
    const dy = R[1] * ndcX * tx + U[1] * ndcY * ty + F[1];
    const dz = R[2] * ndcX * tx + U[2] * ndcY * ty + F[2];
    return { theta: Math.atan2(dx, -dz), phi: Math.asin(dy / Math.hypot(dx, dy, dz)) };
  }

  const vpMat = new Float32Array(16);
  let camF = [0, 0, -1], halfViewAngle = PI;
  function buildMatrices(viewFov = fov) {
    const { R, U, F } = camBasis();
    camF = F;
    const f = 1 / Math.tan(viewFov / 2), near = 0.05, far = 4000;
    const p00 = f / aspect, p11 = f;
    const p22 = (far + near) / (near - far), p32 = 2 * far * near / (near - far);
    vpMat[0] = p00 * R[0]; vpMat[4] = p00 * R[1]; vpMat[8] = p00 * R[2]; vpMat[12] = 0;
    vpMat[1] = p11 * U[0]; vpMat[5] = p11 * U[1]; vpMat[9] = p11 * U[2]; vpMat[13] = 0;
    vpMat[2] = -p22 * F[0]; vpMat[6] = -p22 * F[1]; vpMat[10] = -p22 * F[2]; vpMat[14] = p32;
    vpMat[3] = F[0]; vpMat[7] = F[1]; vpMat[11] = F[2]; vpMat[15] = 0;
    const ty = Math.tan(viewFov / 2);
    halfViewAngle = Math.atan(Math.hypot(ty * aspect, ty));
  }

  // ---------------------------------------------------------------- pano layout
  // exactTiles: Google pads every tile to 512x512 (an edge tile's content is a
  // fraction of the texture, hence uv). Baidu serves edge tiles at their real
  // size (its z=1 base is a 512x256 JPEG), so the content fills the texture
  // and uv must be [1,1] — otherwise the base level samples the top half of
  // the image and paints it stretched over the whole sphere.
  function makeLayout(baseW, baseH, maxZ, exactTiles = false) {
    const levels = [], meta = [];
    for (let z = 0; z <= maxZ; z++) {
      const w = baseW << z, h = baseH << z;
      const cols = Math.ceil(w / TILE), rows = Math.ceil(h / TILE);
      levels.push({ w, h, cols, rows });
      const arr = [];
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const px1 = Math.min((x + 1) * TILE, w), py1 = Math.min((y + 1) * TILE, h);
        const th0 = (x * TILE / w - 0.5) * TAU, th1 = (px1 / w - 0.5) * TAU;
        const ph0 = (0.5 - y * TILE / h) * PI, ph1 = (0.5 - py1 / h) * PI;
        const thC = (th0 + th1) / 2, phC = (ph0 + ph1) / 2;
        arr.push({
          key: z + '/' + x + '/' + y, z, x, y,
          ang: [th0, th1, ph0, ph1],
          uv: exactTiles ? [1, 1] : [(px1 - x * TILE) / TILE, (py1 - y * TILE) / TILE],
          dir: [Math.cos(phC) * Math.sin(thC), Math.sin(phC), -Math.cos(phC) * Math.cos(thC)],
          rad: Math.hypot((th1 - th0) / 2 * Math.cos(phC), (ph0 - ph1) / 2) * 1.15 + 0.02,
        });
      }
      meta.push(arr);
    }
    return { maxZ, levels, meta };
  }

  function probeLayout(pano) { // fallback when metadata lacks image sizes
    const tries = [
      { baseW: 512, baseH: 256, maxZ: 5, x: 27, y: 13, z: 5 },
      { baseW: 416, baseH: 208, maxZ: 5, x: 25, y: 12, z: 5 },
      { baseW: 512, baseH: 256, maxZ: 4, x: 15, y: 7, z: 4 },
      { baseW: 512, baseH: 256, maxZ: 3, x: 7, y: 3, z: 3 },
    ];
    return Promise.all(tries.map(t => new Promise(res => {
      const im = new Image();
      im.onload = () => res(true);
      im.onerror = () => res(false);
      im.src = tileFor(pano, t.z, t.x, t.y);
    }))).then(oks => {
      const i = oks.indexOf(true);
      return i < 0 ? null : makeLayout(tries[i].baseW, tries[i].baseH, tries[i].maxZ);
    });
  }

  // ---------------------------------------------------------------- metadata
  // photometa/v1 is the undocumented endpoint the Maps client itself uses; it
  // serves Access-Control-Allow-Origin: * so a plain fetch works. Response is
  // protobuf dumped as positional JSON arrays; paths below verified empirically.
  async function fetchMetaGoogle(p) {
    const txt = await (await fetch(metaUrl(p.id))).text();
    const root = JSON.parse(txt.replace(/^\)\]\}'/, ''));
    const md = root[1] && root[1][0];
    if (!md || !md[1] || md[1][1] !== p.id) throw new Error('bad metadata');

    const sizes = md[2] && md[2][3] && md[2][3][0]; // [[[h,w]], ...] ascending per zoom
    if (Array.isArray(sizes) && sizes.length && sizes[0][0]) {
      const bH = sizes[0][0][0], bW = sizes[0][0][1], mz = sizes.length - 1;
      const last = sizes[mz] && sizes[mz][0];
      // layout math assumes exact doubling per zoom; probe if this pano is odd
      if (bW > 0 && last && last[1] === (bW << mz) && last[0] === (bH << mz))
        p.layout = makeLayout(bW, bH, mz);
    }
    if (!p.layout) {
      p.layout = await probeLayout(p.id);
      if (!p.layout) throw new Error('no tiles');
    }

    const pos = md[5][0][1];
    p.lat = pos[0][2]; p.lng = pos[0][3];
    p.heading = (pos[2] && pos[2][0] || 0) * D2R;

    p.tiles = Array.from({ length: p.layout.maxZ + 1 }, () => new Map());
    p.status = 'ready';
  }

  // ChinaGuessr (temporary). Baidu's sdata gives the pyramid depth
  // (LayerCount) and the vehicle heading; the layout is always the 512x256
  // family with exact-size tiles. A miss throws: never fall through to
  // probeLayout (Google URLs) — the throw lands on the degraded onLoad path.
  async function fetchMetaBaidu(p) {
    const m = parseSdata(await fetchSdata(p.id)); // shared with warmPano: a seeded round 1 has this in flight already
    if (!m) throw new Error('bad baidu metadata for ' + p.id);
    p.layout = makeLayout(512, 256, m.maxZ, true);
    p.heading = centerBearingDeg(m.heading) * D2R; // image centre, for the texture mapping
    p.startYaw = m.heading * D2R;                   // Heading == MoveDir: the road, for the opening view
    p.nav = buildBaiduNav(m);
    p.tiles = Array.from({ length: p.layout.maxZ + 1 }, () => new Map());
    p.status = 'ready';
  }
  const fetchMeta = (p) => providerId === 'baidu' ? fetchMetaBaidu(p) : fetchMetaGoogle(p);

  // ---------------------------------------------------------------- pano registry
  const panos = new Map();
  let cur = null;
  let worldGen = 0, curZoom = 0;
  // Tile-recency counter for eviction. Advanced ONLY by a real paint (draw)
  // or a hidden-mode visibility stamp (stampVisible) — NEVER by an idle frame.
  // A skipped frame must not age tiles, or a hidden stretch would make every
  // live tile look stale and the evictor would delete the visible pano out
  // from under the next paint.
  let drawNo = 0;
  // Running GPU texture total in bytes (see TEX_BUDGET), kept incrementally so
  // the in-budget frame cost is one integer compare. Recomputed from scratch
  // at each loadFresh as a drift self-heal. Counts ALL panos; the victim scan
  // also walks all panos' z>=3 maps (the warm pano only ever holds z<=2, so
  // the preload contract — warm textures survive untouched — still holds).
  let gpuBytes = 0;
  // Fruitless-scan latch: when an over-budget scan frees nothing (the whole
  // set is visible or base), don't rescan until drawNo advances.
  let lastEvictScanDrawNo = -1, lastEvictFreed = true;
  // Global count of in-flight tile downloads; the per-tile records live on
  // each pano (`p.inflight: Map<metaKey, {img, aborted}>`) so loadFresh can
  // preserve the survivor's dedupe ledger without string keys.
  let inflightCount = 0;
  const uploadQ = []; // const on purpose — always mutated in place

  // ChinaGuessr (temporary): ground navigation uses Baidu's planar metre
  // coordinates in the renderer's compass frame. It is never reachable from
  // Google or the mobile embed because both leave allowMove false.
  const NAV_TARGET_RADIUS = 6;
  const NAV_TARGET_CONE = 80 * D2R;
  const angleDistance = (a, b) => Math.abs(wrapPi(a - b));
  const navigationEnabled = () => providerId === 'baidu' && isMoveAllowed()
    && !isFrozen() && !gate && !!(cur && cur.status === 'ready' && cur.nav);
  const movementInputEnabled = () => navigationEnabled() && !moveBusy;

  function getNavFrame() {
    return {
      yaw,
      pitch,
      fov: renderFov,
      vp: vpMat,
      width: cssW,
      height: cssH,
      hover: navHover,
      nav: cur && cur.nav,
      moving: moveBusy,
    };
  }

  function emitCamera() {
    if (!cameraListeners.size) return;
    const frame = getNavFrame();
    for (const listener of cameraListeners) listener(frame);
  }

  function onCamera(listener) {
    cameraListeners.add(listener);
    listener(getNavFrame());
    return () => cameraListeners.delete(listener);
  }

  function projectGroundPoint(point) {
    if (!cur || !cur.nav) return null;
    const x = point.x, y = -cur.nav.height, z = -point.y;
    const clipX = vpMat[0] * x + vpMat[4] * y + vpMat[8] * z + vpMat[12];
    const clipY = vpMat[1] * x + vpMat[5] * y + vpMat[9] * z + vpMat[13];
    const clipW = vpMat[3] * x + vpMat[7] * y + vpMat[11] * z + vpMat[15];
    if (!isFinite(clipW) || clipW <= 0.01) return null;
    return {
      x: (clipX / clipW * 0.5 + 0.5) * cssW,
      y: (0.5 - clipY / clipW * 0.5) * cssH,
    };
  }

  function chevronGroundQuad(link) {
    const bearing = link.bearing * D2R;
    const forward = { x: Math.sin(bearing), y: Math.cos(bearing) };
    const right = { x: Math.cos(bearing), y: -Math.sin(bearing) };
    const center = { x: forward.x * 3.5, y: forward.y * 3.5 };
    return [
      { x: center.x - right.x * 0.7 + forward.x * 0.45, y: center.y - right.y * 0.7 + forward.y * 0.45 },
      { x: center.x + right.x * 0.7 + forward.x * 0.45, y: center.y + right.y * 0.7 + forward.y * 0.45 },
      { x: center.x + right.x * 0.7 - forward.x * 0.45, y: center.y + right.y * 0.7 - forward.y * 0.45 },
      { x: center.x - right.x * 0.7 - forward.x * 0.45, y: center.y - right.y * 0.7 - forward.y * 0.45 },
    ];
  }

  function pointInQuad(px, py, quad) {
    let sign = 0;
    for (let i = 0; i < quad.length; i++) {
      const a = quad[i], b = quad[(i + 1) % quad.length];
      const cross = (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x);
      if (Math.abs(cross) < 1e-5) continue;
      const nextSign = Math.sign(cross);
      if (sign && nextSign !== sign) return false;
      sign = nextSign;
    }
    return true;
  }

  function groundPointAt(px, py) {
    if (!navigationEnabled()) return null;
    const ray = screenToAngles(px, py);
    if (ray.phi >= -1e-4) return null;
    const distance = cur.nav.height / Math.tan(-ray.phi);
    if (!isFinite(distance) || distance <= 0) return null;
    return { x: Math.sin(ray.theta) * distance, y: Math.cos(ray.theta) * distance };
  }

  // The pancake target: the pano nearest the cursor's ground point, among the
  // panos the cursor either sits on (within NAV_TARGET_RADIUS, widening with
  // distance) or aims at from the camera (within NAV_TARGET_CONE of the cursor
  // bearing). Baidu chains are 10 to 30 m apart, so a cursor just in front of
  // the car is far from every pano yet clearly pointed along the road; the
  // cone is what lets that hover, and the arrows, show the same destinations.
  // Nothing in either set (a field beside the road, a dead end) means no disc.
  function pickTarget(groundPoint) {
    if (!navigationEnabled() || !groundPoint) return null;
    const groundDistance = Math.hypot(groundPoint.x, groundPoint.y);
    const groundBearing = Math.atan2(groundPoint.x, groundPoint.y);
    const radius = Math.max(NAV_TARGET_RADIUS, 0.35 * groundDistance);
    let nearest = null, nearestDistance = Infinity;
    for (const candidate of cur.nav.candidates) {
      const distance = Math.hypot(candidate.x - groundPoint.x, candidate.y - groundPoint.y);
      if (distance >= nearestDistance) continue;
      if (distance > radius
        && angleDistance(Math.atan2(candidate.x, candidate.y), groundBearing) > NAV_TARGET_CONE) continue;
      nearest = candidate; nearestDistance = distance;
    }
    return nearest;
  }

  function groundPointForTarget(groundPoint) {
    const distance = Math.hypot(groundPoint.x, groundPoint.y);
    const minimumDistance = Math.max(NAV_TARGET_RADIUS, cur?.nav?.height || 0);
    if (!distance || distance >= minimumDistance) return groundPoint;
    const scale = minimumDistance / distance;
    return { x: groundPoint.x * scale, y: groundPoint.y * scale };
  }

  function pickChevron(px, py) {
    if (!navigationEnabled()) return null;
    let picked = null, pickedDistance = Infinity;
    for (const link of cur.nav.links) {
      const quad = chevronGroundQuad(link).map(projectGroundPoint);
      if (quad.some((point) => !point) || !pointInQuad(px, py, quad)) continue;
      const centerX = quad.reduce((sum, point) => sum + point.x, 0) / quad.length;
      const centerY = quad.reduce((sum, point) => sum + point.y, 0) / quad.length;
      const distance = Math.hypot(px - centerX, py - centerY);
      if (distance < pickedDistance) { picked = link; pickedDistance = distance; }
    }
    return picked;
  }

  function setNavHover(hover) {
    // Empty ground is the common pointer state. Do not wake React and redo all
    // projected overlay geometry for every mouse event while nothing is shown.
    if (!hover && !navHover && !canvas.classList.contains('sv-nav-target')) return;
    if (hover?.chevron && hover.chevron.id === navHover?.chevron?.id) return;
    navHover = hover;
    canvas.classList.toggle('sv-nav-target', !!(hover && (hover.chevron || hover.target)));
    emitCamera();
  }

  function clearNavHover() {
    if (!navHover && !canvas.classList.contains('sv-nav-target')) return;
    setNavHover(null);
  }

  function nearestLink(targetYaw, maxDistance = Infinity) {
    if (!cur || !cur.nav || !cur.nav.links.length) return null;
    let nearest = null, nearestDistance = Infinity;
    for (const link of cur.nav.links) {
      const distance = angleDistance(link.bearing * D2R, targetYaw);
      if (distance < nearestDistance) { nearest = link; nearestDistance = distance; }
    }
    return nearestDistance <= maxDistance ? nearest : null;
  }

  async function ensurePano(id) {
    let p = panos.get(id);
    // An errored record must not poison retries: the registry would hand the
    // settled rejected promise back forever, turning the reload button into a
    // permanent no-op for this pano (web SP supplies freshPano, so the
    // resolver never re-runs either).
    if (p && p.status === 'error') { panos.delete(id); p = null; }
    if (!p) {
      p = {
        id, status: 'loading', destroyed: false,
        layout: null, tiles: [], dead: new Set(),
        inflight: new Map(), // metaKey -> { img, aborted }
        lat: 0, lng: 0, heading: 0, metaPromise: null,
        nav: null, // ChinaGuessr (temporary): Baidu ground navigation metadata.
        z0LandedAt: 0, // when the full z0 level was on the GPU (Baidu early reveal)
      };
      panos.set(id, p);
      p.metaPromise = fetchMeta(p).catch(() => { p.status = 'error'; });
    }
    await p.metaPromise;
    return p.status === 'ready' && !p.destroyed ? p : null;
  }

  // Cancel a pano's in-flight downloads. removeAttribute, NOT `img.src = ''`:
  // an empty src resolves against the document base URL and fires a real
  // network request for the current document (on mobile that base is
  // google.com — one spurious fetch per aborted tile). The `aborted` flag
  // keeps the rejected decode out of p.dead — blacklisting a tile WE
  // cancelled would punch a permanent hole in a pano that survives.
  function abortPanoInflight(p) {
    for (const rec of p.inflight.values()) {
      rec.aborted = true;
      rec.img.removeAttribute('src');
      // A queued record already gave its network slot back in done.then —
      // decrementing again would let inflightCount drift negative and blow
      // the MAX_INFLIGHT throttle wide open.
      if (!rec.queued) inflightCount--;
    }
    p.inflight.clear();
  }

  function dropQueuedUploads(pred) {
    for (let i = uploadQ.length - 1; i >= 0; i--)
      if (pred(uploadQ[i])) uploadQ.splice(i, 1);
  }

  function destroyPano(p) {
    p.destroyed = true;
    abortPanoInflight(p);
    dropQueuedUploads(u => u.p === p);
    for (const m of p.tiles) for (const rec of m.values()) {
      gl.deleteTexture(rec.tex);
      gpuBytes -= rec.bytes || 0;
    }
    p.tiles = [];
    panos.delete(p.id);
  }

  // Context loss invalidates every texture NAME; there is nothing to delete,
  // only bookkeeping to forget — and it must be forgotten AT LOSS TIME, not at
  // restore: baseComplete() reads these maps, and leaving them populated would
  // let onPanoReady lift the host's loading cover onto a black canvas. Fresh
  // Maps of the correct level count, never a bare [] — pumpUploads indexes
  // p.tiles[z] and would throw on the first post-restore upload.
  function forgetTextures() {
    for (const p of panos.values()) {
      if (p.layout) p.tiles = Array.from({ length: p.layout.maxZ + 1 }, () => new Map());
      else p.tiles = [];
      p.z0LandedAt = 0;
    }
    gpuBytes = 0;
  }

  // ---------------------------------------------------------------- tile streaming
  function startLoad(p, meta) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const rec = { img, aborted: false, queued: false };
    p.inflight.set(meta.key, rec);
    inflightCount++;
    img.src = tileFor(p.id, meta.z, meta.x, meta.y);
    const done = img.decode ? img.decode() : new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    done.then(() => {
      // aborted must be checked here too — decode() can settle either way
      // after removeAttribute depending on how far the fetch got.
      if (rec.aborted) return;
      // The LEDGER ENTRY STAYS until pumpUploads consumes the queue item:
      // deleting it here re-opened the dedupe hole for every tile waiting in
      // uploadQ (only 3 upload per frame) — schedule() saw the key in neither
      // inflight nor tiles and re-issued the download. Only the NETWORK slot
      // is released now.
      rec.queued = true;
      inflightCount--;
      schedDirty = true; // a download slot freed — the scheduler may issue more
      if (p.destroyed) return;
      uploadQ.push({ p, img, meta });
    }).catch(() => {
      if (rec.aborted) return; // OUR cancel is not a dead tile
      p.inflight.delete(meta.key);
      inflightCount--;
      schedDirty = true;
      if (!p.destroyed) p.dead.add(meta.key);
    });
  }

  // Returns the number of textures uploaded this frame (a non-zero count is a
  // dirty condition — new pixels exist).
  function pumpUploads() {
    if (lost) return 0; // a lost gl.createTexture returns null; storing
                        // {tex:null} records makes baseComplete lie and the
                        // loading cover lift onto permanent black
    let n = 0;
    for (let i = 0; i < UPLOADS_PER_FRAME && uploadQ.length; i++) {
      const { p, img, meta } = uploadQ.shift();
      p.inflight.delete(meta.key); // ledger released only as the tile lands
      if (p.destroyed) continue;
      // Refuse an already-resident key BEFORE createTexture: a second upload
      // would orphan the first texture (~1.4MB, unreachable by any delete).
      if (p.tiles[meta.z] && p.tiles[meta.z].has(meta.key)) continue;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, anisoMax);
      // Bytes from the real image dimensions — Google serves cropped edge
      // tiles, and the budget must match what the GPU actually holds.
      const bytes = texBytes(img.naturalWidth || TILE, img.naturalHeight || TILE);
      // lastUse = drawNo means "not older than the last paint": it fails the
      // `< drawNo` victim predicate until a LATER paint proves it off-screen.
      p.tiles[meta.z].set(meta.key, { tex, meta, lastUse: drawNo, bytes });
      gpuBytes += bytes;
      n++;
      if (meta.z === 0 && !p.z0LandedAt && p.layout.meta[0].every((t) => p.tiles[0].has(t.key))) p.z0LandedAt = Date.now();
    }
    return n;
  }

  // camera forward rotated into a pano's image frame, for tile visibility tests
  function camFImage(p) {
    const c = Math.cos(p.heading), s = Math.sin(p.heading);
    return [c * camF[0] + s * camF[2], camF[1], -s * camF[0] + c * camF[2]];
  }
  const tileVisible = (m, cf) =>
    Math.acos(Math.max(-1, Math.min(1, m.dir[0] * cf[0] + m.dir[1] * cf[1] + m.dir[2] * cf[2])))
      < halfViewAngle + m.rad;

  function desiredZoom(layout) {
    const need = BIAS * canvas.height * PI / fov;
    let z = 0;
    while (z < layout.maxZ && layout.levels[z].h < need) z++;
    return z;
  }

  function addBaseJobs(p, jobs) {
    if (!p || p.status !== 'ready') return;
    const zMax = Math.min(2, p.layout.maxZ);
    for (let z = 0; z <= zMax; z++)
      for (const m of p.layout.meta[z])
        if (!p.tiles[z].has(m.key) && !p.dead.has(m.key) && !p.inflight.has(m.key))
          jobs.push({ p, m, pri: z });
  }

  function addDetailJobs(p, jobs) {
    // BACK-PRESSURE: over budget with nothing evictable means the visible set
    // itself fills the budget — downloading more detail would grow GPU memory
    // without bound (base z<=2 always flows; the reveal contract needs it).
    if (gpuBytes > texBudget && !lastEvictFreed) return;
    const cf = camFImage(p);
    // PARKED clamp only: a short gate (round loading, between-rounds conceal)
    // must keep streaming full detail — that pre-stream is why the reveal is
    // already sharp (clamping it made every NM reveal sharpen-in from z3 on
    // large displays). A LONG gate is a parked state (staging lobby, queue,
    // 2v2 end) where z4/z5 for a pano nobody will see is pure waste.
    const parked = gate && (Date.now() - gateSince > 10000);
    const zTop = Math.min(parked ? 3 : curZoom, p.layout.maxZ);
    for (let z = 3; z <= zTop; z++)
      for (const m of p.layout.meta[z]) {
        if (p.tiles[z].has(m.key) || p.dead.has(m.key) || p.inflight.has(m.key)) continue;
        if (!tileVisible(m, cf)) continue;
        const ang = Math.acos(Math.max(-1, Math.min(1, m.dir[0] * cf[0] + m.dir[1] * cf[1] + m.dir[2] * cf[2])));
        jobs.push({ p, m, pri: 10 + z * 10 + ang });
      }
  }

  function schedule() {
    if (lost) return;
    const jobs = [];
    const curReady = panoReady(cur);
    if (curReady) {
      const z = desiredZoom(cur.layout);
      if (z !== curZoom) { curZoom = z; dirty = true; } // zTop changes the image
      addBaseJobs(cur, jobs);
    }
    // The warm pano's base rides the same scheduler (and the same
    // MAX_INFLIGHT budget) at a priority between the current pano's base and
    // its detail wave: the reveal must never wait on next-round warm-up, and
    // warm-up must never be starved behind an endless z5 stream. NOT gated on
    // curReady: a round whose own metadata failed (cur null all round) must
    // still warm the NEXT round, or SV_PREFETCHED never fires and every later
    // transition degrades to a full covered load.
    if (warmId && (!curReady || warmId !== cur.id)) {
      const w = panos.get(warmId);
      if (w && w.status === 'ready' && !w.destroyed) {
        const before = jobs.length;
        addBaseJobs(w, jobs);
        for (let i = before; i < jobs.length; i++) jobs[i].pri += 5;
      }
    }
    if (curReady) addDetailJobs(cur, jobs);
    jobs.sort((a, b) => a.pri - b.pri);
    for (const j of jobs) {
      if (inflightCount >= MAX_INFLIGHT) break;
      startLoad(j.p, j.m);
    }
  }

  function evictTiles() {
    if (gpuBytes <= texBudget) { lastEvictFreed = true; return; } // O(1) on nearly every frame
    // A scan that freed nothing will free nothing again until a paint
    // re-stamps recency. In the current control flow this latch is mostly
    // belt-and-braces: evictTiles only runs when drew||uploaded, and both
    // paths advance drawNo first — the latch engages only in the narrow
    // gated-and-not-ready window. Kept because it makes the no-rescan
    // invariant hold by construction, not by call-site discipline.
    if (!lastEvictFreed && lastEvictScanDrawNo === drawNo) return;
    lastEvictScanDrawNo = drawNo;
    const victims = [];
    for (const p of panos.values()) {
      // The PREWARM CONTRACT, enforced rather than assumed: warm textures
      // survive untouched once SV_PREFETCHED was reported, or commitPreload's
      // 'ready' would be a lie and the swap would paint holes. (Today warm
      // panos only hold z<=2 anyway — this guard keeps that a fact, not a
      // coincidence.) EXCEPT when the warm pano IS the current pano (a repeat
      // location prefetching the displayed id): exempting it then makes the
      // whole visible pano un-evictable, pins gpuBytes over budget, and the
      // back-pressure latch kills detail downloads for the rest of the round.
      if (p.id === warmId && (!cur || p.id !== cur.id)) continue;
      for (let z = 3; z < p.tiles.length; z++)
        for (const rec of p.tiles[z].values())
          // drawNo only advances on paints/stamps, so this reads "not in the
          // last painted frame" even across a long hidden stretch.
          if (rec.lastUse < drawNo) victims.push({ p, rec });
    }
    victims.sort((a, b) => a.rec.lastUse - b.rec.lastUse);
    let freed = false;
    for (const v of victims) {
      if (gpuBytes <= texTrim) break;
      gl.deleteTexture(v.rec.tex);
      v.p.tiles[v.rec.meta.z].delete(v.rec.meta.key);
      gpuBytes -= v.rec.bytes || 0;
      freed = true;
    }
    lastEvictFreed = freed;
    if (freed) schedDirty = true; // back-pressure may unblock
  }

  // ---------------------------------------------------------------- draw
  // THE readiness predicate — the renderer's central state question, defined
  // once. Every "can I draw/schedule/stamp this pano" check goes through it.
  const panoReady = (p) => !!(p && p.status === 'ready');

  // THE ONE visibility walk. paint() and stampVisible() both traverse the
  // SAME tile set through this function — the LRU evictor's victim predicate
  // (`lastUse < drawNo`) is only sound while the painted set and the stamped
  // set are identical, so the traversal must never exist twice. onLevel runs
  // once per non-empty level (the painter binds its mesh there); onTile runs
  // per visible tile AFTER the recency stamp.
  // onLevel's RETURN VALUE is handed to every onTile of that level — the
  // painter's per-level mesh travels through the walk's signature, not a
  // shared mutable, so a future caller mixing callbacks cannot read a stale
  // level's state.
  function walkVisible(p, onLevel, onTile) {
    const cf = camFImage(p);
    const zTop = Math.min(curZoom, p.layout.maxZ);
    for (let z = 0; z <= zTop; z++) {
      if (!p.tiles[z] || !p.tiles[z].size) continue;
      const levelCtx = onLevel ? onLevel(z) : null;
      for (const rec of p.tiles[z].values()) {
        if (z >= 3 && !tileVisible(rec.meta, cf)) continue;
        rec.lastUse = drawNo;
        if (onTile) onTile(rec, levelCtx);
      }
    }
  }

  // Hoisted paint callbacks: engine-scope constants, no per-frame closure
  // allocations in the hot path.
  const dpLevel = (z) => {
    const mesh = meshFor(z);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vb);
    gl.vertexAttribPointer(locA, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib);
    return mesh;
  };
  const dpTile = (rec, mesh) => {
    gl.bindTexture(gl.TEXTURE_2D, rec.tex);
    gl.uniform4fv(loc.uAng, rec.meta.ang);
    gl.uniform2fv(loc.uUV, rec.meta.uv);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  };
  function drawPano(p, alpha = 1) {
    gl.uniform1f(loc.uYawOff, p.heading);
    gl.uniform1f(loc.uAlpha, alpha);
    walkVisible(p, dpLevel, dpTile);
  }

  // Cross-fade one fully resident base level. Drawing every progressive level
  // with the same alpha compounds opacity (two 50% layers become 75%) and
  // makes the fade jump while doing needless blended draw calls.
  function highestCompleteBaseLevel(p) {
    for (let z = Math.min(2, p.layout.maxZ); z >= 0; z--) {
      const meta = p.layout.meta[z];
      if (meta.length && meta.every((tile) => p.tiles[z].has(tile.key))) return z;
    }
    return -1;
  }

  function drawPanoLevel(p, z, alpha) {
    const tiles = p.tiles[z];
    if (!tiles || !tiles.size) return;
    gl.uniform1f(loc.uYawOff, p.heading);
    gl.uniform1f(loc.uAlpha, alpha);
    const mesh = dpLevel(z);
    for (const rec of tiles.values()) {
      rec.lastUse = drawNo;
      dpTile(rec, mesh);
    }
  }

  // The single paint path: the ONLY place drawNo advances (with stampVisible)
  // and the only place `dirty` clears. CONTENTLESS = NO-OP, never a clear:
  // during loadFresh's metadata await (cur === null) any dirty writer — a
  // window focus or residual camera motion — must keep the LAST frame on
  // screen (iframe parity), not wipe the canvas for the whole photometa round
  // trip. (A resize during that window still blanks the buffer — the
  // canvas.width write is unavoidable — and cannot be repainted until content
  // exists; that matches pre-gate behavior.) Returns whether pixels changed.
  function paint() {
    // ChinaGuessr (temporary): the outgoing pano remains the base pass for the
    // move fade. Google and No Move still execute the original single pass.
    const basePano = moveTransition ? moveTransition.outgoing : cur;
    if (!panoReady(basePano)) { dirty = false; return false; }
    drawNo++;
    lastPaintAt = Date.now();
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniformMatrix4fv(loc.uVP, false, vpMat);
    gl.disable(gl.BLEND);
    drawPano(basePano, 1);
    if (moveTransition && panoReady(moveTransition.incoming) && moveTransition.alpha > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      drawPanoLevel(moveTransition.incoming, moveTransition.fadeLevel, moveTransition.alpha);
      gl.disable(gl.BLEND);
      gl.uniform1f(loc.uAlpha, 1);
    }
    dirty = false;
    if (!moveBusy) emitCamera();
    return true;
  }

  // KNOWN-DEAD round: wipe the surface. The keep-last-frame rule above is for
  // loads in flight; once a load has FAILED, the previous round's imagery
  // must not sit there looking playable — in NMPZ the frozen-frame tell is
  // invisible and the player would guess the WRONG round's location. A blank
  // canvas honestly reads as broken.
  function clearSurface() {
    if (lost) return;
    gl.clear(gl.COLOR_BUFFER_BIT);
    lastPaintAt = Date.now();
    dirty = false;
  }

  // Hidden-mode recency stamp: walkVisible with no GL work. Keeps LRU
  // truthful while the gate skips paints — without it, a frozen drawNo makes
  // every tile uploaded during a reveal un-evictable and GPU memory grows
  // without bound in exactly the windows we're optimizing. Eviction still
  // never needs to set `dirty`: victims are `lastUse < drawNo` and the shared
  // walk stamps everything visible, so an evicted tile is provably off-screen.
  function stampVisible() {
    if (!panoReady(cur)) return;
    drawNo++;
    walkVisible(cur, null, null);
    dirty = false; // stamped = accounted for; unhide re-marks via setGate
  }

  // ---------------------------------------------------------------- input
  const pointers = new Map();
  let dragging = false, panned = false, pinch = null, touchFling = false;
  let navPointer = null; // ChinaGuessr (temporary): last mouse point in canvas pixels.
  let navPointerDirty = false; // Drag-follow work stays coalesced into the renderer's next frame.
  // ChinaGuessr (temporary): these are the tap limits used to distinguish a
  // ground move from the renderer's existing drag gesture.
  const TAP_MAX_DISTANCE = 6;
  const TAP_MAX_MS = 300;
  // Trailing ~100ms of angular deltas — release velocity comes from this
  // window. Per-event dx/dt estimates lie badly: 120Hz phones halve them
  // (via any dt floor) and batched touch events spike them.
  const flick = [];

  const canvasPoint = (e) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  function updateNavHoverAt(px, py) {
    if (!movementInputEnabled()) { clearNavHover(); return null; }
    const chevron = pickChevron(px, py);
    if (chevron) {
      const hover = { chevron, target: null, groundPt: null };
      if (warmId !== chevron.id) {
        forwardWarmId = null;
        prewarm(chevron.id);
      }
      setNavHover(hover);
      return hover;
    }
    const groundPt = groundPointAt(px, py);
    // Near the bottom edge, the real ground intersection collapses under the
    // camera and falls outside the six-metre target radius. Use one camera
    // hit-radius of forward distance for hit-testing while keeping the disc at the
    // actual cursor intersection.
    const target = groundPt ? pickTarget(groundPointForTarget(groundPt)) : null;
    // No target means no pancake at all. This also keeps empty-road pointer
    // motion out of the overlay hot path.
    const hover = target ? { chevron: null, target, groundPt } : null;
    if (target && warmId !== target.id) {
      forwardWarmId = null;
      prewarm(target.id);
    }
    setNavHover(hover);
    return hover;
  }

  // moveBusy alone locked the view for the whole base wait (now up to 6 s for
  // a far pano). Panning stays live until the cross-fade actually starts.
  const moveLocked = () => moveBusy && !approachTransition;
  const onPointerDown = e => {
    if (isFrozen() || moveLocked()) return;
    spinDir = 0; yawAnim = null; // a real drag always beats the compass control
    canvas.setPointerCapture(e.pointerId);
    touchFling = e.pointerType === 'touch';
    pointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      downAt: e.timeStamp,
      multi: pointers.size > 0,
    });
    if (e.pointerType === 'mouse') navPointer = canvasPoint(e);
    if (pointers.size > 1) for (const pointer of pointers.values()) pointer.multi = true;
    vYaw = 0; vPitch = 0;
    flick.length = 0;
    dragging = true;
    panned = false; // pan cursor waits for real movement (see onPointerMove)
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), fov0: fovT };
    }
  };

  const onPointerMove = e => {
    if (isFrozen() || moveBusy) return;
    const p = pointers.get(e.pointerId);
    if (!p) {
      if (movementInputEnabled()) {
        const point = canvasPoint(e);
        navPointer = point;
        navPointerDirty = false;
        updateNavHoverAt(point.x, point.y);
      }
      return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (e.pointerType === 'mouse' && (dx || dy)) {
      navPointer = canvasPoint(e);
      navPointerDirty = true;
    }
    // GSV keeps the pointing finger through a plain click and only swaps in the
    // four-arrow cursor once the view actually starts turning — so flip on the
    // first move that rotates anything, not on pointerdown.
    if (!panned && (dx || dy)) { panned = true; canvas.classList.add('dragging'); }
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      // scale in tan space so the imagery tracks the fingers, GSV-style
      if (d > 20) fovT = Math.min(FOV_MAX, Math.max(FOV_MIN, 2 * Math.atan(Math.tan(pinch.fov0 / 2) * pinch.dist / d)));
      anchor = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const kx = Math.atan(Math.tan(fov / 2) * aspect) / cssW, ky = fov / cssH / 2;
      yaw -= dx * kx; pitch = clampPitch(pitch + dy * ky);
      flick.length = 0; // pinch movement must not turn into a fling
      return;
    }
    if (pointers.size !== 1) return;
    // GSV grab feel: a full-viewport drag rotates by exactly one field of view
    // per axis, so the scene sticks to the cursor
    const kx = 2 * Math.atan(Math.tan(fov / 2) * aspect) / cssW, ky = fov / cssH;
    yaw -= dx * kx;
    pitch = clampPitch(pitch + dy * ky);
    const now = e.timeStamp;
    flick.push({ t: now, y: -dx * kx, p: dy * ky });
    while (flick.length && now - flick[0].t > 100) flick.shift();
  };

  const endPointer = e => {
    const pointer = pointers.get(e.pointerId);
    if (!pointer) return;
    const wasLast = pointers.size === 1;
    const tapDistance = Math.hypot(e.clientX - pointer.startX, e.clientY - pointer.startY);
    const isTap = e.type === 'pointerup' && wasLast && !pointer.multi
      && tapDistance < TAP_MAX_DISTANCE && e.timeStamp - pointer.downAt < TAP_MAX_MS;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      dragging = false;
      panned = false;
      canvas.classList.remove('dragging');
      // Average velocity across the trailing window. A held-then-released
      // finger has an empty window (samples aged out) — no fling, same as
      // the old 120ms-gap check.
      const now = e.timeStamp;
      while (flick.length && now - flick[0].t > 100) flick.shift();
      const dur = flick.length ? (now - flick[0].t) / 1000 : 0;
      if (dur > 0.03) {
        let sy = 0, sp = 0;
        for (const s of flick) { sy += s.y; sp += s.p; }
        vYaw = sy / dur; vPitch = sp / dur;
      } else {
        vYaw = 0; vPitch = 0;
      }
      flick.length = 0;
    }
    if (isTap && (movementInputEnabled() || approachTransition)) {
      vYaw = 0; vPitch = 0;
      const point = canvasPoint(e);
      navPointerDirty = false;
      const hover = updateNavHoverAt(point.x, point.y);
      const id = hover?.chevron?.id || hover?.target?.id;
      if (id) moveTo(id);
    } else if (wasLast && e.pointerType === 'mouse' && movementInputEnabled()) {
      const point = canvasPoint(e);
      if (point.x >= 0 && point.x <= cssW && point.y >= 0 && point.y <= cssH) {
        navPointer = point;
        navPointerDirty = false;
        updateNavHoverAt(point.x, point.y);
      } else {
        navPointer = null;
        navPointerDirty = false;
        clearNavHover();
      }
    }
  };

  const onPointerLeave = () => {
    if (!pointers.size && navigationEnabled()) {
      navPointer = null;
      navPointerDirty = false;
      clearNavHover();
    }
  };

  const onWheel = e => {
    if (isFrozen() || moveBusy) return;
    e.preventDefault();
    let dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    if (e.ctrlKey) dy *= 3;
    // one wheel notch (~100) is a gentle ~1.16x fov step
    fovT = Math.min(FOV_MAX, Math.max(FOV_MIN, fovT * Math.exp(dy * 0.0015)));
    anchor = { x: e.clientX, y: e.clientY };
  };

  const onDblClick = e => {
    if (isFrozen() || moveBusy) return;
    fovT = Math.max(FOV_MIN, fovT / 2); // one GSV zoom level
    anchor = { x: e.clientX, y: e.clientY };
  };

  const isTypingTarget = t =>
    t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  const onKeyDown = e => {
    if (isFrozen() || isTypingTarget(e.target)) return;
    if (moveBusy) { e.preventDefault(); return; }
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (movementInputEnabled() && (key === 'ArrowUp' || key === 'w' || key === 'ArrowDown' || key === 's')) {
      e.preventDefault();
      if (!e.repeat) moveInDirection(key === 'ArrowDown' || key === 's');
      return;
    }
    keys.add(key);
  };
  const onKeyUp = e => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  // Also stops a held rotate arrow: a pointerup outside the window never
  // reaches the button, and the view would keep spinning on its own.
  const onBlur = () => { keys.clear(); spinDir = 0; };

  // ---------------------------------------------------------------- compass control
  // Google's compass drives the view: the flanking arrows rotate (a tap steps,
  // a hold spins) and the needle itself resets to north. All of it is gated on
  // isFrozen so NMPZ can't rotate its way around the freeze.
  function animYawTo(target) {
    // A live fling fights the ease and can defeat it outright: it drags yaw
    // past the target, and if any frame lands inside the settle window on the
    // way through, the ease ends early and the fling carries on. Reset-to-north
    // would then finish pointing anywhere.
    vYaw = 0; vPitch = 0;
    yawAnim = yaw + wrapPi(target - yaw); // short way round
  }
  function nudgeYaw(dir) {
    if (isFrozen() || moveBusy) return;
    const step = Math.min(45 * D2R, fov * 0.7); // smaller steps when zoomed in
    animYawTo((yawAnim === null ? yaw : yawAnim) + dir * step);
  }
  function setSpin(dir) {
    if (isFrozen() || moveBusy) { spinDir = 0; return; }
    spinDir = dir;
    if (dir) { yawAnim = null; vYaw = 0; vPitch = 0; }
  }
  function faceNorth() {
    if (isFrozen() || moveBusy) return;
    spinDir = 0;
    animYawTo(0);
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDblClick);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- load
  let notified = false;

  function baseComplete(p) {
    // ChinaGuessr (temporary): z0 is a full 512x256 panorama; after the grace
    // it is a better first frame than a longer loader. The loop below still
    // answers true the moment z1 completes.
    if (providerId === 'baidu' && p.z0LandedAt && Date.now() - p.z0LandedAt >= BAIDU_Z0_REVEAL_MS) return true;
    // Reveal at z1 (1024x512 equirect — recognizable, sharpens in view like
    // Google's own streaming) instead of waiting out the full z2 wave.
    const zMax = Math.min(1, p.layout.maxZ);
    let live = 0;
    for (let z = 0; z <= zMax; z++)
      for (const m of p.layout.meta[z]) {
        if (p.tiles[z].has(m.key)) live++;
        else if (!p.dead.has(m.key)) return false;
      }
    // Dead tiles count as "settled", but a pano whose ENTIRE base is dead
    // (blocked CDN, stripped CORS) must not report ready — that would lift
    // the loading cover, or answer commitPreload 'ready', onto nothing.
    return live > 0;
  }

  // Full warm-up for the NEXT pano, the WebGL equivalent of the iframe's
  // hidden preload slot: metadata registered AND base tiles downloaded and
  // UPLOADED to GPU textures (pumpUploads serves any registered pano, and
  // evictTiles explicitly skips the warmId pano, so warm textures survive
  // untouched — enforced there, not assumed).
  // When its z<=1 base is complete, frame() fires onPrewarmed exactly once —
  // the host's cue that commitPreload may honestly answer 'ready'. The coming
  // loadFresh then swaps to already-painted content in a single frame.
  let warmId = null, warmNotified = false;
  function prewarm(id) {
    if (!id || destroyed) return;
    // Baidu's z0 URL needs no metadata. Race this single full-panorama tile
    // against sdata so a click can begin fading as soon as metadata registers,
    // without bypassing the engine's download budget for the remaining tiles.
    if (providerId === 'baidu') prefetchBaseTiles(id, providerId, 0);
    if (warmId !== id) {
      // A superseded warm pano would otherwise linger in the registry with
      // ~15MB of z<=2 base textures that the evictor can never reclaim (its
      // victim floor is z=3) while still counting toward gpuBytes.
      const old = warmId ? panos.get(warmId) : null;
      if (old && old !== cur && old.id !== id) destroyPano(old);
      warmId = id;
    }
    // Unconditional: a REPEATED prewarm of the same id must be able to re-fire
    // onPrewarmed (the host resets its ready latch per preload target, and a
    // repeat location would otherwise leave commitPreload stuck on 'none').
    warmNotified = false;
    ensurePano(id).then((p) => {
      if (!p || destroyed) return;
      // Registration only. The DOWNLOADS are driven by schedule(), which is
      // the one place that respects MAX_INFLIGHT — the old direct startLoad
      // loop here fired 11 fetches on top of a full scheduler (23 concurrent
      // on a phone) and starved the current pano's detail wave.
      schedDirty = true;
    }).catch(() => {});
  }

  // ChinaGuessr (temporary): a move waits briefly for GPU-ready base tiles,
  // then uses loadFresh's registry path with the outgoing pano preserved.
  function cancelMovement() {
    const wasMoving = moveBusy || !!moveTransition || !!settleTransition;
    const abandoned = wasMoving && warmId ? panos.get(warmId) : moveTransition?.incoming;
    moveToken++;
    moveBusy = false;
    if (moveTransition?.resolve) moveTransition.resolve(false);
    if (settleTransition?.resolve) settleTransition.resolve(false);
    moveTransition = null;
    settleTransition = null;
    approachTransition = null;
    canvas.classList.remove('sv-nav-moving');
    renderFov = fov;
    forwardWarmId = null;
    if (wasMoving) {
      warmId = null; warmNotified = false;
      if (abandoned && abandoned !== cur) destroyPano(abandoned);
    }
    clearNavHover();
  }

  function waitForMoveBase(id, token) {
    const started = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        if (destroyed || token !== moveToken) { resolve(false); return; }
        const pano = panos.get(id);
        if (pano?.status === 'error') { resolve(false); return; }
        // One complete level covers the entire sphere and is enough for a real
        // cross-fade. Never let a timeout swap onto metadata with no pixels.
        if (pano?.status === 'ready' && highestCompleteBaseLevel(pano) >= 0) { resolve(true); return; }
        if (Date.now() - started >= MOVE_BASE_WAIT_MS) { resolve(false); return; }
        setTimeout(check, 16);
      };
      check();
    });
  }

  function beginMoveTransition(outgoing, incoming) {
    const fadeLevel = highestCompleteBaseLevel(incoming);
    if (fadeLevel < 0) return Promise.resolve(false);
    return new Promise((resolve) => {
      const startFov = renderFov;
      // A rapid follow-up move may interrupt the previous settle. Start from
      // its current visual FOV so repeated walking stays continuous.
      settleTransition = null;
      approachTransition = null;
      moveTransition = {
        outgoing,
        incoming,
        alpha: 0,
        fadeLevel,
        startedAt: 0,
        startFov,
        baseFov: fov,
        resolve,
      };
      dirty = true;
      schedDirty = true;
    });
  }

  async function moveTo(id) {
    if (!navigationEnabled() || !id || id === cur.id) return false;
    let retarget = false;
    if (moveBusy) {
      // A click during the base wait re-targets; the same target just keeps waiting.
      if (!approachTransition || id === warmId) return false;
      retarget = true;
      cancelMovement();
    }
    const token = ++moveToken;
    moveBusy = true;
    spinDir = 0; yawAnim = null; vYaw = 0; vPitch = 0;
    fovT = fov;
    keys.clear();
    if (navHover) clearNavHover();
    else emitCamera();
    forwardWarmId = null;
    // A re-target keeps the punched-in view instead of easing in again (startedAt truthy = finished).
    approachTransition = { startedAt: retarget ? 1 : 0, baseFov: fov };
    canvas.classList.add('sv-nav-moving');
    dirty = true;
    const warmed = panos.get(id);
    if (warmId !== id || !warmed || warmed.status !== 'ready' || highestCompleteBaseLevel(warmed) < 0) prewarm(id);
    const canProceed = await waitForMoveBase(id, token);
    if (!canProceed || destroyed || token !== moveToken) {
      if (token === moveToken) finishMove(false);
      return false;
    }
    const keptYaw = yaw / D2R;
    const ok = await loadFresh(id, keptYaw, { moving: true, token });
    if (token === moveToken) finishMove(ok);
    return ok;
  }

  // Release input after a move attempt. A move that never got its base ends
  // the approach punch-in with the same settle ease the real transition uses,
  // from wherever the view is now.
  function finishMove(ok) {
    moveBusy = false;
    canvas.classList.remove('sv-nav-moving');
    if (!ok && approachTransition) {
      approachTransition = null;
      settleTransition = { startedAt: 0, baseFov: fov, from: fov > 0 ? renderFov / fov : 1 };
      dirty = true;
    }
    const hover = navPointer ? updateNavHoverAt(navPointer.x, navPointer.y) : null;
    if (!hover) emitCamera();
    updateForwardPrewarm();
  }

  function moveInDirection(backward) {
    if (!movementInputEnabled()) return;
    const link = nearestLink(yaw + (backward ? PI : 0), 60 * D2R);
    if (link) moveTo(link.id);
  }

  function updateForwardPrewarm() {
    if (!navigationEnabled() || moveBusy || !baseComplete(cur)) return;
    // A hovered destination is a stronger intent signal than camera bearing.
    // Keep the single warm slot on it until the pointer leaves that target.
    if (navHover?.chevron || navHover?.target) return;
    const link = nearestLink(yaw);
    if (!link || link.id === forwardWarmId) return;
    forwardWarmId = link.id;
    prewarm(link.id);
  }

  async function loadFresh(id, headingDeg, options = null) {
    const moving = !!options?.moving;
    const outgoing = moving ? cur : null;
    if (!moving) cancelMovement();
    worldGen++;
    // Deliberately NOT dirty here: marking dirty with cur=null on a VISIBLE
    // surface paints the clear color — a black flash for the whole metadata +
    // base-tile window. Several reveal-time preload paths run loadFresh while
    // the gate is OFF (only an opaque answer map covers the canvas, with zero
    // timing margin), and the reload button does it in plain view. Keeping the
    // last composited frame up until the new pano lands mirrors the iframe's
    // old-document-survives property; `cur = p` below marks dirty when there
    // is something new to paint.
    schedDirty = true;
    // Spare an already-prewarmed incoming pano — its registered metadata, its
    // GPU-resident base tiles, AND its in-flight downloads/queued uploads
    // (prewarm regularly has z2 still downloading when loadFresh lands;
    // wiping its dedupe ledger made the scheduler re-issue those tiles and
    // the duplicate upload orphaned the first texture — ~11MB per round on
    // mobile). destroyPano aborts and unqueues everything for the others.
    for (const p of [...panos.values()]) {
      if (p.id !== id && (!moving || p !== outgoing)) destroyPano(p);
    }
    if (!moving) {
      warmId = null; warmNotified = false; // consumed (or superseded) either way
      cur = null;
      notified = false;
      forwardWarmId = null;
      emitCamera();
    }
    // Drift self-heal, once per round: gpuBytes is kept incrementally and a
    // silent skew is catastrophic in both directions (too low = never evict =
    // OOM; too high = evict constantly = download thrash).
    gpuBytes = 0;
    for (const pp of panos.values())
      for (const m of pp.tiles) for (const rec of m.values()) gpuBytes += rec.bytes || 0;
    const gen = worldGen;
    const p = await ensurePano(id);
    if (gen !== worldGen || destroyed || (moving && options.token !== moveToken)) return false;
    if (!p) {
      if (moving) {
        warmId = null; warmNotified = false;
        const failed = panos.get(id);
        if (failed && failed !== outgoing) destroyPano(failed);
        return false;
      }
      // Metadata failed for the CURRENT generation: the previous pano was
      // already destroyed at entry, so the composited frame is stale imagery
      // of a dead round. Wipe it — see clearSurface. (A resolve failure never
      // reaches here; the old pano stays live and correct on that path.)
      clearSurface();
      return false;
    }
    if (moving) {
      if (!outgoing || outgoing.destroyed) return false;
      if (headingDeg !== null && headingDeg !== undefined && isFinite(headingDeg)) yaw = headingDeg * D2R;
      cur = outgoing;
      dirty = true;
      schedDirty = true;
      return beginMoveTransition(outgoing, p);
    }
    cur = p;
    dirty = true; // a reload of the same spot keeps yaw/pitch/fov — the camera
                  // compare would never fire, so mark the swap explicitly
    schedDirty = true;
    // A fresh round restarts the parked clock. Without this, a gate that has
    // been continuously up while its REASON changed (minutes-long lobby ->
    // round-1 loading, same gate) kept the lobby-entry timestamp, read as
    // parked, and clamped the round's under-cover pre-stream to z3 — the
    // exact sharpen-in reveal the clamp is documented to never cause.
    gateSince = Date.now();
    // No caller heading: open on the pano's own travel direction when the
    // provider supplies one (Baidu, where the image centre sits 90 deg off the
    // road), else on the image centre (Google's centerHeading IS the road).
    yaw = (headingDeg !== null && headingDeg !== undefined && isFinite(headingDeg)) ? headingDeg * D2R
      : (p.startYaw !== undefined ? p.startYaw : p.heading);
    // Portrait's tall fov puts half the frame above the horizon at pitch 0 —
    // start tilted down so the view favors the road, not the sky (the embed's
    // road-heavy mobile framing; its URL only carries fov=100 + no pitch, so
    // this is tuned by eye, not copied).
    pitch = aspect < 1 ? -20 * D2R : 0;
    vYaw = 0; vPitch = 0;
    spinDir = 0; yawAnim = null; // a compass press from the last round must not follow us here
    fov = fovT = FOV_MAX; // GSV default view = zoom 1 equivalent, fully zoomed out
    renderFov = fov;
    anchor = { x: cssW / 2, y: cssH / 2 };
    emitYaw(true); // new round starts at a new bearing — don't wait on a delta
    return true;
  }

  // ---------------------------------------------------------------- main loop
  let tPrev = 0, rafId = 0, destroyed = false;

  // Host-driven draw gate. `setGate(h, c)` folds the web `hidden` prop and the
  // mobile `covered` prop into one internal flag; the PIPELINE (scheduling,
  // uploads, onPanoReady/onPrewarmed) keeps running behind it, because a
  // gated window is exactly when the next round is being warmed and the
  // host's commitPreload is waiting on SV_PREFETCHED.
  //
  // Unhide semantics differ BY WHICH FLAG cleared, on purpose:
  // - hidden (web reveal contract): paint SYNCHRONOUSLY in the same task —
  //   the reveal unhides with NO reload and no second onLoad, and the 200ms
  //   opacity fade starts at 0 so the pre-effect composite is invisible.
  // - covered (mobile result screen): mark dirty, let the next rAF paint
  //   (<=16ms, still under the native cover). A synchronous paint here can
  //   paint the PREVIOUS round: the host pushes covered:false in the same
  //   commit, but the new round's coords arrive in a LATER injectJavaScript.
  function setGate(h, c) {
    h = !!h; c = !!c;
    const next = h || c;
    // Provenance is recorded BEFORE the same-state early return, so a call
    // sequence like (true,true) -> (false,true) -> (false,false) cannot lose
    // the fact that `hidden` participated in this gated stretch — the unhide
    // policy must not depend on which flag happened to clear last.
    if (next && h) gateHadHidden = true;
    if (next === gate) return;
    gate = next;
    schedDirty = true; // the parked clamp in addDetailJobs keys off the gate
    if (gate) { gateSince = Date.now(); return; }
    const syncPaint = gateHadHidden;
    gateHadHidden = false;
    dirty = true;
    if (destroyed || lost) return;
    if (syncPaint) {
      // Web-style unhide: the reveal contract expects a painted frame in the
      // same task (no reload, no second onLoad; the 200ms fade starts at 0 so
      // the pre-effect composite is invisible). The canvas is only ever
      // opacity-hidden, but a resize may have landed while gated — repaint on
      // true geometry before the fade starts. covered-only clears (mobile)
      // skip this: the next rAF paints under the native cover, and a sync
      // paint could show the PREVIOUS round (coords arrive one push later).
      if (canvas.clientWidth && (canvas.clientWidth !== cssW || canvas.clientHeight !== cssH)) resize();
      // resize() changes canvas.height, an input to desiredZoom — but curZoom
      // is normally recomputed only in schedule(). Without this the first
      // revealed frame after a gated orientation change draws one detail
      // level off.
      if (cur && cur.status === 'ready') curZoom = desiredZoom(cur.layout);
      buildMatrices(renderFov);
      lastYaw = yaw; lastPitch = pitch; lastFov = renderFov; lastAspect = aspect;
      paint();
    }
  }

  function frame(tNow) {
    if (destroyed) return;
    rafId = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (tNow - tPrev) / 1000 || 0.016);
    tPrev = tNow;

    // ChinaGuessr (temporary): changing to No Move or NMPZ cancels any move
    // that was waiting on tiles before it can swap the panorama.
    if (moveBusy && (isFrozen() || !isMoveAllowed())) cancelMovement();

    // NMPZ: every input ENTRY point is gated on isFrozen, but motion already in
    // flight when the freeze lands would sail straight across the round
    // boundary and pan a locked pano — a held arrow (its button unmounts
    // mid-press, so no pointerup ever reaches it), a held key, a fling, or a
    // running compass ease. loadFresh clears all of it, but loadFresh does NOT
    // run when the next pano fails to resolve, which leaves the old pano
    // spinning with no way to stop it. Kill motion at the integrator instead.
    // The gate gets the same treatment: pointer-events:none stops pointers but
    // window keydown still lands, and a held arrow through a conceal would
    // silently drift the round off its stamped bearing.
    if (isFrozen() || gate) {
      spinDir = 0; yawAnim = null; vYaw = 0; vPitch = 0;
      if (keys.size) keys.clear();
    }

    if (!dragging && (vYaw || vPitch)) {
      yaw += vYaw * dt;
      pitch = clampPitch(pitch + vPitch * dt);
      // heavy friction, GSV-style: the fling dies out in a couple hundred ms.
      // Touch carries slightly longer (user-tuned) — a thumb flick expects
      // more glide than a mouse release, but still nowhere near buttery.
      const d = Math.exp(-dt / (touchFling ? 0.18 : 0.12));
      vYaw *= d; vPitch *= d;
      if (Math.hypot(vYaw, vPitch) < 0.01) { vYaw = 0; vPitch = 0; }
    }
    if (spinDir && !dragging) {
      yaw += spinDir * fov * 1.1 * dt; // rate follows zoom, same as the arrow keys
    } else if (yawAnim !== null && !dragging) {
      yaw += (yawAnim - yaw) * (1 - Math.exp(-dt / 0.13));
      if (Math.abs(yawAnim - yaw) < 8e-4) { yaw = yawAnim; yawAnim = null; }
    }
    if (keys.size) {
      const r = fov * 0.9 * dt;
      const movingKeys = navigationEnabled();
      const rotateLeft = keys.has('ArrowLeft') || (movingKeys && keys.has('a'));
      const rotateRight = keys.has('ArrowRight') || (movingKeys && keys.has('d'));
      if (rotateLeft || rotateRight) yawAnim = null;
      if (rotateLeft) yaw -= r;
      if (rotateRight) yaw += r;
      if (!movingKeys && keys.has('ArrowUp')) pitch = clampPitch(pitch + r);
      if (!movingKeys && keys.has('ArrowDown')) pitch = clampPitch(pitch - r);
      if (keys.has('+') || keys.has('=')) fovT = Math.max(FOV_MIN, fovT * Math.exp(-1.4 * dt));
      if (keys.has('-') || keys.has('_')) fovT = Math.min(FOV_MAX, fovT * Math.exp(1.4 * dt));
    }
    if (Math.abs(fovT - fov) > 1e-5) {
      const before = screenToAngles(anchor.x, anchor.y);
      // Mid-pinch the fingers ARE the animation — smoothing here makes the
      // imagery trail them by ~100ms. Snap while pinching; smooth for wheel.
      fov += (fovT - fov) * (pinch ? 1 : 1 - Math.exp(-dt / 0.09));
      const after = screenToAngles(anchor.x, anchor.y);
      const dYaw = wrapPi(before.theta - after.theta);
      yaw += dYaw;
      // Carry a running compass ease along with the anchor correction. Its
      // target is absolute, so otherwise the next frame drags yaw straight
      // back and the zoom stops tracking the cursor.
      if (yawAnim !== null) yawAnim += dYaw;
      pitch = clampPitch(pitch + (before.phi - after.phi));
    }

    // ChinaGuessr (temporary): ease-out cubic keeps both panorama passes on
    // one registered camera while the current view punches in, then settles.
    let fadeFinished = false, settleFinished = false;
    renderFov = fov;
    if (moveTransition) {
      if (!moveTransition.startedAt) moveTransition.startedAt = tNow;
      const progress = Math.min(1, (tNow - moveTransition.startedAt) / MOVE_FADE_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      moveTransition.alpha = eased;
      const targetFov = moveTransition.baseFov * 0.86;
      renderFov = moveTransition.startFov + (targetFov - moveTransition.startFov) * eased;
      dirty = true;
      fadeFinished = progress >= 1;
    } else if (settleTransition) {
      if (!settleTransition.startedAt) settleTransition.startedAt = tNow;
      const progress = Math.min(1, (tNow - settleTransition.startedAt) / MOVE_SETTLE_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      const from = settleTransition.from ?? 0.86;
      renderFov = settleTransition.baseFov * (from + (1 - from) * eased);
      dirty = true;
      settleFinished = progress >= 1;
    } else if (approachTransition) {
      if (!approachTransition.startedAt) approachTransition.startedAt = tNow;
      const progress = Math.min(1, (tNow - approachTransition.startedAt) / MOVE_APPROACH_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      renderFov = approachTransition.baseFov * (1 - MOVE_APPROACH_SCALE * eased);
      if (progress < 1) dirty = true; // holds the punched-in view until the base lands
    }

    // ---- render gate. rAF stays armed; PAINT and SCHEDULING are conditional.
    // The image is a pure function of (yaw, pitch, fov, aspect) + the tile set
    // + curZoom, so camera motion is detected by COMPARING against the values
    // the current matrices were built from, rather than tagging each of the
    // dozen mutation sites — a future input path is covered for free and can
    // never silently freeze the view. STRICT !== ONLY: NaN !== NaN keeps a
    // NaN-poisoned camera fail-SAFE (permanently dirty = today's behavior);
    // an epsilon or Object.is compare would invert that into a permanently
    // frozen renderer. Non-camera changes mark dirty at their source: resize
    // (buffer realloc), uploads, curZoom steps, loadFresh, setGate, restore.
    const schedulerCameraChanged = yaw !== lastSchedYaw || pitch !== lastSchedPitch
      || fov !== lastSchedFov || aspect !== lastSchedAspect;
    if (schedulerCameraChanged) {
      lastSchedYaw = yaw; lastSchedPitch = pitch; lastSchedFov = fov; lastSchedAspect = aspect;
      schedDirty = true;
    }
    let cameraChanged = false;
    if (yaw !== lastYaw || pitch !== lastPitch || renderFov !== lastFov || aspect !== lastAspect) {
      lastYaw = yaw; lastPitch = pitch; lastFov = renderFov; lastAspect = aspect;
      // Ahead of schedule() on purpose: addDetailJobs reads camF and
      // halfViewAngle from here, and scheduling against a stale camera after
      // loadFresh would spend the download budget on tiles behind the player.
      buildMatrices(renderFov);
      cameraChanged = true;
      dirty = true;
      // NO lastEvictFreed reset here: resetting on camera motion inverted the
      // GPU back-pressure off during exactly the hot streaming windows
      // (pan/zoom), producing download/evict thrash while over budget. The
      // latch releases itself correctly without help — a camera move causes a
      // paint, the paint advances drawNo, and the scan-repeat guard in
      // evictTiles keys on drawNo, so the evictor re-evaluates the changed
      // visible set on the very next painted frame.
    }
    if ((cameraChanged || navPointerDirty) && navPointer && movementInputEnabled()) {
      navPointerDirty = false;
      if (dragging && navHover?.target) {
        const groundPt = groundPointAt(navPointer.x, navPointer.y);
        // Keep the destination latched during a pan. Only the disc's ground
        // position follows the held mouse, so crossing an empty hit-test band
        // cannot make it blink out mid-gesture.
        if (groundPt) navHover = { chevron: null, target: navHover.target, groundPt };
      } else if (!dragging) {
        updateNavHoverAt(navPointer.x, navPointer.y);
      }
    }
    emitYaw(false); // delta-gated internally; kept out of paint() so the
                    // compass never goes stale and jumps at a reveal

    const ready = panoReady(cur) && !lost;

    // Uploads run OUTSIDE the cur gate: the warm pano must keep landing on the
    // GPU across loadFresh's await window (cur is null right then).
    const uploaded = pumpUploads();
    if (uploaded) { dirty = true; schedDirty = true; }

    // Not gated on `ready`: schedule() serves the WARM pano too, and a round
    // whose own metadata failed (cur null) must still warm the next one.
    if (schedDirty && !lost) {
      schedDirty = false;
      schedule(); // may re-mark schedDirty via its own effects; that's fine
    }

    // Heartbeat: a visible, clean canvas repaints every ~2s (see lastPaintAt).
    if (!gate && !lost && ready && !dirty && Date.now() - lastPaintAt > 2000) dirty = true;

    let painted = false;
    if (dirty && !gate && !lost) painted = paint();
    else if (dirty && gate && ready) stampVisible();

    // `painted`, not the attempt: a contentless paint() no-ops without
    // advancing drawNo, and the evictor must only run against fresh stamps.
    if ((painted || uploaded) && !lost) evictTiles();

    if (painted && fadeFinished && moveTransition) {
      const completed = moveTransition;
      cur = completed.incoming;
      moveTransition = null;
      warmId = null; warmNotified = false;
      for (const pano of [...panos.values()]) if (pano !== cur) destroyPano(pano);
      curZoom = desiredZoom(cur.layout);
      forwardWarmId = null;
      settleTransition = {
        startedAt: tNow,
        baseFov: completed.baseFov,
      };
      dirty = true;
      schedDirty = true;
      // The destination is current and fully opaque now. Keep the short visual
      // settle, but release input immediately so walking never pays for it.
      completed.resolve(true);
    } else if (painted && settleFinished && settleTransition) {
      settleTransition = null;
      renderFov = fov;
    }

    if (ready && !notified && baseComplete(cur)) {
      notified = true;
      onPanoReady();
    }
    // Warm-slot readiness, checked on the frame cadence because tile uploads
    // land in pumpUploads: once the NEXT pano's base is fully on the GPU,
    // tell the host — from here a swap to it paints in one frame. OUTSIDE the
    // cur gate for the same reason uploads are.
    if (!lost && warmId && !warmNotified && onPrewarmed) {
      const w = panos.get(warmId);
      if (w && w.status === 'ready' && baseComplete(w)) {
        warmNotified = true;
        onPrewarmed(warmId);
      }
    }
    updateForwardPrewarm();
  }
  rafId = requestAnimationFrame(frame);

  // ------------------------------------------------------- context loss/restore
  const onContextLost = e => {
    e.preventDefault(); // required, or webglcontextrestored never fires
    if (destroyed) return;
    lost = true;
    // Forget textures NOW, not at restore: baseComplete reads these maps, and
    // leaving them populated would let onPanoReady lift the host's loading
    // cover onto a canvas that renders nothing.
    forgetTextures();
    warmNotified = false; // the warm slot's GPU tiles went with the context
    // Flush the download pipeline too: in-flight tiles keep decoding into
    // uploadQ while lost (~24MB of bitmaps at worst) and pumpUploads cannot
    // drain it. The restore path re-issues everything through schedule().
    uploadQ.length = 0;
    for (const p of panos.values()) abortPanoInflight(p);
  };
  const onContextRestored = () => {
    if (destroyed || gl.isContextLost()) return;
    meshes.clear();      // buffer names died with the old context; meshFor rebuilds
    uploadQ.length = 0;  // decoded bitmaps reference pre-loss scheduling; re-issue
    for (const p of panos.values()) abortPanoInflight(p);
    try { initGL(); } catch (err) {
      // Half-initialized GL is worse than a paused renderer: stay `lost`
      // (paints stay skipped, the last composited frame stays up). But a
      // permanently-lost web engine is a black round FOREVER (the 8s failsafe
      // is per-generation and already consumed mid-round), so: one deferred
      // retry, then hand the host an onFatal so it can rebuild the engine on
      // a FRESH canvas (webglcontextrestored never fires twice).
      console.error('[CustomStreetView] context restore failed:', err);
      restoreFailures++;
      if (restoreFailures >= 2) { if (onFatal) { try { onFatal(); } catch (e) {} } return; }
      setTimeout(() => {
        if (!destroyed && lost && !gl.isContextLost()) onContextRestored();
      }, 2500);
      return;
    }
    restoreFailures = 0;
    resize();            // viewport + fov clamps + dirty
    lost = false;
    dirty = true;
    schedDirty = true;
    notified = false;    // fireOnLoad dedupes per generation — harmless, keeps
                         // internal state consistent with the empty tile maps
    // Re-prewarm: schedule() only serves `cur`, and the prewarm effect will
    // not re-run for the same id — without this, onPrewarmed can never fire
    // again and mobile's commitPreload degrades to 'none' (a loading cover on
    // EVERY later round) for the rest of the session.
    if (warmId) { const id = warmId; warmId = null; prewarm(id); }
    // `cur`, the camera, and all pano METADATA survive on purpose: re-running
    // loadFresh would reset yaw/pitch/fov mid-round (a visible teleport) and
    // destroy the warm pano. The tile maps are empty, so schedule() refills
    // exactly what loadFresh would have — without touching the view.
  };
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);

  // The gate removes the last self-healing repaint, so environment changes
  // that can invalidate the composited frame must mark dirty explicitly.
  // These READ document.hidden only — the anti-cheat fingerprint reads the
  // visibilityState getter DESCRIPTOR off Document.prototype; never define,
  // wrap, or shadow it.
  const markEnvDirty = () => { dirty = true; };
  const onVisibility = () => { if (!document.hidden) dirty = true; };
  window.addEventListener('focus', markEnvDirty);
  window.addEventListener('pageshow', markEnvDirty);
  document.addEventListener('visibilitychange', onVisibility);

  function destroy() {
    destroyed = true;
    cancelMovement();
    cameraListeners.clear();
    cancelAnimationFrame(rafId);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    // Must come off too: the deferred loseContext below + preventDefault in
    // onContextLost means the browser WILL fire webglcontextrestored on this
    // dead engine, which would rebuild the program on every unmount.
    canvas.removeEventListener('webglcontextrestored', onContextRestored);
    window.removeEventListener('focus', markEnvDirty);
    window.removeEventListener('pageshow', markEnvDirty);
    document.removeEventListener('visibilitychange', onVisibility);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerleave', onPointerLeave);
    canvas.removeEventListener('pointerup', endPointer);
    canvas.removeEventListener('pointercancel', endPointer);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('dblclick', onDblClick);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('resize', resize);
    canvas.classList.remove('sv-nav-target');
    for (const p of [...panos.values()]) destroyPano(p); // aborts inflight + unqueues uploads too
    uploadQ.length = 0;
    for (const m of meshes.values()) { gl.deleteBuffer(m.vb); gl.deleteBuffer(m.ib); }
    meshes.clear();
    gl.deleteProgram(prog); // shaders were detached + deleted at link time
    // Browsers cap live WebGL contexts (~16); rounds remount this component,
    // so release the context instead of waiting on GC. Deferred: cleanup runs
    // BEFORE React detaches the node, and if the canvas is still in the DOM
    // afterwards (dev strict-mode effect replay), getContext would hand the
    // next engine this same — now dead — context, so only lose it on a real
    // unmount.
    setTimeout(() => {
      if (canvas.isConnected) return;
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    }, 0);
  }

  return {
    loadFresh,
    destroy,
    nudgeYaw,
    setSpin,
    faceNorth,
    prewarm,
    setGate,
    // ChinaGuessr (temporary): overlay and movement APIs.
    getNavFrame,
    groundPointAt,
    pickTarget,
    pickChevron,
    moveTo,
    onCamera,
    clearNavHover,
  };
}

// Resolve the round's stamped lat/lng to a live pano id. Map-file panoId
// strings go stale (July 15 audit: prod resolves by lat/lng ONLY), so a fresh
// lookup through the same StreetViewService the location finder uses is the
// only trustworthy path. Embed-parity first (nearest within 50m), then the
// finder's own wider net as a fallback.
async function resolvePanoId(lat, long) {
  await loader.importLibrary("streetView");
  const svs = new google.maps.StreetViewService();
  const tryGet = req => new Promise(resolve => {
    svs.getPanorama(req, (data, status) =>
      resolve(status === "OK" && data?.location?.pano ? data.location.pano : null));
  });
  let pano = await tryGet({
    location: { lat, lng: long },
    radius: 50,
    preference: google.maps.StreetViewPreference.NEAREST
  });
  if (!pano) pano = await tryGet({
    location: { lat, lng: long },
    radius: 1000,
    preference: google.maps.StreetViewPreference.BEST,
    sources: [google.maps.StreetViewSource.OUTDOOR]
  });
  return pano;
}

// Warm the browser HTTP cache with the base tiles while photometa is still in
// flight — tile URLs need only the pano id, and these z0-z2 coordinates are
// identical for both known layout families (512x256 and 416x208 bases). The
// engine's own loads then hit cache instead of the network.
const BASE_TILE_COORDS = [
  [0, 0, 0],
  [1, 0, 0], [1, 1, 0],
  [2, 0, 0], [2, 1, 0], [2, 2, 0], [2, 3, 0],
  [2, 0, 1], [2, 1, 1], [2, 2, 1], [2, 3, 1],
];
function prefetchBaseTiles(pano, providerId = 'google', maxZ = 2) {
  const tileFor = providerId === 'baidu' ? baiduTileUrl : tileUrl; // z0-z2 coords match Baidu's grid too
  for (const [z, x, y] of BASE_TILE_COORDS) {
    if (z > maxZ) continue;
    const im = new Image();
    im.crossOrigin = 'anonymous'; // must match the engine's requests to share cache
    im.src = tileFor(pano, z, x, y);
  }
}

const CustomStreetView = ({
  lat,
  long,
  heading,
  panoId = null, // FRESH pano id only (findLatLong's freshPano) — never map-file panoIds
  // 'google' | 'baidu'. Baidu (ChinaGuessr, temporary) always supplies panoId;
  // there is no Baidu resolver, so a missing id is a degraded load, not a
  // Google lookup. Web-only today; the mobile host passes nothing.
  provider = 'google',
  npz = false,
  showAnswer = false,
  hidden = false,
  // Mobile host only: the WebView is fully covered by a native screen (result
  // view). Gates DRAWING only — tile streaming, prewarm and the prefetched
  // signal keep flowing, so commitPreload can still answer 'ready'. Kept
  // separate from `hidden` because the two clear with different semantics
  // (see setGate in the engine). Defaults false so web call sites are
  // untouched.
  covered = false,
  // ChinaGuessr (temporary): Baidu movement is opt-in. Google and mobile do
  // not pass this prop and retain the existing No Move controls.
  allowMove = false,
  slowEnter = false,
  refreshKey = 0,
  // NEXT round's fresh pano id (or null): warms its base tiles into the HTTP
  // cache while the current round's answer screen covers the canvas, so the
  // next loadFresh paints from cache. Mobile embed only today; web's own flow
  // races prefetchBaseTiles against photometa inside startLoad instead.
  prefetchPano = null,
  // Fires once per prefetchPano when that pano's base tiles are ON THE GPU —
  // i.e. a swap to it would paint in one frame. Mobile host turns this into an
  // honest commitPreload 'ready'. Unused on web.
  onPrefetched = null,
  // Bumped by the host when prefetchPano REPEATS the same id (repeat
  // location / adjacent spots resolving to one pano): the prewarm effect must
  // re-run or commitPreload stays 'none' for that round.
  prefetchNonce = 0,
  onLoad
}) => {
  const canvasRef = useRef(null);
  const roseRef = useRef(null);
  const engineRef = useRef(null);
  const allowMoveRef = useRef(false); // ChinaGuessr (temporary)
  allowMoveRef.current = allowMove;
  const [navEngine, setNavEngine] = useState(null); // ChinaGuessr (temporary)
  // Fatal-engine recovery: a context restore that keeps failing can never
  // come back on the SAME canvas (webglcontextrestored fires once). Keying
  // the canvas + engine on this remounts both on fresh DOM. Capped so a
  // machine that kills every context cannot remount-storm.
  const [engineKey, setEngineKey] = useState(0);
  const fatalRemountsRef = useRef(0);
  const onLoadRef = useRef(onLoad);
  const loadGenRef = useRef(0);
  const firedGenRef = useRef(-1);
  // The generation the ENGINE is currently loading for (stamped just before
  // loadFresh). onPanoReady credits this, never loadGenRef-at-fire-time.
  const engineGenRef = useRef(-1);
  const failsafeRef = useRef(null);
  const frozenRef = useRef(false);
  onLoadRef.current = onLoad;
  const onPrefetchedRef = useRef(onPrefetched);
  onPrefetchedRef.current = onPrefetched;
  // NMPZ freeze — same contract as the iframe: locked during the round,
  // interactive again once the answer is shown.
  const frozen = npz && !showAnswer;
  frozenRef.current = frozen;

  const hasCoords = lat !== null && lat !== undefined && long !== null && long !== undefined && !(lat === 0 && long === 0);

  // Fire onLoad at most once per load generation — same contract as the
  // iframe's onload: the game's loading overlay waits on it. `degraded` means
  // "unblocking the round, NOT certifying a painted pano" (failsafe timeout,
  // resolve/metadata failure, no engine): the host must clear its cover but
  // must NOT stamp its loaded-round/loaded-key markers, or a later preload
  // commit would skip the loading cover for a pano that never painted.
  const fireOnLoad = (gen, degraded = false) => {
    // Stale generations are a FULL no-op — they must not clear the failsafe
    // either: the failsafe handle belongs to the CURRENT generation, and an
    // old pano completing during the next load's resolve await used to clear
    // the new round's failsafe and lift its cover over the old frame.
    if (gen !== loadGenRef.current) return;
    if (firedGenRef.current === gen) return;
    firedGenRef.current = gen;
    if (failsafeRef.current) { clearTimeout(failsafeRef.current); failsafeRef.current = null; }
    if (onLoadRef.current) onLoadRef.current(degraded);
  };

  const startLoad = (gen) => {
    // If tiles or the resolver hang, the iframe path would still have fired
    // onload eventually — match that so the game never spins forever.
    if (failsafeRef.current) clearTimeout(failsafeRef.current);
    failsafeRef.current = setTimeout(() => {
      failsafeRef.current = null;
      if (gen === loadGenRef.current) fireOnLoad(gen, true /* degraded */);
    }, 8000);
    (async () => {
      try {
        // A fresh pano id from the location finder skips the whole
        // getPanorama round trip; community-map rounds still resolve.
        const pano = panoId || (provider === 'baidu' ? null : await resolvePanoId(lat, long));
        if (gen !== loadGenRef.current || !engineRef.current) return;
        if (!pano) throw new Error('no pano near ' + lat + ',' + long);
        prefetchBaseTiles(pano, provider); // downloads race the metadata fetch below
        // From here the ENGINE is working for this generation: onPanoReady
        // must credit the generation whose loadFresh installed `cur`, not
        // whatever loadGenRef says at fire time (an old pano completing
        // during the NEXT load's resolve await would otherwise fire for it).
        engineGenRef.current = gen;
        const ok = await engineRef.current.loadFresh(pano, heading);
        if (gen !== loadGenRef.current || !engineRef.current) return;
        if (!ok) throw new Error('pano metadata failed for ' + pano);
        // success: the engine fires onPanoReady once base tiles are on screen
      } catch (err) {
        if (gen !== loadGenRef.current) return;
        console.error('[CustomStreetView] load failed:', err);
        // unblock the round rather than trapping the player on the loader
        fireOnLoad(gen, true /* degraded */);
      }
    })();
  };

  // The canvas only exists while coords do, so the engine's lifetime is tied
  // to hasCoords (effects run after commit — the canvas is in the DOM here).
  // Compass needle. Driven straight off the engine's yaw every frame — a
  // state update here would re-render the whole pano tree 60x a second. The
  // SVG transform attribute (not CSS) so only the needle turns, never the
  // grey face behind it.
  const spinRose = (yawRad) => {
    const el = roseRef.current;
    if (el) el.setAttribute('transform', `rotate(${(-yawRad * 180 / Math.PI).toFixed(2)} 20 20)`);
  };

  // Arrow press: a tap steps once, a hold spins. The spin waits out HOLD_MS so
  // a tap is EXACTLY one step — spinning from the first frame instead made a
  // tap worth "spin distance + 45deg" (a 199ms press moved 62deg, a 201ms press
  // 17deg: 2ms of human timing swinging the result 3x).
  // Keyed by pointerId, not a single slot: with two fingers on the two arrows,
  // releasing one used to stop the spin the OTHER finger was still holding and
  // hand back a step in the wrong direction.
  const HOLD_MS = 180;
  const holdRef = useRef(new Map());
  const armSpin = (dir) => (e) => {
    e.preventDefault();
    if (!engineRef.current) return;
    if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
    const rec = { dir, spinning: false, timer: null };
    rec.timer = setTimeout(() => {
      rec.timer = null;
      rec.spinning = true;
      if (engineRef.current) engineRef.current.setSpin(dir);
    }, HOLD_MS);
    holdRef.current.set(e.pointerId, rec);
  };
  const releaseSpin = (e) => {
    const rec = holdRef.current.get(e.pointerId);
    if (!rec) return;
    holdRef.current.delete(e.pointerId);
    if (rec.timer) clearTimeout(rec.timer);
    const engine = engineRef.current;
    if (!engine) return;
    if (!rec.spinning) { engine.nudgeYaw(rec.dir); return; }
    let stillHeld = null;
    for (const r of holdRef.current.values()) if (r.spinning) stillHeld = r;
    engine.setSpin(stillHeld ? stillHeld.dir : 0);
  };
  // Keyboard/AT activation only: a real click already ran the pointer pair
  // above, and `detail === 0` is how a synthesised click identifies itself.
  const keyStep = (dir) => (e) => {
    if (e.detail === 0 && engineRef.current) engineRef.current.nudgeYaw(dir);
  };

  useEffect(() => {
    if (!hasCoords || !canvasRef.current) return;
    const engine = createEngine(
      canvasRef.current,
      () => fireOnLoad(engineGenRef.current),
      () => frozenRef.current,
      spinRose,
      (id) => { if (onPrefetchedRef.current) onPrefetchedRef.current(id); },
      () => {
        // Fatal: a context restore failed twice. The only way back is a fresh
        // canvas element (restored fires once per context) — remount, capped.
        if (fatalRemountsRef.current >= 2) return;
        fatalRemountsRef.current++;
        setEngineKey((k) => k + 1);
      },
      provider,
      () => allowMoveRef.current,
    );
    engineRef.current = engine;
    setNavEngine(engine);
    return () => {
      engineRef.current = null;
      setNavEngine(null);
      if (failsafeRef.current) { clearTimeout(failsafeRef.current); failsafeRef.current = null; }
      for (const rec of holdRef.current.values()) if (rec.timer) clearTimeout(rec.timer);
      holdRef.current.clear();
      if (engine) engine.destroy();
    };
    // provider: a guard, not a hot path — switches always pass through
    // hasCoords=false first (see createEngine), this just rules out a stale
    // Google-bound engine if that ever stops being true.
  }, [hasCoords, engineKey, provider]);

  // ChinaGuessr (temporary): discard a stale ground hover as soon as Moving
  // is disabled. Re-enabling starts from the next real pointer position.
  useEffect(() => {
    if (!allowMove && engineRef.current?.clearNavHover) engineRef.current.clearNavHover();
  }, [allowMove]);

  // Draw gate. DECLARED IMMEDIATELY AFTER the createEngine effect and before
  // the load effect: effects run in declaration order within a commit, so a
  // freshly (re)built engine inherits the current gate here instead of
  // painting one full-rate round behind a concealed canvas. hasCoords stays in
  // the deps for exactly that rebuild case. Passive useEffect is correct: the
  // commit that drops `.hidden` starts the opacity fade at 0, so the one
  // pre-effect composite is invisible, and setGate's synchronous paint lands
  // before the next frame.
  useEffect(() => {
    if (engineRef.current) engineRef.current.setGate(hidden, covered);
  }, [hidden, covered, hasCoords, engineKey]);

  useEffect(() => {
    if (!hasCoords) return;
    const gen = ++loadGenRef.current;
    // No WebGL (engine creation failed): unblock the loader instead of
    // trapping the player — matches the iframe always firing onload.
    if (!engineRef.current) { fireOnLoad(gen, true /* degraded */); return; }
    startLoad(gen);
  }, [lat, long, panoId, refreshKey, hasCoords, engineKey]);

  // Warm the next pano the moment the host names it: base tiles into the HTTP
  // cache AND metadata into the engine's registry (prewarm), so the coming
  // loadFresh starts painting instead of fetching. Cheap and idempotent
  // (Image() cache-hits on repeats, ensurePano dedupes), no cleanup needed.
  useEffect(() => {
    if (!prefetchPano) return;
    prefetchBaseTiles(prefetchPano, provider);
    if (engineRef.current && engineRef.current.prewarm) engineRef.current.prewarm(prefetchPano);
    // prefetchNonce: same id, new round — must re-run (see the prop note).
  }, [prefetchPano, prefetchNonce, engineKey]);

  // Reload button contract shared with the iframe renderer.
  useEffect(() => {
    const mine = () => {
      if (hasCoords && engineRef.current) startLoad(++loadGenRef.current);
    };
    window.reloadLoc = mine;
    return () => { if (window.reloadLoc === mine) window.reloadLoc = null; };
  }, [lat, long, heading, panoId, hasCoords]);

  if (!hasCoords) return null;

  const navVisible = provider === 'baidu' && allowMove && !hidden && !frozen; // ChinaGuessr (temporary)

  return (
    <>
      <canvas
        key={engineKey}
        ref={canvasRef}
        id="streetview"
        className={`streetview ${frozen ? "nmpz" : ""} ${hidden ? "hidden" : ""} ${slowEnter ? "streetview--duel-enter" : ""} ${navVisible ? "sv-nav-enabled" : ""}`}
        style={{
          position: "fixed",
          inset: 0,
          width: "100vw",
          height: "100vh",
          zIndex: 100,
          touchAction: "none",
          backgroundColor: "#1a1a2e",
        }}
      />
      {navVisible && navEngine && <SvNavOverlay engine={navEngine} visible={navVisible} />}
      {/* Compass. The Google embed's own compass never reached the screen (the
          iframe is shoved up 285px to bury Google's controls) and the WebGL
          pano draws no Google chrome at all, so No Move / NMPZ ship their own
          — a rebuild of Maps' compass control: four-facet needle, red north,
          grey south, lit from the top-left. `yaw` is a true bearing (verified
          against known geography, not against the round's start heading), so
          rotate(-yaw) puts the red tip on real north. The arrows rotate and
          the needle resets to north; only the buttons take pointer input, the
          container itself stays transparent to drags. */}
      <div className={`sv-compass ${hidden ? "sv-compass--hidden" : ""} ${frozen ? "sv-compass--frozen" : ""}`}>
        {!frozen && (
          <button type="button" className="sv-compass__rotate sv-compass__rotate--ccw"
            aria-label="Rotate left"
            onPointerDown={armSpin(-1)} onPointerUp={releaseSpin} onPointerCancel={releaseSpin}
            onClick={keyStep(-1)}>
            <svg viewBox="0 0 16 26" aria-hidden="true">
              <path d="M11 6 A 9 9 0 0 0 11 20" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M11.6 2.6 L11.6 9.4 L6.2 6 Z" fill="#fff" />
            </svg>
          </button>
        )}
        <button type="button" className="sv-compass__face"
          aria-label="Reset the view to north"
          disabled={frozen} onClick={() => engineRef.current && engineRef.current.faceNorth()}>
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="15.5" fill="rgba(255,255,255,0.17)" />
            <g ref={roseRef}>
              <polygon points="20,4 20,20 15.2,20" fill="#ea4335" />
              <polygon points="20,4 24.8,20 20,20" fill="#c5221f" />
              <polygon points="20,36 15.2,20 20,20" fill="#ffffff" />
              <polygon points="20,36 24.8,20 20,20" fill="#c8ccd0" />
            </g>
          </svg>
        </button>
        {!frozen && (
          <button type="button" className="sv-compass__rotate sv-compass__rotate--cw"
            aria-label="Rotate right"
            onPointerDown={armSpin(1)} onPointerUp={releaseSpin} onPointerCancel={releaseSpin}
            onClick={keyStep(1)}>
            <svg viewBox="0 0 16 26" aria-hidden="true">
              <path d="M5 6 A 9 9 0 0 1 5 20" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M4.4 2.6 L4.4 9.4 L9.8 6 Z" fill="#fff" />
            </svg>
          </button>
        )}
      </div>
      {!hidden && (
        <div
          style={{
            position: "fixed",
            bottom: 6,
            left: 8,
            zIndex: 101,
            pointerEvents: "none",
            fontSize: 11,
            fontFamily: "Arial, sans-serif",
            color: "rgba(255,255,255,0.75)",
            textShadow: "0 0 2px rgba(0,0,0,0.8)",
            userSelect: "none",
          }}
        >
          {provider === 'baidu' ? <>Imagery &copy; Baidu</> : <>Imagery &copy;{new Date().getFullYear()} Google</>}
        </div>
      )}
    </>
  );
};

export default CustomStreetView;
