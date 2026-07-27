import React, { useEffect, useRef } from "react";
import { Loader } from '@googlemaps/js-api-loader';

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
const CACHE_MAX = 150, CACHE_TRIM = 120;  // detail tiles on the current pano
const BIAS = 0.75;            // resolution bias for zoom level selection
const D2R = Math.PI / 180;
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

function createEngine(canvas, onPanoReady, isFrozen, onYaw, onPrewarmed) {
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'high-performance' });
  if (!gl) return null;
  const onContextLost = e => { e.preventDefault(); };
  canvas.addEventListener('webglcontextlost', onContextLost);

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
  const FS = `
precision mediump float;
uniform sampler2D uTex;
varying vec2 vUV;
void main() { gl_FragColor = vec4(texture2D(uTex, vUV).rgb, 1.0); }`;

  function shader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const loc = {};
  for (const n of ['uAng', 'uUV', 'uVP', 'uYawOff', 'uTex'])
    loc[n] = gl.getUniformLocation(prog, n);
  const locA = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(locA);
  gl.uniform1i(loc.uTex, 0);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.clearColor(0.043, 0.051, 0.063, 1);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic')
    || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
  const anisoMax = aniso ? Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)) : 0;

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
  function buildMatrices() {
    const { R, U, F } = camBasis();
    camF = F;
    const f = 1 / Math.tan(fov / 2), near = 0.05, far = 4000;
    const p00 = f / aspect, p11 = f;
    const p22 = (far + near) / (near - far), p32 = 2 * far * near / (near - far);
    vpMat[0] = p00 * R[0]; vpMat[4] = p00 * R[1]; vpMat[8] = p00 * R[2]; vpMat[12] = 0;
    vpMat[1] = p11 * U[0]; vpMat[5] = p11 * U[1]; vpMat[9] = p11 * U[2]; vpMat[13] = 0;
    vpMat[2] = -p22 * F[0]; vpMat[6] = -p22 * F[1]; vpMat[10] = -p22 * F[2]; vpMat[14] = p32;
    vpMat[3] = F[0]; vpMat[7] = F[1]; vpMat[11] = F[2]; vpMat[15] = 0;
    const ty = Math.tan(fov / 2);
    halfViewAngle = Math.atan(Math.hypot(ty * aspect, ty));
  }

  // ---------------------------------------------------------------- pano layout
  function makeLayout(baseW, baseH, maxZ) {
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
          uv: [(px1 - x * TILE) / TILE, (py1 - y * TILE) / TILE],
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
      im.src = tileUrl(pano, t.z, t.x, t.y);
    }))).then(oks => {
      const i = oks.indexOf(true);
      return i < 0 ? null : makeLayout(tries[i].baseW, tries[i].baseH, tries[i].maxZ);
    });
  }

  // ---------------------------------------------------------------- metadata
  // photometa/v1 is the undocumented endpoint the Maps client itself uses; it
  // serves Access-Control-Allow-Origin: * so a plain fetch works. Response is
  // protobuf dumped as positional JSON arrays; paths below verified empirically.
  async function fetchMeta(p) {
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

  // ---------------------------------------------------------------- pano registry
  const panos = new Map();
  let cur = null;
  let worldGen = 0, frameNo = 0, curZoom = 0;
  const inflight = new Set();
  const uploadQ = [];

  async function ensurePano(id) {
    let p = panos.get(id);
    if (!p) {
      p = {
        id, status: 'loading', destroyed: false,
        layout: null, tiles: [], dead: new Set(),
        lat: 0, lng: 0, heading: 0, metaPromise: null,
      };
      panos.set(id, p);
      p.metaPromise = fetchMeta(p).catch(() => { p.status = 'error'; });
    }
    await p.metaPromise;
    return p.status === 'ready' && !p.destroyed ? p : null;
  }

  function destroyPano(p) {
    p.destroyed = true;
    for (const m of p.tiles) for (const rec of m.values()) gl.deleteTexture(rec.tex);
    p.tiles = [];
    panos.delete(p.id);
  }

  // ---------------------------------------------------------------- tile streaming
  function startLoad(p, meta) {
    const gkey = p.id + '|' + meta.key;
    inflight.add(gkey);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = tileUrl(p.id, meta.z, meta.x, meta.y);
    const done = img.decode ? img.decode() : new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    done.then(() => {
      if (p.destroyed) { inflight.delete(gkey); return; }
      uploadQ.push({ p, img, meta });
    }).catch(() => {
      p.dead.add(meta.key);
      inflight.delete(gkey);
    });
  }

  function pumpUploads() {
    for (let i = 0; i < UPLOADS_PER_FRAME && uploadQ.length; i++) {
      const { p, img, meta } = uploadQ.shift();
      inflight.delete(p.id + '|' + meta.key);
      if (p.destroyed) continue;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, anisoMax);
      p.tiles[meta.z].set(meta.key, { tex, meta, lastUse: frameNo });
    }
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
        if (!p.tiles[z].has(m.key) && !p.dead.has(m.key) && !inflight.has(p.id + '|' + m.key))
          jobs.push({ p, m, pri: z });
  }

  function addDetailJobs(p, jobs) {
    const cf = camFImage(p);
    const zTop = Math.min(curZoom, p.layout.maxZ);
    for (let z = 3; z <= zTop; z++)
      for (const m of p.layout.meta[z]) {
        if (p.tiles[z].has(m.key) || p.dead.has(m.key) || inflight.has(p.id + '|' + m.key)) continue;
        if (!tileVisible(m, cf)) continue;
        const ang = Math.acos(Math.max(-1, Math.min(1, m.dir[0] * cf[0] + m.dir[1] * cf[1] + m.dir[2] * cf[2])));
        jobs.push({ p, m, pri: 10 + z * 10 + ang });
      }
  }

  function schedule() {
    if (!cur || cur.status !== 'ready') return;
    curZoom = desiredZoom(cur.layout);
    const jobs = [];
    addBaseJobs(cur, jobs);
    addDetailJobs(cur, jobs);
    jobs.sort((a, b) => a.pri - b.pri);
    for (const j of jobs) {
      if (inflight.size >= MAX_INFLIGHT) break;
      startLoad(j.p, j.m);
    }
  }

  function evictTiles() {
    if (!cur || cur.status !== 'ready') return;
    let total = 0;
    for (const m of cur.tiles) total += m.size;
    if (total <= CACHE_MAX) return;
    const victims = [];
    for (let z = 3; z < cur.tiles.length; z++)
      for (const rec of cur.tiles[z].values())
        if (rec.lastUse < frameNo) victims.push(rec);
    victims.sort((a, b) => a.lastUse - b.lastUse);
    for (const v of victims) {
      if (total <= CACHE_TRIM) break;
      gl.deleteTexture(v.tex);
      cur.tiles[v.meta.z].delete(v.meta.key);
      total--;
    }
  }

  // ---------------------------------------------------------------- draw
  function drawPano(p) {
    if (!p || p.status !== 'ready') return;
    gl.uniform1f(loc.uYawOff, p.heading);
    const cf = camFImage(p);
    const zTop = Math.min(curZoom, p.layout.maxZ);
    for (let z = 0; z <= zTop; z++) {
      if (!p.tiles[z] || !p.tiles[z].size) continue;
      const mesh = meshFor(z);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vb);
      gl.vertexAttribPointer(locA, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib);
      for (const rec of p.tiles[z].values()) {
        if (z >= 3 && !tileVisible(rec.meta, cf)) continue;
        rec.lastUse = frameNo;
        gl.bindTexture(gl.TEXTURE_2D, rec.tex);
        gl.uniform4fv(loc.uAng, rec.meta.ang);
        gl.uniform2fv(loc.uUV, rec.meta.uv);
        gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
      }
    }
  }

  function draw() {
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniformMatrix4fv(loc.uVP, false, vpMat);
    drawPano(cur);
  }

  // ---------------------------------------------------------------- input
  const pointers = new Map();
  let dragging = false, panned = false, pinch = null, touchFling = false;
  // Trailing ~100ms of angular deltas — release velocity comes from this
  // window. Per-event dx/dt estimates lie badly: 120Hz phones halve them
  // (via any dt floor) and batched touch events spike them.
  const flick = [];

  const onPointerDown = e => {
    if (isFrozen()) return;
    spinDir = 0; yawAnim = null; // a real drag always beats the compass control
    canvas.setPointerCapture(e.pointerId);
    touchFling = e.pointerType === 'touch';
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
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
    if (isFrozen()) return;
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
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
    if (!pointers.delete(e.pointerId)) return;
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
  };

  const onWheel = e => {
    if (isFrozen()) return;
    e.preventDefault();
    let dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    if (e.ctrlKey) dy *= 3;
    // one wheel notch (~100) is a gentle ~1.16x fov step
    fovT = Math.min(FOV_MAX, Math.max(FOV_MIN, fovT * Math.exp(dy * 0.0015)));
    anchor = { x: e.clientX, y: e.clientY };
  };

  const onDblClick = e => {
    if (isFrozen()) return;
    fovT = Math.max(FOV_MIN, fovT / 2); // one GSV zoom level
    anchor = { x: e.clientX, y: e.clientY };
  };

  const isTypingTarget = t =>
    t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  const onKeyDown = e => {
    if (isFrozen() || isTypingTarget(e.target)) return;
    keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
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
    if (isFrozen()) return;
    const step = Math.min(45 * D2R, fov * 0.7); // smaller steps when zoomed in
    animYawTo((yawAnim === null ? yaw : yawAnim) + dir * step);
  }
  function setSpin(dir) {
    if (isFrozen()) { spinDir = 0; return; }
    spinDir = dir;
    if (dir) { yawAnim = null; vYaw = 0; vPitch = 0; }
  }
  function faceNorth() {
    if (isFrozen()) return;
    spinDir = 0;
    animYawTo(0);
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
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
    // Reveal at z1 (1024x512 equirect — recognizable, sharpens in view like
    // Google's own streaming) instead of waiting out the full z2 wave.
    const zMax = Math.min(1, p.layout.maxZ);
    for (let z = 0; z <= zMax; z++)
      for (const m of p.layout.meta[z])
        if (!p.tiles[z].has(m.key) && !p.dead.has(m.key)) return false;
    return true;
  }

  // Full warm-up for the NEXT pano, the WebGL equivalent of the iframe's
  // hidden preload slot: metadata registered AND base tiles downloaded and
  // UPLOADED to GPU textures (pumpUploads serves any registered pano, and
  // evictTiles only ever touches `cur`, so warm textures survive untouched).
  // When its z<=1 base is complete, frame() fires onPrewarmed exactly once —
  // the host's cue that commitPreload may honestly answer 'ready'. The coming
  // loadFresh then swaps to already-painted content in a single frame.
  let warmId = null, warmNotified = false;
  function prewarm(id) {
    if (!id || destroyed) return;
    if (warmId !== id) { warmId = id; warmNotified = false; }
    ensurePano(id).then((p) => {
      if (!p || destroyed) return;
      const zMax = Math.min(2, p.layout.maxZ);
      for (let z = 0; z <= zMax; z++)
        for (const m of p.layout.meta[z])
          if (!p.tiles[z].has(m.key) && !p.dead.has(m.key) && !inflight.has(p.id + '|' + m.key))
            startLoad(p, m);
    }).catch(() => {});
  }

  async function loadFresh(id, headingDeg) {
    worldGen++;
    // Spare an already-prewarmed incoming pano — its registered metadata and
    // GPU-resident base tiles are the whole point of the between-rounds
    // warm-up. destroyPano removes each entry from the registry itself.
    for (const p of [...panos.values()]) if (p.id !== id) destroyPano(p);
    warmId = null; warmNotified = false; // consumed (or superseded) either way
    cur = null;
    uploadQ.length = 0; inflight.clear();
    notified = false;
    const gen = worldGen;
    const p = await ensurePano(id);
    if (gen !== worldGen || destroyed) return false;
    if (!p) return false;
    cur = p;
    yaw = (headingDeg !== null && headingDeg !== undefined && isFinite(headingDeg)) ? headingDeg * D2R : p.heading;
    // Portrait's tall fov puts half the frame above the horizon at pitch 0 —
    // start tilted down so the view favors the road, not the sky (the embed's
    // road-heavy mobile framing; its URL only carries fov=100 + no pitch, so
    // this is tuned by eye, not copied).
    pitch = aspect < 1 ? -20 * D2R : 0;
    vYaw = 0; vPitch = 0;
    spinDir = 0; yawAnim = null; // a compass press from the last round must not follow us here
    fov = fovT = FOV_MAX; // GSV default view = zoom 1 equivalent, fully zoomed out
    anchor = { x: cssW / 2, y: cssH / 2 };
    emitYaw(true); // new round starts at a new bearing — don't wait on a delta
    return true;
  }

  // ---------------------------------------------------------------- main loop
  let tPrev = 0, rafId = 0, destroyed = false;

  function frame(tNow) {
    if (destroyed) return;
    rafId = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (tNow - tPrev) / 1000 || 0.016);
    tPrev = tNow;
    frameNo++;

    // NMPZ: every input ENTRY point is gated on isFrozen, but motion already in
    // flight when the freeze lands would sail straight across the round
    // boundary and pan a locked pano — a held arrow (its button unmounts
    // mid-press, so no pointerup ever reaches it), a held key, a fling, or a
    // running compass ease. loadFresh clears all of it, but loadFresh does NOT
    // run when the next pano fails to resolve, which leaves the old pano
    // spinning with no way to stop it. Kill motion at the integrator instead.
    if (isFrozen()) {
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
      if (keys.has('ArrowLeft') || keys.has('ArrowRight')) yawAnim = null;
      if (keys.has('ArrowLeft')) yaw -= r;
      if (keys.has('ArrowRight')) yaw += r;
      if (keys.has('ArrowUp')) pitch = clampPitch(pitch + r);
      if (keys.has('ArrowDown')) pitch = clampPitch(pitch - r);
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

    buildMatrices();
    emitYaw(false);
    if (cur && cur.status === 'ready') {
      schedule();
      pumpUploads();
      draw();
      evictTiles();
      if (!notified && baseComplete(cur)) {
        notified = true;
        onPanoReady();
      }
      // Warm-slot readiness, checked on the frame cadence because tile uploads
      // land in pumpUploads: once the NEXT pano's base is fully on the GPU,
      // tell the host — from here a swap to it paints in one frame.
      if (warmId && !warmNotified && onPrewarmed) {
        const w = panos.get(warmId);
        if (w && w.status === 'ready' && baseComplete(w)) {
          warmNotified = true;
          onPrewarmed(warmId);
        }
      }
    } else {
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
  }
  rafId = requestAnimationFrame(frame);

  function destroy() {
    destroyed = true;
    cancelAnimationFrame(rafId);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', endPointer);
    canvas.removeEventListener('pointercancel', endPointer);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('dblclick', onDblClick);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('resize', resize);
    for (const p of [...panos.values()]) destroyPano(p);
    for (const m of meshes.values()) { gl.deleteBuffer(m.vb); gl.deleteBuffer(m.ib); }
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

  return { loadFresh, destroy, nudgeYaw, setSpin, faceNorth, prewarm };
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
function prefetchBaseTiles(pano) {
  for (const [z, x, y] of BASE_TILE_COORDS) {
    const im = new Image();
    im.crossOrigin = 'anonymous'; // must match the engine's requests to share cache
    im.src = tileUrl(pano, z, x, y);
  }
}

const CustomStreetView = ({
  lat,
  long,
  heading,
  panoId = null, // FRESH pano id only (findLatLong's freshPano) — never map-file panoIds
  npz = false,
  showAnswer = false,
  hidden = false,
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
  onLoad
}) => {
  const canvasRef = useRef(null);
  const roseRef = useRef(null);
  const engineRef = useRef(null);
  const onLoadRef = useRef(onLoad);
  const loadGenRef = useRef(0);
  const firedGenRef = useRef(-1);
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
  // iframe's onload: the game's loading overlay waits on it.
  const fireOnLoad = (gen) => {
    if (firedGenRef.current === gen) return;
    firedGenRef.current = gen;
    if (failsafeRef.current) { clearTimeout(failsafeRef.current); failsafeRef.current = null; }
    if (onLoadRef.current) onLoadRef.current();
  };

  const startLoad = (gen) => {
    // If tiles or the resolver hang, the iframe path would still have fired
    // onload eventually — match that so the game never spins forever.
    if (failsafeRef.current) clearTimeout(failsafeRef.current);
    failsafeRef.current = setTimeout(() => {
      failsafeRef.current = null;
      if (gen === loadGenRef.current) fireOnLoad(gen);
    }, 8000);
    (async () => {
      try {
        // A fresh pano id from the location finder skips the whole
        // getPanorama round trip; community-map rounds still resolve.
        const pano = panoId || await resolvePanoId(lat, long);
        if (gen !== loadGenRef.current || !engineRef.current) return;
        if (!pano) throw new Error('no pano near ' + lat + ',' + long);
        prefetchBaseTiles(pano); // downloads race the photometa fetch below
        const ok = await engineRef.current.loadFresh(pano, heading);
        if (gen !== loadGenRef.current || !engineRef.current) return;
        if (!ok) throw new Error('pano metadata failed for ' + pano);
        // success: the engine fires onPanoReady once base tiles are on screen
      } catch (err) {
        if (gen !== loadGenRef.current) return;
        console.error('[CustomStreetView] load failed:', err);
        // unblock the round rather than trapping the player on the loader
        fireOnLoad(gen);
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
      () => fireOnLoad(loadGenRef.current),
      () => frozenRef.current,
      spinRose,
      (id) => { if (onPrefetchedRef.current) onPrefetchedRef.current(id); },
    );
    engineRef.current = engine;
    return () => {
      engineRef.current = null;
      if (failsafeRef.current) { clearTimeout(failsafeRef.current); failsafeRef.current = null; }
      for (const rec of holdRef.current.values()) if (rec.timer) clearTimeout(rec.timer);
      holdRef.current.clear();
      if (engine) engine.destroy();
    };
  }, [hasCoords]);

  useEffect(() => {
    if (!hasCoords) return;
    const gen = ++loadGenRef.current;
    // No WebGL (engine creation failed): unblock the loader instead of
    // trapping the player — matches the iframe always firing onload.
    if (!engineRef.current) { fireOnLoad(gen); return; }
    startLoad(gen);
  }, [lat, long, panoId, refreshKey, hasCoords]);

  // Warm the next pano the moment the host names it: base tiles into the HTTP
  // cache AND metadata into the engine's registry (prewarm), so the coming
  // loadFresh starts painting instead of fetching. Cheap and idempotent
  // (Image() cache-hits on repeats, ensurePano dedupes), no cleanup needed.
  useEffect(() => {
    if (!prefetchPano) return;
    prefetchBaseTiles(prefetchPano);
    if (engineRef.current && engineRef.current.prewarm) engineRef.current.prewarm(prefetchPano);
  }, [prefetchPano]);

  // Reload button contract shared with the iframe renderer.
  useEffect(() => {
    const mine = () => {
      if (hasCoords && engineRef.current) startLoad(++loadGenRef.current);
    };
    window.reloadLoc = mine;
    return () => { if (window.reloadLoc === mine) window.reloadLoc = null; };
  }, [lat, long, heading, panoId, hasCoords]);

  if (!hasCoords) return null;

  return (
    <>
      <canvas
        ref={canvasRef}
        id="streetview"
        className={`streetview ${frozen ? "nmpz" : ""} ${hidden ? "hidden" : ""}`}
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
          Imagery &copy;{new Date().getFullYear()} Google
        </div>
      )}
    </>
  );
};

export default CustomStreetView;
