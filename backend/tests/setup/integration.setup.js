// Fix MaxListenersExceededWarning from multiple SIGTERM handlers across test files
process.setMaxListeners(30);

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

// Worker isolation logic: Each Jest worker gets its own isolated database name
const workerId = process.env.JEST_WORKER_ID || '1';
const dbName = `test_db_worker_${workerId}`;

const parsedUri = new URL(uri);
parsedUri.pathname = `/${dbName}`;
const isolatedUri = parsedUri.toString();

// CI diagnostic logging
console.log(`[Integration Setup] Worker ${workerId} connecting to ${dbName}`);
console.log('[Integration Setup] NODE_ENV:', process.env.NODE_ENV);

// Environment Safety Guard: Ensure no production or Atlas DB is used
const isProductionLike = (dbUri) => {
  const lowerUri = dbUri.toLowerCase();
  return lowerUri.includes('mongodb+srv')
         || lowerUri.includes('atlas')
         /* Capsule Production DB safeguards */
         || lowerUri.includes('cluster')
         || lowerUri.includes('render');
};

if (isProductionLike(isolatedUri) || isProductionLike(process.env.MONGODB_URI || '')) {
  throw new Error('Production or Atlas database detected in test environment. Aborting to prevent data corruption.');
}

// Pass URI down via process env just in case any application code reads it indirectly
process.env.MONGODB_URI = isolatedUri;

// MongoMemoryServer starts as a standalone instance (no replica set).
// Multi-document transactions require a replica set. Setting this flag
// activates the sessionless fallback path in deleteVlog, addComment,
// deleteComment, and userDeletionService — identical to the production
// transaction path minus the session wrapper.
process.env.SKIP_TRANSACTIONS = 'true';

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(isolatedUri, {
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
    // Drop the isolated database to clean up completely when worker finishes test file
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
