const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  displayName: 'UNIT',
  testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
  setupFiles: [
    ...baseConfig.setupFiles,
    '<rootDir>/tests/setup/unit.setup.js',
  ],
};
