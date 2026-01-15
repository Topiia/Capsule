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
 * Unit Tests for Bookmark Controller Methods
 *
 * Tests bookmark functionality including:
 * - getBookmarks returns user's bookmarked vlogs
 * - addBookmark adds vlog to bookmarks array
 * - removeBookmark removes vlog from bookmarks array
 * - Bookmark operations with invalid vlog IDs
 *
 * Requirements: 4.2, 4.3
 */

describe('Bookmark Controller Unit Tests', () => {
  let testUser; let
    userToken;
  let testVlog1; let testVlog2; let
    testVlog3;
  let otherUser;

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

    // Create test user
    testUser = await User.create({
      username: 'testuser',
      email: 'test@example.com',
      password: 'password123',
    });
    userToken = jwt.sign({ id: testUser._id }, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });

    // Create other user for vlog authorship
    otherUser = await User.create({
      username: 'otheruser',
      email: 'other@example.com',
      password: 'password123',
    });

    // Create test vlogs
    testVlog1 = await Vlog.create({
      title: 'Test Vlog 1',
      description: 'This is test vlog number one for bookmark testing',
      category: 'technology',
      tags: ['test', 'bookmark'],
      images: [{
        url: 'https://example.com/image1.jpg',
        publicId: 'test_image_1',
        order: 0,
      }],
      author: otherUser._id,
    });

    testVlog2 = await Vlog.create({
      title: 'Test Vlog 2',
      description: 'This is test vlog number two for bookmark testing',
      category: 'lifestyle',
      tags: ['test', 'bookmark'],
      images: [{
        url: 'https://example.com/image2.jpg',
        publicId: 'test_image_2',
        order: 0,
      }],
      author: otherUser._id,
    });

    testVlog3 = await Vlog.create({
      title: 'Test Vlog 3',
      description: 'This is test vlog number three for bookmark testing',
      category: 'travel',
      tags: ['test', 'bookmark'],
      images: [{
        url: 'https://example.com/image3.jpg',
        publicId: 'test_image_3',
        order: 0,
      }],
      author: otherUser._id,
    });
  });

  describe('getBookmarks', () => {
    test('should return empty array when user has no bookmarks', async () => {
      const response = await request(app)
        .get('/api/users/bookmarks')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
      expect(response.body.count).toBe(0);
      expect(response.body.total).toBe(0);
    });

    test('should return user\'s bookmarked vlogs', async () => {
      // Add bookmarks to user
      testUser.bookmarks = [testVlog1._id, testVlog2._id];
      await testUser.save();

      const response = await request(app)
        .get('/api/users/bookmarks')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.count).toBe(2);
      expect(response.body.total).toBe(2);

      // Verify vlog details are populated
      const vlogIds = response.body.data.map((v) => v._id);
      expect(vlogIds).toContain(testVlog1._id.toString());
      expect(vlogIds).toContain(testVlog2._id.toString());

      // Verify author is populated
      expect(response.body.data[0].author).toBeDefined();
      expect(response.body.data[0].author.username).toBe('otheruser');
    });

    test('should return bookmarks with pagination', async () => {
      // Add all three vlogs as bookmarks
      testUser.bookmarks = [testVlog1._id, testVlog2._id, testVlog3._id];
      await testUser.save();

      // Request first page with limit of 2
      const response = await request(app)
        .get('/api/users/bookmarks?page=1&limit=2')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(2);
      expect(response.body.total).toBe(3);
      expect(response.body.totalPages).toBe(2);
      expect(response.body.currentPage).toBe(1);
      expect(response.body.hasNextPage).toBe(true);
      expect(response.body.hasPrevPage).toBe(false);
    });

    test('should return second page of bookmarks', async () => {
      // Add all three vlogs as bookmarks
      testUser.bookmarks = [testVlog1._id, testVlog2._id, testVlog3._id];
      await testUser.save();

      // Request second page with limit of 2
      const response = await request(app)
        .get('/api/users/bookmarks?page=2&limit=2')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(1);
      expect(response.body.total).toBe(3);
      expect(response.body.totalPages).toBe(2);
      expect(response.body.currentPage).toBe(2);
      expect(response.body.hasNextPage).toBe(false);
      expect(response.body.hasPrevPage).toBe(true);
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .get('/api/users/bookmarks');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('addBookmark', () => {
    test('should add vlog to user\'s bookmarks array', async () => {
      const response = await request(app)
        .post(`/api/users/bookmarks/${testVlog1._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.bookmarked).toBe(true);

      // Verify bookmark was added to database
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.bookmarks).toHaveLength(1);
      expect(updatedUser.bookmarks[0].toString()).toBe(testVlog1._id.toString());
    });

    test('should not add duplicate bookmark', async () => {
      // Add bookmark first time
      await request(app)
        .post(`/api/users/bookmarks/${testVlog1._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      // Try to add same bookmark again
      const response = await request(app)
        .post(`/api/users/bookmarks/${testVlog1._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify only one bookmark exists
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.bookmarks).toHaveLength(1);
    });

    test('should add multiple different bookmarks', async () => {
      // Add first bookmark
      await request(app)
        .post(`/api/users/bookmarks/${testVlog1._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      // Add second bookmark
      await request(app)
        .post(`/api/users/bookmarks/${testVlog2._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      // Verify both bookmarks exist
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.bookmarks).toHaveLength(2);
      expect(updatedUser.bookmarks.map((id) => id.toString())).toContain(testVlog1._id.toString());
      expect(updatedUser.bookmarks.map((id) => id.toString())).toContain(testVlog2._id.toString());
    });

    test('should return 404 for invalid vlog ID', async () => {
      const fakeVlogId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .post(`/api/users/bookmarks/${fakeVlogId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message || response.body.error).toMatch(/not found/i);

      // Verify no bookmark was added
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.bookmarks).toHaveLength(0);
    });

    test('should handle malformed vlog ID', async () => {
      const invalidId = 'not-a-valid-id';

      const response = await request(app)
        .post(`/api/users/bookmarks/${invalidId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.body.success).toBe(false);

      // Verify no bookmark was added
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.bookmarks).toHaveLength(0);
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .post(`/api/users/bookmarks/${testVlog1._id}`);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('removeBookmark', () => {
    test('should remove vlog from user\'s bookmarks array', async () => {
      // Add bookmark first
      testUser.bookmarks = [testVlog1._id];
      await testUser.save();

      const response = await request(app)
        .delete(`/api/users/bookmarks/${testVlog1._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.bookmarked).toBe(false);

      // Verify bookmark was removed from database
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.bookmarks).toHaveLength(0);
    });

    test('should remove only specified bookmark', async () => {
      // Add multiple bookmarks
      testUser.bookmarks = [testVlog1._id, testVlog2._id, testVlog3._id];
      await testUser.save();

      // Remove one bookmark
      const response = await request(app)
        .delete(`/api/users/bookmarks/${testVlog2._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify only the specified bookmark was removed
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.bookmarks).toHaveLength(2);
      expect(updatedUser.bookmarks.map((id) => id.toString())).toContain(testVlog1._id.toString());
      expect(updatedUser.bookmarks.map((id) => id.toString())).toContain(testVlog3._id.toString());
      expect(updatedUser.bookmarks.map((id) => id.toString())).not.toContain(testVlog2._id.toString());
    });

    test('should handle removing non-existent bookmark gracefully', async () => {
      // User has no bookmarks
      const response = await request(app)
        .delete(`/api/users/bookmarks/${testVlog1._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.bookmarked).toBe(false);

      // Verify bookmarks array is still empty
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.bookmarks).toHaveLength(0);
    });

    test('should handle invalid vlog ID', async () => {
      const fakeVlogId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .delete(`/api/users/bookmarks/${fakeVlogId}`)
        .set('Authorization', `Bearer ${userToken}`);

      // Should succeed even with non-existent vlog ID
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should handle malformed vlog ID gracefully', async () => {
      const invalidId = 'not-a-valid-id';

      const response = await request(app)
        .delete(`/api/users/bookmarks/${invalidId}`)
        .set('Authorization', `Bearer ${userToken}`);

      // The controller doesn't validate ID format for removal
      // It just filters the array, so it succeeds even with invalid ID
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .delete(`/api/users/bookmarks/${testVlog1._id}`);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Bookmark State Consistency', () => {
    test('should maintain bookmark order after multiple operations', async () => {
      // Add bookmarks in specific order
      await request(app)
        .post(`/api/users/bookmarks/${testVlog1._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      await request(app)
        .post(`/api/users/bookmarks/${testVlog2._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      await request(app)
        .post(`/api/users/bookmarks/${testVlog3._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      // Remove middle bookmark
      await request(app)
        .delete(`/api/users/bookmarks/${testVlog2._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      // Verify remaining bookmarks
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.bookmarks).toHaveLength(2);
      expect(updatedUser.bookmarks[0].toString()).toBe(testVlog1._id.toString());
      expect(updatedUser.bookmarks[1].toString()).toBe(testVlog3._id.toString());
    });

    test('should handle concurrent bookmark operations', async () => {
      // Attempt to add multiple bookmarks concurrently
      const promises = [
        request(app)
          .post(`/api/users/bookmarks/${testVlog1._id}`)
          .set('Authorization', `Bearer ${userToken}`),
        request(app)
          .post(`/api/users/bookmarks/${testVlog2._id}`)
          .set('Authorization', `Bearer ${userToken}`),
        request(app)
          .post(`/api/users/bookmarks/${testVlog3._id}`)
          .set('Authorization', `Bearer ${userToken}`),
      ];

      const responses = await Promise.all(promises);

      // All should succeed
      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      // Verify all bookmarks were added
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.bookmarks).toHaveLength(3);
    });

    test('should persist bookmarks across multiple requests', async () => {
      // Add bookmark
      await request(app)
        .post(`/api/users/bookmarks/${testVlog1._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      // Fetch bookmarks
      const response1 = await request(app)
        .get('/api/users/bookmarks')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response1.body.data).toHaveLength(1);

      // Fetch again to ensure persistence
      const response2 = await request(app)
        .get('/api/users/bookmarks')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response2.body.data).toHaveLength(1);
      expect(response2.body.data[0]._id).toBe(response1.body.data[0]._id);
    });
  });
});
