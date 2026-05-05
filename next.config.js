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
    // Next 15 enforces Origin checks on dev assets and HMR; the Capacitor
    // WebView's Origin is the dev URL itself (see capacitor.config.ts native
    // hook), so the host the request comes from is your LAN IP / tunnel host.
    // Wildcards must have ≥2 segments. LAN IPs must be listed exactly — pipe
    // them through NEXT_PUBLIC_DEV_ORIGINS (comma-separated). Run
    // `pnpm dev-origins` to print a ready-to-paste line.
    allowedDevOrigins: [
        '*.local',
        '*.ngrok-free.app',
        '*.ngrok.app',
        '*.trycloudflare.com',
        '*.ts.net',
        '127.0.0.1',
        ...(process.env.NEXT_PUBLIC_DEV_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? []),
    ],
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