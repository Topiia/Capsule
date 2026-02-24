module.exports = {
  testEnvironment: 'node',
  testTimeout: 45000,
  verbose: true,
  // TODO: Remove forceExit once open handles (supertest, app imports) are fixed
  forceExit: true,
  clearMocks: true,
  resetModules: true,
  restoreMocks: true,
  setupFiles: ['<rootDir>/tests/setup/cloudinary.enforce.js'],

  // Coverage configuration
  collectCoverage: false,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/utils/seedDatabase.js',
    '!src/config/logger.js',
  ],
  coveragePathIgnorePatterns: ['/node_modules/'],
  coverageReporters: ['text', 'lcov', 'html'],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      lines: 60,
    },
  },
};
