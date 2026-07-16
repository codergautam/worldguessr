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
    // assetPrefix "."). Scoped to Poki only so root/basePath hosting is untouched.
    assetPrefix: process.env.NEXT_PUBLIC_POKI === 'true' ? '.' : undefined,
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