const request = require('supertest');
const mongoose = require('mongoose');
const fc = require('fast-check');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Vlog = require('../models/Vlog');

// Mock the database connection function
jest.mock('../config/database', () => jest.fn());

// Mock the upload middleware to track deleteImage calls
const mockDeleteImage = jest.fn();
jest.mock('../middleware/upload', () => ({
  uploadSingle: jest.fn(() => (req, res, next) => next()),
  uploadMultiple: jest.fn(() => (req, res, next) => next()),
  deleteImage: mockDeleteImage,
  getImageUrl: jest.fn((publicId) => `/uploads/${publicId}`),
}));

// Import app after mocking
const app = require('../server');

/**
 * Feature: vlog-edit-delete, Property 7: Image cleanup on deletion
 *
 * Property: For any vlog with images, after deletion, all image public_ids
 * should be removed from Cloudinary storage
 *
 * Validates: Requirements 2.3
 */

describe('Property 7: Image cleanup on deletion', () => {
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
    // Clear mock calls
    mockDeleteImage.mockClear();
    // Mock successful deletion
    mockDeleteImage.mockResolvedValue({ result: 'ok' });
    // Suppress console.error during tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console.error
    console.error.mockRestore();
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
    email: fc.tuple(
      fc.stringMatching(/^[a-zA-Z0-9]{3,10}$/),
      fc.stringMatching(/^[a-zA-Z0-9]{2,8}$/),
      fc.constantFrom('com', 'org', 'net', 'edu'),
    ).map(([local, domain, tld]) => `${local}@${domain}.${tld}`),
    password: fc.stringMatching(/^[a-zA-Z0-9!@#$%^&*]{6,20}$/),
  });

  // Arbitrary for generating valid vlog data with images
  const vlogArbitrary = fc.record({
    title: fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9 ]{1,48}[a-zA-Z0-9]$/), // Ensure at least 3 chars after trim
    description: fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9 .,!?]{8,198}[a-zA-Z0-9]$/), // Ensure at least 10 chars after trim
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
      fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/),
      { maxLength: 5 },
    ),
    images: fc.array(
      fc.record({
        url: fc.webUrl(),
        publicId: fc.stringMatching(/^[a-zA-Z0-9_-]{10,30}$/),
        caption: fc.stringMatching(/^[a-zA-Z0-9 ]{0,50}$/),
        order: fc.nat({ max: 9 }),
      }),
      { minLength: 1, maxLength: 3 }, // Reduced from 10 to 3 for faster tests
    ),
  });

  test('Property: All image public_ids should be deleted from Cloudinary on vlog deletion', async () => {
    await fc.assert(
      fc.asyncProperty(
        userArbitrary,
        vlogArbitrary,
        async (authorData, vlogData) => {
          try {
            // Clean up before each property test run
            await User.deleteMany({});
            await Vlog.deleteMany({});
            mockDeleteImage.mockClear();

            // Create author and their vlog
            const { user: author, token } = await createUserWithToken(authorData);
            const vlog = await createVlog(author._id, vlogData);

            // Store the image public IDs for verification
            const imagePublicIds = vlog.images.map((img) => img.publicId);
            const imageCount = imagePublicIds.length;

            // Verify vlog has images
            expect(imageCount).toBeGreaterThan(0);

            // Delete the vlog
            const deleteResponse = await request(app)
              .delete(`/api/vlogs/${vlog._id}`)
              .set('Authorization', `Bearer ${token}`);

            // Assert successful deletion
            expect(deleteResponse.status).toBe(200);
            expect(deleteResponse.body.success).toBe(true);

            // Verify deleteImage was called for each image
            expect(mockDeleteImage).toHaveBeenCalledTimes(imageCount);

            // Verify each image public_id was passed to deleteImage
            imagePublicIds.forEach((publicId) => {
              expect(mockDeleteImage).toHaveBeenCalledWith(publicId);
            });

            // Verify vlog no longer exists
            const vlogAfterDeletion = await Vlog.findById(vlog._id);
            expect(vlogAfterDeletion).toBeNull();
          } finally {
            // Clean up after each property test run
            await User.deleteMany({});
            await Vlog.deleteMany({});
            mockDeleteImage.mockClear();
          }
        },
      ),
      { numRuns: 10, timeout: 5000 },
    );
  }, 120000);

  test('Property: Vlog deletion should succeed even if some image deletions fail', async () => {
    await fc.assert(
      fc.asyncProperty(
        userArbitrary,
        vlogArbitrary,
        async (authorData, vlogData) => {
          try {
            // Clean up before each property test run
            await User.deleteMany({});
            await Vlog.deleteMany({});
            mockDeleteImage.mockClear();

            // Mock deleteImage to fail for some images
            mockDeleteImage.mockRejectedValue(new Error('Cloudinary deletion failed'));

            // Create author and their vlog
            const { user: author, token } = await createUserWithToken(authorData);
            const vlog = await createVlog(author._id, vlogData);

            const imageCount = vlog.images.length;

            // Delete the vlog
            const deleteResponse = await request(app)
              .delete(`/api/vlogs/${vlog._id}`)
              .set('Authorization', `Bearer ${token}`);

            // Assert successful deletion despite image cleanup failures
            expect(deleteResponse.status).toBe(200);
            expect(deleteResponse.body.success).toBe(true);

            // Verify deleteImage was attempted for each image
            expect(mockDeleteImage).toHaveBeenCalledTimes(imageCount);

            // Verify vlog was still deleted from database
            const vlogAfterDeletion = await Vlog.findById(vlog._id);
            expect(vlogAfterDeletion).toBeNull();
          } finally {
            // Clean up after each property test run
            await User.deleteMany({});
            await Vlog.deleteMany({});
            mockDeleteImage.mockClear();
            // Reset mock to successful deletion
            mockDeleteImage.mockResolvedValue({ result: 'ok' });
          }
        },
      ),
      { numRuns: 10, timeout: 5000 },
    );
  }, 120000);
});
