const request = require('supertest');
const fc = require('fast-check');
const jwt = require('jsonwebtoken');
const User = require('../../src/models/User');
const Vlog = require('../../src/models/Vlog');

// Mock the database connection function

// Mock Resend email services before importing app
jest.mock('../../src/utils/sendEmail', () => ({
  sendEmail: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('../../src/utils/sendEmailSync', () => ({
  sendEmailSync: jest.fn().mockReturnValue({ success: true }),
}));

jest.mock('../../src/middleware/upload', () => ({
  uploadSingle: jest.fn().mockReturnValue((req, res, next) => next()),
  uploadMultiple: jest.fn().mockReturnValue((req, res, next) => next()),
  deleteImage: jest.fn().mockResolvedValue({ result: 'ok' }),
  getImageUrl: jest.fn().mockReturnValue('https://mocked.com/image.jpg'),
  cloudinary: {
    uploader: {
      destroy: jest.fn().mockResolvedValue({ result: 'ok' }),
    },
  },
}));

// Import app after mocking
const app = require('../../src/app');

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
  });

  afterAll(async () => {
    // Clean up and close connection
    await User.deleteMany({});
    await Vlog.deleteMany({});
  });

  beforeEach(async () => {
    // Clear collections before each test
    await User.deleteMany({});
    await Vlog.deleteMany({});
  });

  // Helper function to create a user and get JWT token
  const createUserWithToken = async (userData) => {
    const user = await User.create(userData);
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET || 'test-secret',
      {
        expiresIn: '1h',
      },
    );
    return { user, token };
  };

  // Helper function to create a vlog
  const createVlog = async (authorId, vlogData) => Vlog.create({
    ...vlogData,
    author: authorId,
  });

  // Arbitrary for generating valid user data
  const userArbitrary = fc.record({
    username: fc.stringMatching(/^[a-zA-Z0-9_]{3,20}$/),
    email: fc.stringMatching(/^[a-z0-9]{5,15}$/).map((s) => `${s}@example.com`),
    password: fc.stringMatching(/^[a-zA-Z0-9!@#$%^&*]{6,20}$/),
  });

  // Arbitrary for generating valid vlog data
  const vlogArbitrary = fc.record({
    title: fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9 ]{1,48}[a-zA-Z0-9]$/),
    description: fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9 .,!?]{8,198}[a-zA-Z0-9]$/),
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
    tags: fc.array(fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/), { maxLength: 5 }),
    images: fc.array(
      fc.record({
        url: fc.webUrl(),
        publicId: fc.stringMatching(/^[a-zA-Z0-9_-]{10,30}$/),
        caption: fc.stringMatching(/^[a-zA-Z0-9 ]{0,50}$/),
        order: fc.nat({ max: 9 }),
      }),
      { minLength: 1, maxLength: 3 },
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
            expect(deleteResponse.body.message).toMatch(
              /deleted successfully/i,
            );

            // Verify vlog no longer exists in database
            const vlogAfterDeletion = await Vlog.findById(vlog._id);
            expect(vlogAfterDeletion).toBeNull();

            // Verify querying for the vlog returns 404
            const getResponse = await request(app).get(
              `/api/vlogs/${vlog._id}`,
            );

            expect(getResponse.status).toBe(404);
            expect(getResponse.body.success).toBe(false);
            expect(
              getResponse.body.error.message || getResponse.body.error,
            ).toMatch(/not found/i);
          } finally {
            // Clean up after each property test run
            await User.deleteMany({});
            await Vlog.deleteMany({});
          }
        },
      ),
      { numRuns: 5, timeout: 3000 },
    );
  }, 30000);
});
