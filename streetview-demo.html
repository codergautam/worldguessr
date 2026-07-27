<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>Street View Recon</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: #0b0d10; overscroll-behavior: none; }
  #c {
    position: absolute; inset: 0; width: 100%; height: 100%;
    touch-action: none; cursor: pointer; user-select: none; -webkit-user-select: none;
  }
  #c.dragging { cursor: all-scroll; }
  .hud {
    position: absolute; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    color: #cfd6e4; pointer-events: none; z-index: 2;
  }
  #panel {
    top: 12px; left: 12px; padding: 10px 12px; border-radius: 10px;
    background: rgba(12, 14, 18, 0.72); border: 1px solid rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    max-width: min(420px, calc(100vw - 24px));
  }
  #panel h1 { font-size: 13px; font-weight: 600; letter-spacing: 0.08em; color: #e8edf6; margin-bottom: 8px; }
  #panel h1 span { color: #6b7688; font-weight: 400; }
  .row { display: flex; gap: 6px; pointer-events: auto; }
  #pid {
    flex: 1; min-width: 0; font: inherit; font-size: 12px; color: #e8edf6;
    background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px; padding: 5px 8px; outline: none;
  }
  #pid:focus { border-color: rgba(130, 170, 255, 0.5); }
  #pid.bad { border-color: rgba(255, 100, 100, 0.7); }
  #go {
    font: inherit; font-size: 12px; color: #dfe7f4; cursor: pointer;
    background: rgba(130, 170, 255, 0.16); border: 1px solid rgba(130, 170, 255, 0.35);
    border-radius: 6px; padding: 5px 12px;
  }
  #go:hover { background: rgba(130, 170, 255, 0.28); }
  #stats { margin-top: 8px; font-size: 11px; color: #8b95a7; white-space: nowrap; }
  #place { margin-top: 4px; font-size: 11px; color: #a9b6cb; }
  #place:empty { display: none; }
  #status { margin-top: 4px; font-size: 11px; color: #ffd28a; min-height: 0; }
  #status:empty { display: none; }
  #hint {
    bottom: 12px; left: 50%; transform: translateX(-50%);
    font-size: 11px; color: rgba(207, 214, 228, 0.55); text-align: center;
    background: rgba(12, 14, 18, 0.5); padding: 5px 12px; border-radius: 999px;
    white-space: nowrap;
  }
  #credit { bottom: 12px; right: 12px; font-size: 10px; color: rgba(207, 214, 228, 0.4); }
  @media (max-width: 640px) { #hint { display: none; } }
</style>
</head>
<body>
<canvas id="c"></canvas>
<div class="hud" id="panel">
  <h1>STREET VIEW RECON <span>raw tile client</span></h1>
  <div class="row">
    <input id="pid" spellcheck="false" placeholder="panoid or tile url" value="bZKMVNJv6m_I_gHgX9bclQ">
    <button id="go">load</button>
  </div>
  <div id="stats">booting</div>
  <div id="place"></div>
  <div id="status"></div>
</div>
<div class="hud" id="hint">drag to look &middot; scroll or pinch to zoom</div>
<div class="hud" id="credit">tiles: streetviewpixels-pa.googleapis.com &middot; imagery &copy; Google</div>
<script>
'use strict';
(() => {

const TILE = 512;
const MAX_INFLIGHT = 12;      // concurrent tile downloads
const UPLOADS_PER_FRAME = 3;  // GPU texture uploads per frame, keeps frame pacing flat
const CACHE_MAX = 150, CACHE_TRIM = 120;  // detail tiles on the current pano
const BIAS = 0.75;            // resolution bias for zoom level selection
const D2R = Math.PI / 180;
// Google's zoom model, applied to the LONG viewport axis (portrait phones
// otherwise derive a ~145 deg vertical fov at the floor). Floor ~110 deg
// (GeoGuessr-style wide), portrait slightly tighter, ceiling = GSV zoom 4.
const LFOV_MAX = 110 * D2R, LFOV_MAX_PORTRAIT = 105 * D2R, LFOV_MIN = 11.25 * D2R;
let FOV_MIN = 0.2, FOV_MAX = 1.6; // vertical equivalents, derived in resize()
const PI = Math.PI, TAU = 2 * Math.PI;

const $ = id => document.getElementById(id);
const canvas = $('c'), statsEl = $('stats'), statusEl = $('status'), placeEl = $('place');
const status = t => { statusEl.textContent = t; };

const tileUrl = (p, z, x, y) =>
  `https://streetviewpixels-pa.googleapis.com/v1/tile?cb_client=maps_sv.tactile&panoid=${encodeURIComponent(p)}&x=${x}&y=${y}&zoom=${z}&nbt=1&fover=2`;
const metaUrl = p =>
  'https://www.google.com/maps/photometa/v1?authuser=0&hl=en&gl=us&pb=!1m4!1smaps_sv.tactile!11m2!2m1!1b1!2m2!1sen!2sus!3m3!1m2!1e2!2s'
  + encodeURIComponent(p)
  + '!4m57!1e1!1e2!1e3!1e4!1e5!1e6!1e8!1e12!2m1!1e1!4m1!1i48!5m1!1e1!5m1!1e2!6m1!1e1!6m1!1e2!9m36!1m3!1e2!2b1!3e2!1m3!1e2!2b0!3e3!1m3!1e3!2b1!3e2!1m3!1e3!2b0!3e3!1m3!1e8!2b0!3e3!1m3!1e1!2b0!3e3!1m3!1e4!2b0!3e3!1m3!1e10!2b1!3e2!1m3!1e10!2b0!3e3';

// ---------------------------------------------------------------- gl setup
const gl = canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'high-performance' });
if (!gl) { status('WebGL unavailable in this browser'); return; }
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); status('graphics context lost, reload the page'); });

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
let vYaw = 0, vPitch = 0;
let anchor = { x: 0, y: 0 };
const keys = new Set();

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cssW = window.innerWidth; cssH = window.innerHeight;
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
window.addEventListener('resize', resize);
resize();

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

  const addr = md[3] && md[3][2];
  p.place = Array.isArray(addr) ? addr.map(a => a && a[0]).filter(Boolean).join(', ') : '';
  const dt = md[6] && md[6][7];
  p.date = Array.isArray(dt) && dt[0]
    ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][((dt[1] || 1) - 1) % 12] + ' ' + dt[0]
    : '';

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
let dragging = false, pinch = null, touchFling = false;
// Trailing ~100ms of angular deltas — release velocity comes from this
// window; per-event dx/dt estimates halve on 120Hz screens and spike on
// batched touch events.
const flick = [];

canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  touchFling = e.pointerType === 'touch';
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  vYaw = 0; vPitch = 0;
  flick.length = 0;
  dragging = true;
  canvas.classList.add('dragging');
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), fov0: fovT };
  }
});

canvas.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
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
});

function endPointer(e) {
  if (!pointers.delete(e.pointerId)) return;
  if (pointers.size < 2) pinch = null;
  if (pointers.size === 0) {
    dragging = false;
    canvas.classList.remove('dragging');
    // Average velocity across the trailing window; a held-then-released
    // finger has an empty window (samples aged out) — no fling.
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
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  let dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
  if (e.ctrlKey) dy *= 3;
  // one wheel notch (~100) is a gentle ~1.16x fov step
  fovT = Math.min(FOV_MAX, Math.max(FOV_MIN, fovT * Math.exp(dy * 0.0015)));
  anchor = { x: e.clientX, y: e.clientY };
}, { passive: false });

canvas.addEventListener('dblclick', e => {
  fovT = Math.max(FOV_MIN, fovT / 2); // one GSV zoom level
  anchor = { x: e.clientX, y: e.clientY };
});

window.addEventListener('keydown', e => {
  if (e.target === $('pid')) return;
  keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
});
window.addEventListener('keyup', e => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
window.addEventListener('blur', () => keys.clear());

// ---------------------------------------------------------------- pano input
function parsePano(s) {
  s = s.trim();
  const m = s.match(/panoid=([\w-]+)/) || s.match(/[?&]pano=([\w-]+)/) || s.match(/!1s([\w-]+)/);
  if (m) return m[1];
  if (/^[\w-]{8,}$/.test(s)) return s;
  return null;
}

async function loadFresh(id) {
  worldGen++;
  for (const p of [...panos.values()]) destroyPano(p);
  panos.clear();
  cur = null;
  uploadQ.length = 0; inflight.clear();
  status('loading pano metadata');
  const gen = worldGen;
  const p = await ensurePano(id);
  if (gen !== worldGen) return;
  if (!p) { status('could not load this panoid, check it and try again'); return; }
  cur = p;
  yaw = p.heading;
  // Portrait's tall fov puts half the frame above the horizon at pitch 0 —
  // start tilted down so the view favors the road, not the sky.
  pitch = aspect < 1 ? -20 * D2R : 0;
  vYaw = 0; vPitch = 0;
  fov = fovT = FOV_MAX; // GSV default view = zoom 1, fully zoomed out
  anchor = { x: cssW / 2, y: cssH / 2 };
  status('');
}

function submit() {
  const id = parsePano($('pid').value);
  if (!id) {
    $('pid').classList.add('bad');
    setTimeout(() => $('pid').classList.remove('bad'), 900);
    return;
  }
  $('pid').blur();
  loadFresh(id);
}
$('go').addEventListener('click', submit);
$('pid').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });

