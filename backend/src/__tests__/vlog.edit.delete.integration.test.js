const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Vlog = require('../models/Vlog');

// Mock the database connection function
jest.mock('../config/database', () => jest.fn());

// Mock Cloudinary operations
jest.mock('../middleware/upload', () => ({
  uploadSingle: jest.fn(() => (req, res, next) => next()),
  uploadMultiple: jest.fn(() => (req, res, next) => next()),
  deleteImage: jest.fn().mockResolvedValue({ result: 'ok' }),
  getImageUrl: jest.fn((publicId) => `https://cloudinary.com/${publicId}`),
}));

// Import app after mocking
const app = require('../server');

/**
 * Integration Tests for Edit & Delete Vlog Feature
 *
 * Tests complete flows from API to database including:
 * - Edit flow with validation and authorization
 * - Delete flow with image cleanup
 * - Authorization checks for different user roles
 * - Error scenarios and recovery
 */

describe('Vlog Edit & Delete Integration Tests', () => {
  let authorUser; let
    authorToken;
  let otherUser; let
    otherToken;
  let testVlog;

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

    // Create author user
    authorUser = await User.create({
      username: 'vlogauthor',
      email: 'author@test.com',
      password: 'password123',
    });
    authorToken = jwt.sign({ id: authorUser._id }, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });

    // Create other user (non-author)
    otherUser = await User.create({
      username: 'otheruser',
      email: 'other@test.com',
      password: 'password123',
    });
    otherToken = jwt.sign({ id: otherUser._id }, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });

    // Create test vlog
    testVlog = await Vlog.create({
      title: 'Test Vlog for Integration',
      description: 'This is a test vlog for integration testing purposes',
      category: 'technology',
      tags: ['test', 'integration'],
      images: [
        {
          url: 'https://example.com/image1.jpg',
          publicId: 'test_image_1',
          caption: 'Test image 1',
          order: 0,
        },
        {
          url: 'https://example.com/image2.jpg',
          publicId: 'test_image_2',
          caption: 'Test image 2',
          order: 1,
        },
      ],
      author: authorUser._id,
    });
  });

  describe('Complete Edit Flow', () => {
    test('should successfully update vlog with valid data from author', async () => {
      const updateData = {
        title: 'Updated Test Vlog Title',
        description: 'This is an updated description for the test vlog',
        category: 'lifestyle',
        tags: ['updated', 'test'],
        images: testVlog.images,
      };

      // Make update request
      const response = await request(app)
        .put(`/api/vlogs/${testVlog._id}`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send(updateData);

      // Verify response
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe(updateData.title);
      expect(response.body.data.description).toBe(updateData.description);
      expect(response.body.data.category).toBe(updateData.category);
      // Tags may include AI-generated tags, so check that our tags are included
      expect(response.body.data.tags).toEqual(expect.arrayContaining(updateData.tags));

      // Verify database was updated
      const updatedVlog = await Vlog.findById(testVlog._id);
      expect(updatedVlog.title).toBe(updateData.title);
      expect(updatedVlog.description).toBe(updateData.description);
      expect(updatedVlog.category).toBe(updateData.category);
      // Tags may include AI-generated tags, so check that our tags are included
      expect(updatedVlog.tags).toEqual(expect.arrayContaining(updateData.tags));
    });

    test('should validate updated data and reject invalid inputs', async () => {
      const invalidData = {
        title: 'AB', // Too short (min 3 chars)
        description: 'Short', // Too short (min 10 chars)
        category: 'invalid-category',
        images: testVlog.images,
      };

      const response = await request(app)
        .put(`/api/vlogs/${testVlog._id}`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send(invalidData);

      // Should return validation error
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);

      // Verify database was NOT updated
      const unchangedVlog = await Vlog.findById(testVlog._id);
      expect(unchangedVlog.title).toBe(testVlog.title);
      expect(unchangedVlog.description).toBe(testVlog.description);
    });

    test('should handle image updates correctly', async () => {
      const updateData = {
        title: testVlog.title,
        description: testVlog.description,
        category: testVlog.category,
        tags: testVlog.tags,
        images: [
          testVlog.images[0], // Keep first image
          // Remove second image
          {
            url: 'https://example.com/image3.jpg',
            publicId: 'test_image_3',
            caption: 'New image',
            order: 1,
          },
        ],
      };

      const response = await request(app)
        .put(`/api/vlogs/${testVlog._id}`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.data.images).toHaveLength(2);
      expect(response.body.data.images[0].publicId).toBe('test_image_1');
      expect(response.body.data.images[1].publicId).toBe('test_image_3');
    });

    test('should enforce maximum image count (10 images)', async () => {
      const tooManyImages = Array.from({ length: 11 }, (_, i) => ({
        url: `https://example.com/image${i}.jpg`,
        publicId: `test_image_${i}`,
        caption: `Image ${i}`,
        order: i,
      }));

      const updateData = {
        title: testVlog.title,
        description: testVlog.description,
        category: testVlog.category,
        tags: testVlog.tags,
        images: tooManyImages,
      };

      const response = await request(app)
        .put(`/api/vlogs/${testVlog._id}`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send(updateData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message || response.body.error).toMatch(/more than 10 images/i);
    });

    test('should enforce minimum image requirement (at least 1)', async () => {
      const updateData = {
        title: testVlog.title,
        description: testVlog.description,
        category: testVlog.category,
        tags: testVlog.tags,
        images: [], // No images
      };

      const response = await request(app)
        .put(`/api/vlogs/${testVlog._id}`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send(updateData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message || response.body.error).toMatch(/at least one image/i);
    });
  });

  describe('Complete Delete Flow', () => {
    test('should successfully delete vlog and clean up images', async () => {
      const { deleteImage } = require('../middleware/upload');

      // Delete the vlog
      const response = await request(app)
        .delete(`/api/vlogs/${testVlog._id}`)
        .set('Authorization', `Bearer ${authorToken}`);

      // Verify response
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toMatch(/deleted successfully/i);

      // Verify vlog was removed from database
      const deletedVlog = await Vlog.findById(testVlog._id);
      expect(deletedVlog).toBeNull();

      // Verify image cleanup was attempted
      expect(deleteImage).toHaveBeenCalledWith('test_image_1');
      expect(deleteImage).toHaveBeenCalledWith('test_image_2');
      expect(deleteImage).toHaveBeenCalledTimes(2);
    });

    test('should return 404 when querying deleted vlog', async () => {
      // Delete the vlog
      await request(app)
        .delete(`/api/vlogs/${testVlog._id}`)
        .set('Authorization', `Bearer ${authorToken}`);

      // Try to get the deleted vlog
      const response = await request(app)
        .get(`/api/vlogs/${testVlog._id}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message || response.body.error).toMatch(/not found/i);
    });

    test('should continue deletion even if image cleanup fails', async () => {
      const { deleteImage } = require('../middleware/upload');

      // Mock image deletion to fail
      deleteImage.mockRejectedValueOnce(new Error('Cloudinary error'));

      // Delete should still succeed
      const response = await request(app)
        .delete(`/api/vlogs/${testVlog._id}`)
        .set('Authorization', `Bearer ${authorToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify vlog was still removed from database
      const deletedVlog = await Vlog.findById(testVlog._id);
      expect(deletedVlog).toBeNull();
    });
  });

  describe('Authorization for Different User Roles', () => {
    test('should allow author to edit their own vlog', async () => {
      const updateData = {
        title: 'Author Updated Title',
        description: testVlog.description,
        category: testVlog.category,
        tags: testVlog.tags,
        images: testVlog.images,
      };

      const response = await request(app)
        .put(`/api/vlogs/${testVlog._id}`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should prevent non-author from editing vlog (403)', async () => {
      const updateData = {
        title: 'Non-Author Update Attempt',
        description: testVlog.description,
        category: testVlog.category,
        tags: testVlog.tags,
        images: testVlog.images,
      };

      const response = await request(app)
        .put(`/api/vlogs/${testVlog._id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send(updateData);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message || response.body.error).toMatch(/not authorized/i);

      // Verify vlog was not updated
      const unchangedVlog = await Vlog.findById(testVlog._id);
      expect(unchangedVlog.title).toBe(testVlog.title);
    });

    test('should prevent unauthenticated user from editing (401)', async () => {
      const updateData = {
        title: 'Unauthenticated Update Attempt',
        description: testVlog.description,
        category: testVlog.category,
        tags: testVlog.tags,
        images: testVlog.images,
      };

      const response = await request(app)
        .put(`/api/vlogs/${testVlog._id}`)
        .send(updateData);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test('should allow author to delete their own vlog', async () => {
      const response = await request(app)
        .delete(`/api/vlogs/${testVlog._id}`)
        .set('Authorization', `Bearer ${authorToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should prevent non-author from deleting vlog (403)', async () => {
      const response = await request(app)
        .delete(`/api/vlogs/${testVlog._id}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message || response.body.error).toMatch(/not authorized/i);

      // Verify vlog still exists
      const stillExistsVlog = await Vlog.findById(testVlog._id);
      expect(stillExistsVlog).not.toBeNull();
    });

    test('should prevent unauthenticated user from deleting (401)', async () => {
      const response = await request(app)
        .delete(`/api/vlogs/${testVlog._id}`);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);

      // Verify vlog still exists
      const stillExistsVlog = await Vlog.findById(testVlog._id);
      expect(stillExistsVlog).not.toBeNull();
    });
  });

  describe('Error Scenarios and Recovery', () => {
    test('should return 404 when editing non-existent vlog', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const updateData = {
        title: 'Update Non-Existent',
        description: 'This should fail',
        category: 'technology',
        tags: ['test'],
        images: [{ url: 'test.jpg', publicId: 'test', order: 0 }],
      };

      const response = await request(app)
        .put(`/api/vlogs/${fakeId}`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send(updateData);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message || response.body.error).toMatch(/not found/i);
    });

    test('should return 404 when deleting non-existent vlog', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .delete(`/api/vlogs/${fakeId}`)
        .set('Authorization', `Bearer ${authorToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message || response.body.error).toMatch(/not found/i);
    });

    test('should handle invalid vlog ID format gracefully', async () => {
      const invalidId = 'not-a-valid-id';

      const updateResponse = await request(app)
        .put(`/api/vlogs/${invalidId}`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send({
          title: 'Test',
          description: 'Test description',
          category: 'technology',
          tags: [],
          images: [{ url: 'test.jpg', publicId: 'test', order: 0 }],
        });

      expect(updateResponse.status).toBeGreaterThanOrEqual(400);
      expect(updateResponse.body.success).toBe(false);

      const deleteResponse = await request(app)
        .delete(`/api/vlogs/${invalidId}`)
        .set('Authorization', `Bearer ${authorToken}`);

      expect(deleteResponse.status).toBeGreaterThanOrEqual(400);
      expect(deleteResponse.body.success).toBe(false);
    });

    test('should maintain data integrity on validation failure', async () => {
      const originalTitle = testVlog.title;
      const originalDescription = testVlog.description;

      // Attempt update with invalid data
      await request(app)
        .put(`/api/vlogs/${testVlog._id}`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send({
          title: 'AB', // Too short
          description: 'Short', // Too short
          category: 'technology',
          tags: [],
          images: testVlog.images,
        });

      // Verify original data is unchanged
      const unchangedVlog = await Vlog.findById(testVlog._id);
      expect(unchangedVlog.title).toBe(originalTitle);
      expect(unchangedVlog.description).toBe(originalDescription);
    });

    test('should handle concurrent edit attempts correctly', async () => {
      const updateData1 = {
        title: 'First Update',
        description: testVlog.description,
        category: testVlog.category,
        tags: testVlog.tags,
        images: testVlog.images,
      };

      const updateData2 = {
        title: 'Second Update',
        description: testVlog.description,
        category: testVlog.category,
        tags: testVlog.tags,
        images: testVlog.images,
      };

      // Make concurrent requests
      const [response1, response2] = await Promise.all([
        request(app)
          .put(`/api/vlogs/${testVlog._id}`)
          .set('Authorization', `Bearer ${authorToken}`)
          .send(updateData1),
        request(app)
          .put(`/api/vlogs/${testVlog._id}`)
          .set('Authorization', `Bearer ${authorToken}`)
          .send(updateData2),
      ]);

      // Both should succeed (last write wins)
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      // Final state should be one of the updates
      const finalVlog = await Vlog.findById(testVlog._id);
      expect(['First Update', 'Second Update']).toContain(finalVlog.title);
    });
  });

  describe('Data Persistence and Consistency', () => {
    test('should persist all updated fields correctly', async () => {
      const updateData = {
        title: 'Completely New Title',
        description: 'A completely new description that is long enough to pass validation',
        category: 'travel',
        tags: ['new', 'tags', 'here'],
        images: [
          {
            url: 'https://example.com/new-image.jpg',
            publicId: 'new_image_id',
            caption: 'New caption',
            order: 0,
          },
        ],
      };

      await request(app)
        .put(`/api/vlogs/${testVlog._id}`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send(updateData);

      // Fetch fresh from database
      const updatedVlog = await Vlog.findById(testVlog._id);

      expect(updatedVlog.title).toBe(updateData.title);
      expect(updatedVlog.description).toBe(updateData.description);
      expect(updatedVlog.category).toBe(updateData.category);
      expect(updatedVlog.tags).toEqual(updateData.tags);
      expect(updatedVlog.images).toHaveLength(1);
      expect(updatedVlog.images[0].publicId).toBe('new_image_id');
    });

    test('should maintain author relationship after update', async () => {
      const updateData = {
        title: 'Updated Title',
        description: testVlog.description,
        category: testVlog.category,
        tags: testVlog.tags,
        images: testVlog.images,
      };

      await request(app)
        .put(`/api/vlogs/${testVlog._id}`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send(updateData);

      const updatedVlog = await Vlog.findById(testVlog._id);
      expect(updatedVlog.author.toString()).toBe(authorUser._id.toString());
    });

    test('should update timestamps on edit', async () => {
      const originalUpdatedAt = testVlog.updatedAt;

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 100));

      const updateData = {
        title: 'Updated Title',
        description: testVlog.description,
        category: testVlog.category,
        tags: testVlog.tags,
        images: testVlog.images,
      };

      await request(app)
        .put(`/api/vlogs/${testVlog._id}`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send(updateData);

      const updatedVlog = await Vlog.findById(testVlog._id);
      expect(updatedVlog.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });
});
