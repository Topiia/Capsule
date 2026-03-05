module.exports = {
  displayName: 'INTEGRATION',
  testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
  testEnvironment: 'node',
  testTimeout: 60000,
  // Tests now use isolated databases per worker for safe parallel execution
  clearMocks: true,
  restoreMocks: true,
  resetModules: true,
  setupFiles: [
    '<rootDir>/tests/setup/env.setup.js',
    '<rootDir>/tests/setup/cloudinary.enforce.js',
  ],
  globalSetup: '<rootDir>/tests/setup/globalSetup.js',
  globalTeardown: '<rootDir>/tests/setup/globalTeardown.js',
  setupFilesAfterEnv: ['<rootDir>/tests/setup/integration.setup.js'],
  // TODO: Remove forceExit once open handles are fixed
  forceExit: true,
};
