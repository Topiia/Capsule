module.exports = {
  projects: [
    '<rootDir>/jest.unit.config.js',
    '<rootDir>/jest.integration.config.js',
  ],
  // Placed at root: testTimeout in project sub-configs triggers "Unknown option" warnings
  // in Jest 29 projects mode. 60s covers both unit (45s) and integration (60s).
  testTimeout: 60000,
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
      lines: 30,
    },
  },
};
