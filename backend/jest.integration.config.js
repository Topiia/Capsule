module.exports = {
  displayName: 'INTEGRATION',
  testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
  testEnvironment: 'node',
  testTimeout: 45000,
  clearMocks: true,
  restoreMocks: true,
  resetModules: true,
  setupFiles: ['<rootDir>/tests/setup/cloudinary.enforce.js'],
  globalSetup: '<rootDir>/tests/setup/globalSetup.js',
  globalTeardown: '<rootDir>/tests/setup/globalTeardown.js',
  setupFilesAfterEnv: ['<rootDir>/tests/setup/integration.setup.js'],
  // TODO: Remove forceExit once open handles are fixed
  forceExit: true,
};
