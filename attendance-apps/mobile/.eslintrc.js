module.exports = {
  root: true,
  extends: '@react-native',
  plugins: ['react-native'],
  rules: {
    // Spec §26: every color comes from packages/shared-config/theme.ts —
    // no raw hex/rgb/named-color literal anywhere in component code.
    // Activated for real starting Phase 5 (no screens existed before this
    // to violate it) — see docs/roadmap.md Phase 1 note.
    'react-native/no-color-literals': 'error',
  },
};
