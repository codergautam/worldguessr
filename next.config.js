// const path = require('path');
// const process = require('process');
// const CopyWebpackPlugin = require('copy-webpack-plugin');

import path from 'path';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import process from 'process';
const pathBuilder = (subpath) => path.join(process.cwd(), subpath);
// const { i18n } = require('./next-i18next.config')
// import i18n from './next-i18next.config.js';

const __dirname = path.resolve();

/** @type {import('next').NextConfig} */
const nextConfig = {
    i18n: {
        defaultLocale: 'en',
        locales: ['en','ru','fr','de','es'],
      },
    webpack: (config, { webpack }) => {
        config.plugins.push(
            new CopyWebpackPlugin({
                patterns: [
                    {
                        from: pathBuilder ('node_modules/cesium/Build/Cesium/Workers'),
                        to: '../public/cesium/Workers',
                        info: { minimized: true }
                    }
                ]
            }),
            new CopyWebpackPlugin({
                patterns: [
                    {
                        from: pathBuilder ('node_modules/cesium/Build/Cesium/ThirdParty'),
                        to: '../public/cesium/ThirdParty',
                        info: { minimized: true }
                    }
                ]
            }),
            new CopyWebpackPlugin({
                patterns: [
                    {
                        from: pathBuilder ('node_modules/cesium/Build/Cesium/Assets'),
                        to: '../public/cesium/Assets',
                        info: { minimized: true }
                    }
                ]
            }),
            new CopyWebpackPlugin({
                patterns: [
                    {
                        from: pathBuilder ('node_modules/cesium/Build/Cesium/Widgets'),
                        to: '../public/cesium/Widgets',
                        info: { minimized: true }
                    }
                ]
            }),
            new webpack.DefinePlugin({ CESIUM_BASE_URL: JSON.stringify('/cesium') })
        );

        return config
    },
    sassOptions: {
        includePaths: [path.join(__dirname, 'styles')],
    },
    output: 'standalone'
};

// module.exports = nextConfig;
export default nextConfig;