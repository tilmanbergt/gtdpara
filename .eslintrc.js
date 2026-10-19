// Layers (DEVELOPMENT-POLICY §3, design-overview §3): what each folder under src/ may import.
const layer = (forbidden, message) => ({'no-restricted-imports': ['error', {patterns: [{group: forbidden, message}]}]});
const RN_AND_SDK = ['react', 'react-native', 'react-native-*', '@react-native*/**', 'sn-plugin-lib'];

module.exports = {
  root: true,
  extends: '@react-native',
  ignorePatterns: ['src/generated/'],
  rules: {
    // One-line `if (x) return y;` is the house style; braces only when a branch spans lines.
    curly: ['warn', 'multi-line'],
    // `void promise` marks a deliberate fire-and-forget call.
    'no-void': ['warn', {allowAsStatement: true}],
  },
  overrides: [
    {
      files: ['src/domain/**'],
      rules: layer(
        [...RN_AND_SDK, '**/storage/**', '**/supernote/**', '**/ui/**', '**/screens/**', '**/utils/**'],
        'domain/ is pure: no React Native, no sn-plugin-lib, no I/O, no imports from the other layers.',
      ),
    },
    {
      files: ['src/utils/**'],
      rules: layer(['**/storage/**', '**/supernote/**', '**/ui/**', '**/screens/**'], 'utils/ stands below every other layer.'),
    },
    {
      files: ['src/supernote/**'],
      rules: layer(['**/storage/**', '**/ui/**', '**/screens/**'], 'supernote/ wraps the device; it never reaches up into storage or UI.'),
    },
    {
      files: ['src/storage/**'],
      rules: layer(['**/ui/**', '**/screens/**'], 'storage/ never imports from ui/ or screens/.'),
    },
    {
      files: ['src/ui/**'],
      rules: layer(['**/screens/**'], 'ui/ holds shared building blocks; screens import them, not the other way round.'),
    },
  ],
};
