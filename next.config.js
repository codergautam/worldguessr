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
const isMobileBuild = process.env.BUILD_TARGET === 'mobile';

/** @type {import('next').NextConfig} */
const nextConfig = {
    basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
    env: {
        NEXT_PUBLIC_COMMIT_HASH: getCommitHash(),
        NEXT_PUBLIC_BUILD_TIME: getBuildTime(),
        NEXT_PUBLIC_BUILD_TARGET: isMobileBuild ? 'mobile' : 'web',
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
    // Rewrites are stripped by `output: 'export'` and unsupported in static
    // hosting; the mobile build replaces this with a client-side redirect at
    // pages/map/[slug].js. Keep this for the web build (which still uses Next's
    // static-export Vercel/Heroku hosting where rewrites are honored at the
    // edge), but skip on mobile to avoid silent footgun warnings.
    ...(isMobileBuild
        ? {}
        : {
              async rewrites() {
                  return [
                      {
                          source: '/map/:slug',
                          destination: '/map?s=:slug',
                      },
                  ];
              },
          }),
};

// module.exports = nextConfig;
export default nextConfig;