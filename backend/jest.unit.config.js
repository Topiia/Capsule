module.exports = {
  displayName: 'UNIT',
  testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
  testEnvironment: 'node',
  clearMocks: true,
  restoreMocks: true,
  resetModules: true,
  setupFiles: [
    '<rootDir>/tests/setup/env.setup.js',
    '<rootDir>/tests/setup/cloudinary.enforce.js',
  ],
};
