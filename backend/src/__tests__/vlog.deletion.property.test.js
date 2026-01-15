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
 * Feature: vlog-edit-delete, Property 6: Deletion removes vlog
 *
 * Property: For any vlog, after successful deletion, querying for that vlog
 * by ID should return a 404 not found error
 *
 * Validates: Requirements 2.2
 */

describe('Property 6: Deletion removes vlog', () => {
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
    email: fc.emailAddress().filter((email) => {
      // Ensure email matches typical validation pattern
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      return emailRegex.test(email);
    }),
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

  test('Property: After successful deletion, vlog should return 404 not found', async () => {
    await fc.assert(
      fc.asyncProperty(
        userArbitrary,
        vlogArbitrary,
        async (authorData, vlogData) => {
          try {
            // Clean up before each property test run
            await User.deleteMany({});
            await Vlog.deleteMany({});

            // Create author and their vlog
            const { user: author, token } = await createUserWithToken(authorData);
            const vlog = await createVlog(author._id, vlogData);

            // Verify vlog exists before deletion
            const vlogBeforeDeletion = await Vlog.findById(vlog._id);
            expect(vlogBeforeDeletion).not.toBeNull();
            expect(vlogBeforeDeletion._id.toString()).toBe(vlog._id.toString());

            // Delete the vlog
            const deleteResponse = await request(app)
              .delete(`/api/vlogs/${vlog._id}`)
              .set('Authorization', `Bearer ${token}`);

            // Assert successful deletion (200 OK)
            expect(deleteResponse.status).toBe(200);
            expect(deleteResponse.body.success).toBe(true);
            expect(deleteResponse.body.message).toMatch(/deleted successfully/i);

            // Verify vlog no longer exists in database
            const vlogAfterDeletion = await Vlog.findById(vlog._id);
            expect(vlogAfterDeletion).toBeNull();

            // Verify querying for the vlog returns 404
            const getResponse = await request(app)
              .get(`/api/vlogs/${vlog._id}`);

            expect(getResponse.status).toBe(404);
            expect(getResponse.body.success).toBe(false);
            expect(getResponse.body.error.message || getResponse.body.error).toMatch(/not found/i);
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
