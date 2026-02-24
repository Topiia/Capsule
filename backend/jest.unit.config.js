module.exports = {
  displayName: 'UNIT',
  testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
  testEnvironment: 'node',
  testTimeout: 45000,
  clearMocks: true,
  restoreMocks: true,
  resetModules: true,
  setupFiles: ['<rootDir>/tests/setup/cloudinary.enforce.js'],
  // TODO: Remove forceExit once open handles are fixed
  forceExit: true,
};
