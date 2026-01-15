const request = require('supertest');
const mongoose = require('mongoose');
const fc = require('fast-check');
const User = require('../models/User');
const Vlog = require('../models/Vlog');

// Mock the database connection function
jest.mock('../config/database', () => jest.fn());

// Import app after mocking
const app = require('../server');

/**
 * Feature: vlog-edit-delete, Property 10: Unauthenticated request rejection
 *
 * Property: For any vlog, both edit and delete requests without a valid
 * authentication token should be rejected with a 401 unauthorized error
 *
 * Validates: Requirements 3.3, 3.4
 */

describe('Property 10: Unauthenticated request rejection', () => {
  beforeAll(async () => {
    // Set test environment variables
    process.env.JWT_SECRET = 'test-secret-key-for-testing';
    process.env.NODE_ENV = 'test';

    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      const mongoUri = process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/vlogsphere-test';
      await mongoose.connect(mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
    }
  });

  afterAll(async () => {
    // Clean up and close connection
    await User.deleteMany({});
    await Vlog.deleteMany({});
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clear collections before each test
    await User.deleteMany({});
    await Vlog.deleteMany({});
  });

  // Helper function to create a user
  const createUser = async (userData) => await User.create(userData);

  // Helper function to create a vlog
  const createVlog = async (authorId, vlogData) => await Vlog.create({
    ...vlogData,
    author: authorId,
  });

  // Arbitrary for generating valid user data
  const userArbitrary = fc.record({
    username: fc.stringMatching(/^[a-zA-Z0-9_]{3,20}$/),
    email: fc.emailAddress(),
    password: fc.string({ minLength: 6, maxLength: 20 }).filter((s) => s.trim().length >= 6),
  });

  // Arbitrary for generating valid vlog data
  const vlogArbitrary = fc.record({
    title: fc.string({ minLength: 3, maxLength: 100 }).filter((s) => s.trim().length >= 3),
    description: fc.string({ minLength: 10, maxLength: 500 }).filter((s) => s.trim().length >= 10),
    category: fc.constantFrom(
      'technology',
      'travel',
      'lifestyle',
      'food',
      'fashion',
      'fitness',
      'music',
      'art',
      'business',
      'education',
    ),
    tags: fc.array(
      fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length >= 1),
      { maxLength: 10 },
    ),
    images: fc.array(
      fc.record({
        url: fc.webUrl(),
        publicId: fc.string({ minLength: 10, maxLength: 50 }).filter((s) => s.trim().length >= 10),
        caption: fc.string({ maxLength: 100 }),
        order: fc.nat({ max: 9 }),
      }),
      { minLength: 1, maxLength: 10 },
    ),
  });

  // Arbitrary for generating invalid/missing tokens
  const invalidTokenArbitrary = fc.oneof(
    fc.constant(null), // No token
    fc.constant(''), // Empty token
    fc.constant('invalid-token'), // Invalid format
    fc.string({ minLength: 10, maxLength: 50 }), // Random string
    fc.constant('Bearer '), // Bearer with no token
    fc.constant('Bearer invalid-jwt-token'), // Bearer with invalid token
  );

  test('Property: Unauthenticated UPDATE requests should be rejected with 401', async () => {
    await fc.assert(
      fc.asyncProperty(
        userArbitrary,
        vlogArbitrary,
        invalidTokenArbitrary,
        async (authorData, vlogData, invalidToken) => {
          try {
            // Clean up before each property test run
            await User.deleteMany({});
            await Vlog.deleteMany({});

            // Create author and their vlog
            const author = await createUser(authorData);
            const vlog = await createVlog(author._id, vlogData);

            // Attempt to update vlog without authentication or with invalid token
            const updateData = {
              title: 'Updated Title',
              description: 'Updated description that is long enough',
            };

            const requestBuilder = request(app)
              .put(`/api/vlogs/${vlog._id}`)
              .send(updateData);

            // Add authorization header only if token is not null
            if (invalidToken !== null && invalidToken !== '') {
              requestBuilder.set('Authorization', invalidToken);
            }

            const response = await requestBuilder;

            // Assert 401 Unauthorized
            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
            expect(response.body.error.message).toMatch(/not authorized|unauthorized|no token|invalid token/i);

            // Verify vlog was not modified
            const unchangedVlog = await Vlog.findById(vlog._id);
            expect(unchangedVlog.title).toBe(vlogData.title);
            expect(unchangedVlog.description).toBe(vlogData.description);
          } finally {
            // Clean up after each property test run
            await User.deleteMany({});
            await Vlog.deleteMany({});
          }
        },
      ),
      { numRuns: 10, timeout: 5000 },
    );
  }, 120000);

  test('Property: Unauthenticated DELETE requests should be rejected with 401', async () => {
    await fc.assert(
      fc.asyncProperty(
        userArbitrary,
        vlogArbitrary,
        invalidTokenArbitrary,
        async (authorData, vlogData, invalidToken) => {
          try {
            // Clean up before each property test run
            await User.deleteMany({});
            await Vlog.deleteMany({});

            // Create author and their vlog
            const author = await createUser(authorData);
            const vlog = await createVlog(author._id, vlogData);

            // Attempt to delete vlog without authentication or with invalid token
            const requestBuilder = request(app)
              .delete(`/api/vlogs/${vlog._id}`);

            // Add authorization header only if token is not null
            if (invalidToken !== null && invalidToken !== '') {
              requestBuilder.set('Authorization', invalidToken);
            }

            const response = await requestBuilder;

            // Assert 401 Unauthorized
            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
            expect(response.body.error.message).toMatch(/not authorized|unauthorized|no token|invalid token/i);

            // Verify vlog still exists
            const stillExistingVlog = await Vlog.findById(vlog._id);
            expect(stillExistingVlog).not.toBeNull();
            expect(stillExistingVlog._id.toString()).toBe(vlog._id.toString());
          } finally {
            // Clean up after each property test run
            await User.deleteMany({});
            await Vlog.deleteMany({});
          }
        },
      ),
      { numRuns: 10, timeout: 5000 },
    );
  }, 120000);
});
