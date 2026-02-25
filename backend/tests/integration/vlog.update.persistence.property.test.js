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

// Import app after mocking
const app = require('../../src/app');

/**
 * Feature: vlog-edit-delete, Property 4: Update persistence and navigation
 *
 * Property: For any valid update data, submitting the update should persist
 * all changes to the database and redirect to the vlog detail page
 *
 * Validates: Requirements 1.4
 */

describe('Property 4: Update persistence and navigation', () => {
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
      'technology', 'travel', 'lifestyle', 'food', 'fashion',
      'fitness', 'music', 'art', 'business', 'education'
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

  // Arbitrary for generating valid update data
  const updateDataArbitrary = fc.record({
    title: fc
      .string({ minLength: 3, maxLength: 100 })
      .filter((s) => s.trim().length >= 3),
    description: fc
      .string({ minLength: 10, maxLength: 500 })
      .filter((s) => s.trim().length >= 10),
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
      fc
        .string({ minLength: 1, maxLength: 30 })
        .filter((s) => s.trim().length >= 1),
      { maxLength: 10 },
    ),
  });

  test('Property: Valid updates should persist all changes to the database', async () => {
    await fc.assert(
      fc.asyncProperty(
        userArbitrary,
        vlogArbitrary,
        updateDataArbitrary,
        async (authorData, originalVlogData, updateData) => {
          try {
            // Clean up before each property test run
            await User.deleteMany({});
            await Vlog.deleteMany({});

            // Create author and their vlog
            const { user: author, token } = await createUserWithToken(authorData);
            const originalVlog = await createVlog(author._id, originalVlogData);

            // Prepare update data with images (keep original images)
            const updatePayload = {
              ...updateData,
              images: originalVlogData.images, // Keep original images
            };

            // Submit update request
            const response = await request(app)
              .put(`/api/vlogs/${originalVlog._id}`)
              .set('Authorization', `Bearer ${token}`)
              .send(updatePayload);

            // Assert successful update (200 OK)
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toBeDefined();

            // Verify all changes persisted to the database
            const updatedVlog = await Vlog.findById(originalVlog._id);
            expect(updatedVlog).not.toBeNull();

            // Verify each field was updated correctly
            // Note: title and description are trimmed by the Vlog model
            expect(updatedVlog.title).toBe(updateData.title.trim());
            expect(updatedVlog.description).toBe(updateData.description.trim());
            expect(updatedVlog.category).toBe(updateData.category);

            // Verify tags (may include AI-generated tags, so check that our tags are included)
            // Note: tags are automatically converted to lowercase and trimmed by the Vlog model
            updateData.tags.forEach((tag) => {
              expect(updatedVlog.tags).toContain(tag.toLowerCase().trim());
            });

            // Verify images were preserved
            expect(updatedVlog.images.length).toBe(
              originalVlogData.images.length,
            );

            // Verify author remains unchanged
            expect(updatedVlog.author.toString()).toBe(author._id.toString());

            // Verify updatedAt timestamp was updated
            expect(updatedVlog.updatedAt.getTime()).toBeGreaterThan(
              originalVlog.updatedAt.getTime(),
            );

            // Verify response contains updated data
            // Note: title and description are trimmed by the Vlog model
            expect(response.body.data.title).toBe(updateData.title.trim());
            expect(response.body.data.description).toBe(
              updateData.description.trim(),
            );
            expect(response.body.data.category).toBe(updateData.category);
          } finally {
            // Clean up after each property test run
            await User.deleteMany({});
            await Vlog.deleteMany({});
          }
        },
      ),
      { numRuns: 3, timeout: 5000 },
    );
  }, 45000);
});
