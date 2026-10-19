// Two projects: the unit tests, and the scenario tests that run the whole app against the fake
// device (test-helpers/fakeDevice, docs/dev/history/technical-design-quality-hardening.md §4).
module.exports = {
  projects: [
    {
      displayName: 'unit',
      preset: 'react-native',
      testPathIgnorePatterns: ['/node_modules/', '<rootDir>/__tests__/scenarios/'],
    },
    {
      displayName: 'scenarios',
      preset: 'react-native',
      testMatch: ['<rootDir>/__tests__/scenarios/**/*.test.ts?(x)'],
      setupFiles: ['<rootDir>/test-helpers/fakeDevice/setup.ts'],
    },
  ],
};
