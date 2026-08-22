// const path = require('path');
// const process = require('process');
// const CopyWebpackPlugin = require('copy-webpack-plugin');

import path from 'path';
import process from 'process';
import { execSync } from 'child_process';

const pathBuilder = (subpath) => path.join(process.cwd(), subpath);

// Get commit hash and build time
const getCommitHash = () => {
    try {
        return execSync('git rev-parse --short HEAD').toString().trim();
    } catch (error) {
        return 'unknown';
    }
};

const getBuildTime = () => {
    return new Date().toISOString();
};

const __dirname = path.resolve();
/** @type {import('next').NextConfig} */
const nextConfig = {
    // Allow dev-server assets (/_next/*) to be fetched through Cloudflare
    // quick-tunnel hostnames — Next 15.3+ warns and will eventually block
    // cross-origin dev requests without this. Dev-only option, no-op in builds.
    allowedDevOrigins: ['*.trycloudflare.com'],
    basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
    // Poki serves every build from a per-deploy nested path, e.g.
    // https://<sub>.gdn.poki.com/<uuid>/index.html — and that <uuid> changes on
    // every version, so a hardcoded basePath cannot work. Assets must resolve
    // RELATIVE to the document instead. A relative assetPrefix makes Next emit
    // ./_next/... (and sets webpack publicPath to ./_next/), which is exactly
    // what the historically-working Poki build shipped (__NEXT_DATA__ recorded
    // assetPrefix "."). Scoped to Poki + 6x (both zip submissions with unknown
    // mount paths) so root/basePath hosting is untouched.
    // (GameDistribution's zip mounts at its STABLE gameId path, so build:gd
    // hardcodes NEXT_PUBLIC_BASE_PATH instead — Next-native, like its CI build.)
    assetPrefix: process.env.NEXT_PUBLIC_POKI === 'true' || process.env.NEXT_PUBLIC_6X === 'true' ? '.' : undefined,
    // Relative assets only work while the document URL keeps its directory.
    // On hydration the pages router always runs router.replace() for exported
    // builds (the condition inlines __NEXT_HAS_REWRITES=true because of the
    // rewrites() below), and resolveHref() normalizes the `as` path through
    // normalizePathTrailingSlash(), which strips the trailing slash: a zip
    // mounted at /6x/ gets replaceState'd to /6x, the base directory becomes
    // /, and every later lazy chunk (Leaflet, daily, ...) 404s at /_next/.
    // skipTrailingSlashRedirect sets __NEXT_MANUAL_TRAILING_SLASH, which makes
    // that normalization a no-op. Poki never hit it because it loads
    // <uuid>/index.html explicitly (no slash to strip); 6x's mount is unknown.
    skipTrailingSlashRedirect: process.env.NEXT_PUBLIC_POKI === 'true' || process.env.NEXT_PUBLIC_6X === 'true' ? true : undefined,
    // NEXT_DIST_DIR (e.g. '.next-poki') controls where the static EXPORT lands.
    // WARNING: it does NOT isolate the build itself. With output:'export',
    // Next repurposes a custom distDir as the export outDir and forces build
    // internals back into `.next` (next/dist/build/index.js: config.distDir =
    // '.next' inside hasCustomExportOutput). So ANY `next build` stomps the
    // running dev server's .next — never build while `pnpm dev` is up.
    distDir: process.env.NEXT_DIST_DIR || '.next',
    env: {
        NEXT_PUBLIC_COMMIT_HASH: getCommitHash(),
        NEXT_PUBLIC_BUILD_TIME: getBuildTime(),
        // RATING_V2 used to be forwarded here because Next only inlines
        // NEXT_PUBLIC_* into the client bundle, so the browser read an
        // unresolved process.env.RATING_V2 and getActiveLeagues() fell back to
        // the Season 0 table (a 1247 rating rendering as Trekker instead of
        // Voyager, Legend unreachable). It is now a hardcoded `true` in
        // components/utils/ratingFlags.js, so the client gets the right value
        // by construction and this forward is no longer needed.
    },
    webpack: (config, { webpack }) => {
        return config
    },
    sassOptions: {
        includePaths: [path.join(__dirname, 'styles')],
    },
    images: {
        unoptimized: true,
    },
    output: 'export',
    async rewrites() {
        return [
            {
                source: '/map/:slug',
                destination: '/map?s=:slug',
            },
        ];
    },
};

// module.exports = nextConfig;
export default nextConfig;