// shareable view state in the url hash
let lastHash = '';
function writeHash() {
  if (!cur || cur.status !== 'ready') return;
  const h = `p=${cur.id}&y=${(yaw / D2R).toFixed(1)}&pi=${(pitch / D2R).toFixed(1)}&f=${Math.round(fovT / D2R)}`;
  if (h !== lastHash) {
    lastHash = h;
    try { history.replaceState(null, '', '#' + h); } catch (e) {}
  }
}
function readHash() {
  const m = {};
  location.hash.slice(1).split('&').forEach(kv => {
    const [k, val] = kv.split('=');
    if (k && val !== undefined) m[k] = val;
  });
  return m;
}

// ---------------------------------------------------------------- main loop
let tPrev = 0, emaDt = 1 / 60, hudT = 0;

function frame(tNow) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (tNow - tPrev) / 1000 || 0.016);
  tPrev = tNow;
  frameNo++;
  emaDt = emaDt * 0.92 + dt * 0.08;

  if (!dragging && (vYaw || vPitch)) {
    yaw += vYaw * dt;
    pitch = clampPitch(pitch + vPitch * dt);
    // heavy friction, GSV-style: the fling dies out in a couple hundred ms.
    // Touch carries slightly longer — a thumb flick expects more glide.
    const d = Math.exp(-dt / (touchFling ? 0.18 : 0.12));
    vYaw *= d; vPitch *= d;
    if (Math.hypot(vYaw, vPitch) < 0.01) { vYaw = 0; vPitch = 0; }
  }
  if (keys.size) {
    const r = fov * 0.9 * dt;
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
    yaw += wrapPi(before.theta - after.theta);
    pitch = clampPitch(pitch + (before.phi - after.phi));
  }

  buildMatrices();
  if (cur && cur.status === 'ready') {
    schedule();
    pumpUploads();
    draw();
    evictTiles();
  } else {
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  hudT += dt;
  if (hudT > 0.25) {
    hudT = 0;
    let cached = 0;
    if (cur && cur.status === 'ready') for (const m of cur.tiles) cached += m.size;
    statsEl.textContent =
      `fps ${Math.round(1 / emaDt)} · z${curZoom}/${cur && cur.layout ? cur.layout.maxZ : '?'}` +
      ` · fov ${Math.round(fov / D2R)}° · tiles ${cached} · net ${inflight.size}`;
    placeEl.textContent = cur && cur.status === 'ready'
      ? [cur.place, cur.date].filter(Boolean).join(' · ') : '';
    if (!dragging) writeHash();
  }
}

const hp = readHash();
const bootId = hp.p && /^[\w-]{8,}$/.test(hp.p) ? hp.p : 'bZKMVNJv6m_I_gHgX9bclQ';
$('pid').value = bootId;
loadFresh(bootId).then(() => {
  if (!cur || cur.id !== bootId) return;
  if (hp.y !== undefined) { const v = parseFloat(hp.y); if (isFinite(v)) yaw = v * D2R; }
  if (hp.pi !== undefined) { const v = parseFloat(hp.pi); if (isFinite(v)) pitch = clampPitch(v * D2R); }
  if (hp.f !== undefined) {
    const v = parseFloat(hp.f) * D2R;
    if (isFinite(v) && v > 0) fov = fovT = Math.min(FOV_MAX, Math.max(FOV_MIN, v));
  }
});
requestAnimationFrame(frame);

})();
</script>
</body>
</html>
