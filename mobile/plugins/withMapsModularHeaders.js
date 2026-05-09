const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Adds `use_modular_headers!` to the Podfile target block so that
// `react-native-maps` (which #imports React-Core headers in a non-modular
// way) builds successfully under `useFrameworks: "static"` (required by
// react-native-firebase). Without this, the build fails with
// "include of non-modular header inside framework module".
const withMapsModularHeaders = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      if (!contents.includes('use_modular_headers!')) {
        contents = contents.replace(
          /(use_frameworks!\s*[^\n]*\n)/,
          '$1  use_modular_headers!\n'
        );
        fs.writeFileSync(podfilePath, contents);
      }

      return cfg;
    },
  ]);
};

module.exports = withMapsModularHeaders;
