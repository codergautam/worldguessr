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
    basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
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