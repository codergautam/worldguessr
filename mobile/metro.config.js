// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
// Repo-root /shared holds pure logic shared with the web app. Scope the watch
// to just /shared (not the whole web project) so Metro doesn't crawl the
// Next.js tree or its node_modules.
const sharedRoot = path.resolve(projectRoot, '../shared');

const config = getDefaultConfig(projectRoot);

config.watchFolders = Array.from(new Set([...(config.watchFolders || []), sharedRoot]));
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  '@shared': sharedRoot,
};

module.exports = config;
