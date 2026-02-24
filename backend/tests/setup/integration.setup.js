const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Enforce environment safety BEFORE any connection attempts
if (process.env.NODE_ENV !== 'test') {
  throw new Error('Integration tests must run with NODE_ENV="test"');
}

// Read the URI from the file created by globalSetup.js
const uriPath = path.join(os.tmpdir(), 'jest-mongo-uri.json');
if (!fs.existsSync(uriPath)) {
  throw new Error('MongoDB URI file not found. Did globalSetup run?');
}

const { uri } = JSON.parse(fs.readFileSync(uriPath, 'utf8'));

// Environment Safety Guard: Ensure no production or Atlas DB is used
const isProductionLike = (dbUri) => {
  const lowerUri = dbUri.toLowerCase();
  return lowerUri.includes('mongodb+srv')
         || lowerUri.includes('atlas')
         /* Capsule Production DB safeguards */
         || lowerUri.includes('cluster')
         || lowerUri.includes('render');
};

if (isProductionLike(uri) || isProductionLike(process.env.MONGODB_URI || '')) {
  throw new Error('Production or Atlas database detected in test environment. Aborting to prevent data corruption.');
}

// Pass URI down via process env just in case any application code reads it indirectly
process.env.MONGODB_URI = uri;

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
  }
});

beforeEach(async () => {
  // Drop all collections before each integration test to maintain test isolation
  if (mongoose.connection.readyState === 1) {
    const { collections } = mongoose.connection;
    await Promise.all(
      Object.values(collections).map((collection) => collection.deleteMany()),
    );
  }
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
});
