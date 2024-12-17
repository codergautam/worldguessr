// const path = require('path');
// const process = require('process');
// const CopyWebpackPlugin = require('copy-webpack-plugin');

import path from 'path';
import process from 'process';
const pathBuilder = (subpath) => path.join(process.cwd(), subpath);

const __dirname = path.resolve();
/** @type {import('next').NextConfig} */
const nextConfig = {
    webpack: (config, { webpack }) => {
        config.devServer = {
            hot: true, // Enable HMR
        };
        return config;
    },
    sassOptions: {
        includePaths: [path.join(__dirname, 'styles')],
    },
    images: {
        unoptimized: true,
    },
    output: process.env.ENV === "production" ? 'export': undefined,
    assetPrefix: process.env.ENV==="production"?'./':"",
};

// module.exports = nextConfig;
export default nextConfig;