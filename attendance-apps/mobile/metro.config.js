const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const monorepoRoot = path.resolve(__dirname, '../..');

/**
 * Metro configuration.
 *
 * apps/mobile installs its own isolated `node_modules` (see README) and no
 * longer depends on any other workspace package — theming lives entirely in
 * src/theme (independent of packages/shared-config, matching
 * apps/employee-web's design). `watchFolders: [monorepoRoot]` is kept so
 * Metro's file crawler can still see the rest of the monorepo if a future
 * cross-app dependency is added.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [monorepoRoot],
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
