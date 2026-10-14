module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['./jest.setup.js'],
  // The RN preset's own pattern only exempts react-native/@react-native
  // packages from the "don't transform node_modules" default; several new
  // Phase 5/6 dependencies ship ESM-only builds and need the same exemption.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|@sentry/react-native|@reduxjs/toolkit|redux|react-redux|immer|reselect|lottie-react-native|lucide-react-native|react-native-reanimated|react-native-worklets)/)',
  ],
  // The preset's own `transform` only maps .js/.ts/.tsx to babel-jest (this
  // key replaces rather than merges with the preset, so the preset's own
  // image-asset transformer is re-declared here too). lucide-react-native's
  // package.json declares a "react-native" export condition pointing at its
  // ESM .mjs build, which RN's jest resolver (deliberately mirroring Metro)
  // picks up — so .mjs needs a transformer too, or that untransformed
  // `export` syntax throws a syntax error.
  transform: {
    '^.+\\.(js|ts|tsx|mjs)$': 'babel-jest',
    '^.+\\.(bmp|gif|jpg|jpeg|mp4|png|psd|svg|webp)$': require.resolve(
      '@react-native/jest-preset/jest/assetFileTransformer.js',
    ),
  },
};
