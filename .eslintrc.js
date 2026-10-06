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
};
