const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  displayName: 'COVERAGE',

  testMatch: [
    '<rootDir>/tests/unit/**/*.test.js',
    '<rootDir>/tests/integration/**/*.test.js',
  ],

  globalSetup: '<rootDir>/tests/setup/globalSetup.js',
  globalTeardown: '<rootDir>/tests/setup/globalTeardown.js',
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup/integration.setup.js',
  ],

  collectCoverage: true,
  coverageDirectory: 'coverage',
};
