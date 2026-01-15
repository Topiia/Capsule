const request = require('supertest');
const mongoose = require('mongoose');
const fc = require('fast-check');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Vlog = require('../models/Vlog');

// Mock the database connection function
jest.mock('../config/database', () => jest.fn());

// Import app after mocking
const app = require('../server');

/**
 * Feature: vlog-edit-delete, Property 9: Non-author authorization rejection
 *
 * Property: For any vlog and any authenticated user who is not the author,
 * both edit and delete requests should be rejected with a 403 forbidden error
 *
 * Validates: Requirements 3.1, 3.2
 */

describe('Property 9: Non-author authorization rejection', () => {
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

  // Helper function to create a user and get JWT token
  const createUserWithToken = async (userData) => {
    const user = await User.create(userData);
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'test-secret', {
      expiresIn: '1h',
    });
    return { user, token };
  };

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

  test('Property: Non-author UPDATE requests should be rejected with 403', async () => {
    await fc.assert(
      fc.asyncProperty(
        userArbitrary,
        userArbitrary,
        vlogArbitrary,
        async (authorData, nonAuthorData, vlogData) => {
          // Ensure different users
          fc.pre(authorData.email !== nonAuthorData.email);
          fc.pre(authorData.username !== nonAuthorData.username);

          try {
            // Clean up before each property test run
            await User.deleteMany({});
            await Vlog.deleteMany({});

            // Create author and their vlog
            const { user: author } = await createUserWithToken(authorData);
            const vlog = await createVlog(author._id, vlogData);

            // Create non-author user
            const { token: nonAuthorToken } = await createUserWithToken(nonAuthorData);

            // Attempt to update vlog as non-author
            const updateData = {
              title: 'Updated Title',
              description: 'Updated description that is long enough',
            };

            const response = await request(app)
              .put(`/api/vlogs/${vlog._id}`)
              .set('Authorization', `Bearer ${nonAuthorToken}`)
              .send(updateData);

            // Assert 403 Forbidden
            expect(response.status).toBe(403);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toMatch(/not authorized/i);

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

  test('Property: Non-author DELETE requests should be rejected with 403', async () => {
    await fc.assert(
      fc.asyncProperty(
        userArbitrary,
        userArbitrary,
        vlogArbitrary,
        async (authorData, nonAuthorData, vlogData) => {
          // Ensure different users
          fc.pre(authorData.email !== nonAuthorData.email);
          fc.pre(authorData.username !== nonAuthorData.username);

          try {
            // Clean up before each property test run
            await User.deleteMany({});
            await Vlog.deleteMany({});

            // Create author and their vlog
            const { user: author } = await createUserWithToken(authorData);
            const vlog = await createVlog(author._id, vlogData);

            // Create non-author user
            const { token: nonAuthorToken } = await createUserWithToken(nonAuthorData);

            // Attempt to delete vlog as non-author
            const response = await request(app)
              .delete(`/api/vlogs/${vlog._id}`)
              .set('Authorization', `Bearer ${nonAuthorToken}`);

            // Assert 403 Forbidden
            expect(response.status).toBe(403);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toMatch(/not authorized/i);

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
