// Bundles the real web Leaflet map (components/Map.js + components/ResultsMap.js
// + react-leaflet) into ONE self-contained HTML, shipped inside the mobile app so
// the WebView loads it from disk — no server, works offline (tiles aside).
// Run: `node embed/build.mjs`  (re-run when the web map changes).
import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'mobile/src/generated');
const resolveExtensions = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'];

// Shims must win over generic @/ resolution (e.g. @/lib/markerIcons → the
// inlined-PNG shim, NOT the original which fetches /dest.png at runtime).
const SHIMS = {
  'next/dynamic': path.join(root, 'embed/shims/nextDynamic.js'),
  'next/router': path.join(root, 'embed/shims/nextRouter.js'),
  '@/lib/markerIcons': path.join(root, 'embed/shims/markerIcons.js'),
  // Alias form of the relative './utils/audio' shim below — keep both paths
  // covered so a future import-style change can't silently re-bundle the
  // Web Audio engine.
  '@/components/utils/audio': path.join(root, 'embed/shims/audio.js'),
};

const resolvePlugin = {
  name: 'embed-resolve',
  setup(b) {
    // components/Map.js pulls the Web Audio SFX engine via a RELATIVE import
    // ('./utils/audio'). Inside the WebView it must be shimmed — otherwise the
    // bundle ships a second audio stack governed by the WebView's own private
    // localStorage volumes, unreachable by the app's sound settings. The shim
    // no-ops everything EXCEPT the pin click, which plays in-page for latency
    // with the host pushing the native volume in (embed/shims/audio.js).
    b.onResolve({ filter: /^\.\.?\/.*utils\/audio$/ }, () => ({
      path: path.join(root, 'embed/shims/audio.js'),
    }));
    b.onResolve({ filter: /^(@\/|next\/dynamic$|next\/router$)/ }, (args) => {
      if (SHIMS[args.path]) return { path: SHIMS[args.path] };
      if (!args.path.startsWith('@/')) return undefined;
      // Generic '@/x' → repo-root/x with extension resolution.
      const base = path.join(root, args.path.slice(2));
      for (const ext of ['', ...resolveExtensions]) {
        const p = ext ? base + ext : base;
        if (fs.existsSync(p) && fs.statSync(p).isFile()) return { path: p };
      }
      for (const ext of resolveExtensions) {
        const p = path.join(base, 'index' + ext);
        if (fs.existsSync(p)) return { path: p };
      }
      return { path: base };
    });
  },
};

// JSON imported with `with { type: "module" }` (customPins) — load as a JS module
// so esbuild's import-attribute check doesn't reject it.
const jsonModulePlugin = {
  name: 'json-as-module',
  setup(b) {
    b.onLoad({ filter: /customPins\.json$/ }, (args) => ({
      contents: 'export default ' + fs.readFileSync(args.path, 'utf8'),
      loader: 'js',
    }));
  },
};

const result = await esbuild.build({
  entryPoints: [path.join(root, 'embed/entry.jsx')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: ['es2019'],
  minify: true,
  jsx: 'automatic',
  resolveExtensions,
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env.NEXT_PUBLIC_BASE_PATH': '""',
    'process.env.NEXT_PUBLIC_COOLMATH': '""',
    // Catch-all AFTER the specific keys (longest match wins): any OTHER
    // process.env.X in the web graph becomes ({}).X → undefined, instead of a
    // bare `process` reference that throws ReferenceError at eval inside the
    // WebView (no Node globals there) and kills the whole bundle before it
    // can signal ready — the host then waits out READY_TIMEOUT_MS and falls
    // back to the native LeafletMap (July 13: process.env.NEXT_PUBLIC_POKI in
    // lib/basePath.js did exactly this on the next rebuild).
    'process.env': '{}',
  },
  loader: {
    // The web codebase (Map.js, ResultsMap.js, countryFlag.js, …) writes JSX in
    // .js files — Next/babel allows it, esbuild must be told.
    '.js': 'jsx',
    '.png': 'dataurl',
    '.jpg': 'dataurl',
    '.jpeg': 'dataurl',
    '.gif': 'dataurl',
    '.svg': 'dataurl',
    // pin.mp3 (~3KB) inlined for the shim's Web Audio pin click — the one
    // sound that plays INSIDE the WebView (latency; see embed/shims/audio.js).
    '.mp3': 'dataurl',
    '.css': 'text',
  },
  plugins: [resolvePlugin, jsonModulePlugin],
  logLevel: 'info',
});

const js = result.outputFiles.map((f) => f.text).join('\n');
const html =
  '<!DOCTYPE html><html><head><meta charset="utf-8"/>' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"/>' +
  // App main font (Lexend) for Leaflet tooltips/controls — see the .leaflet-container
  // rule in embed/entry.jsx. Network-loaded (the map needs network for tiles anyway);
  // falls back to system sans-serif offline.
  '<link rel="preconnect" href="https://fonts.googleapis.com"/>' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700&display=swap"/>' +
  '</head><body><div id="root"></div><script>' +
  js +
  '</script></body></html>';

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, 'embedHtml.ts'),
  '// AUTO-GENERATED by embed/build.mjs — do not edit. Run `node embed/build.mjs` to regenerate.\n' +
    '/* eslint-disable */\n' +
    'export const EMBED_HTML = ' +
    JSON.stringify(html) +
    ';\n',
);
console.log(`Wrote mobile/src/generated/embedHtml.ts (${(html.length / 1024).toFixed(0)} KB)`);
