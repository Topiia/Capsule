const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  displayName: 'INTEGRATION',
  testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
  globalSetup: '<rootDir>/tests/setup/globalSetup.js',
  globalTeardown: '<rootDir>/tests/setup/globalTeardown.js',
  setupFilesAfterEnv: ['<rootDir>/tests/setup/integration.setup.js'],
};
