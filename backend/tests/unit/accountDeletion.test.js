/* eslint-disable no-underscore-dangle */
const mongoose = require('mongoose');
const userDeletionService = require('../../src/services/userDeletionService');
const User = require('../../src/models/User');
const Vlog = require('../../src/models/Vlog');
const Comment = require('../../src/models/Comment');
const Like = require('../../src/models/Like');
const redis = require('../../src/config/redis');
const logger = require('../../src/config/logger');
const { queueAssetCleanup } = require('../../src/queues/accountDeletionQueue');

// Mock all external dependencies
jest.mock('../../src/models/User');
jest.mock('../../src/models/Vlog');
jest.mock('../../src/models/Comment');
jest.mock('../../src/models/Like');
jest.mock('../../src/config/redis');
jest.mock('../../src/config/logger');
jest.mock('../../src/queues/accountDeletionQueue');

describe('userDeletionService.deleteUser() - Unit Tests', () => {
  let mockSession;
  let mockUser;
  let mockVlogs;
  let mockRedisClient;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock session object
    mockSession = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn(),
      session: jest.fn(),
    };

    // Mock mongoose.startSession
    jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession);
    jest.spyOn(mongoose.Types.ObjectId, 'isValid').mockReturnValue(true);

    // Mock user object
    mockUser = {
      _id: '507f1f77bcf86cd799439011',
      username: 'testuser',
      email: 'test@example.com',
    };

    // Mock vlogs with images
    mockVlogs = [
      {
        _id: '507f1f77bcf86cd799439012',
        title: 'Test Vlog 1',
        author: mockUser._id,
        images: [
          { publicId: 'vlog/image1', url: 'http://example.com/1.jpg' },
          { publicId: 'vlog/image2', url: 'http://example.com/2.jpg' },
        ],
      },
      {
        _id: '507f1f77bcf86cd799439013',
        title: 'Test Vlog 2',
        author: mockUser._id,
        images: [{ publicId: 'vlog/image3', url: 'http://example.com/3.jpg' }],
      },
    ];

    // Mock logger methods
    logger.info.mockImplementation(() => {});
    logger.debug.mockImplementation(() => {});
    logger.warn.mockImplementation(() => {});
    logger.error.mockImplementation(() => {});

    // Mock Redis
    mockRedisClient = {
      safeDel: jest.fn().mockResolvedValue(2),
      invalidateTags: jest.fn().mockResolvedValue(1),
    };
    redis.createRedisClient.mockReturnValue(mockRedisClient);

    // Mock queue
    queueAssetCleanup.mockResolvedValue({ id: 'job-123' });

    // Mock new operations added in Phase D cascade:
    // Comment.find / Like.find used to collect counter deltas before bulk delete
    Comment.find.mockReturnValue({
      session: jest.fn().mockResolvedValue([]),
    });
    Like.find.mockReturnValue({
      session: jest.fn().mockResolvedValue([]),
    });
    // User.updateMany used for follower[], following[], bookmarks[] cleanup
    User.updateMany.mockResolvedValue({ modifiedCount: 0 });
    // Vlog.bulkWrite used for bulk counter decrements
    Vlog.bulkWrite.mockResolvedValue({ modifiedCount: 0 });
    // Vlog.updateMany used for floor protection after counter decrements
    Vlog.updateMany.mockResolvedValue({ modifiedCount: 0 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('✅ Success Path', () => {
    it('should delete user and all related data successfully', async () => {
      // Arrange
      User.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockUser),
      });

      Vlog.find.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockVlogs),
      });

      Comment.deleteMany.mockResolvedValue({ deletedCount: 5 });
      Like.deleteMany.mockResolvedValue({ deletedCount: 10 });
      Vlog.deleteMany.mockResolvedValue({ deletedCount: 2 });
      User.findByIdAndDelete.mockResolvedValue(mockUser);

      // Act
      const result = await userDeletionService.deleteUser(mockUser._id, {
        correlationId: 'test-123',
        ip: '127.0.0.1',
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.deletedCounts.vlogs).toBe(2);
      expect(result.deletedCounts.comments).toBe(5);
      expect(result.deletedCounts.likes).toBe(10);
      expect(result.deletedCounts.assets).toBe(3);
      expect(result.username).toBe('testuser');

      // Verify transaction flow
      expect(mockSession.startTransaction).toHaveBeenCalledTimes(1);
      expect(mockSession.commitTransaction).toHaveBeenCalledTimes(1);
      expect(mockSession.abortTransaction).not.toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalledTimes(1);
    });

    it('should delete user document after deleting all related data', async () => {
      // Arrange
      User.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockUser),
      });

      Vlog.find.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockVlogs),
      });

      Comment.deleteMany.mockResolvedValue({ deletedCount: 5 });
      Like.deleteMany.mockResolvedValue({ deletedCount: 10 });
      Vlog.deleteMany.mockResolvedValue({ deletedCount: 2 });
      User.findByIdAndDelete.mockResolvedValue(mockUser);

      // Act
      await userDeletionService.deleteUser(mockUser._id);

      // Assert - verify deletion order
      const deleteManyCalls = [
        Comment.deleteMany.mock.invocationCallOrder[0],
        Like.deleteMany.mock.invocationCallOrder[0],
        Vlog.deleteMany.mock.invocationCallOrder[0],
        User.findByIdAndDelete.mock.invocationCallOrder[0],
      ];

      // User deletion should be last
      expect(deleteManyCalls[3]).toBeGreaterThan(deleteManyCalls[0]);
      expect(deleteManyCalls[3]).toBeGreaterThan(deleteManyCalls[1]);
      expect(deleteManyCalls[3]).toBeGreaterThan(deleteManyCalls[2]);
    });

    it('should commit transaction only after all DB operations succeed', async () => {
      // Arrange
      User.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockUser),
      });

      Vlog.find.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockVlogs),
      });

      Comment.deleteMany.mockResolvedValue({ deletedCount: 0 });
      Like.deleteMany.mockResolvedValue({ deletedCount: 0 });
      Vlog.deleteMany.mockResolvedValue({ deletedCount: 2 });
      User.findByIdAndDelete.mockResolvedValue(mockUser);

      // Act
      await userDeletionService.deleteUser(mockUser._id);

      // Assert
      expect(mockSession.commitTransaction).toHaveBeenCalledTimes(1);

      // Verify commit called after all deletions
      const commitCallOrder = mockSession.commitTransaction.mock.invocationCallOrder[0];
      const userDeleteCallOrder = User.findByIdAndDelete.mock.invocationCallOrder[0];

      expect(commitCallOrder).toBeGreaterThan(userDeleteCallOrder);
    });

    it('should clear Redis keys after DB transaction commits', async () => {
      // Arrange
      User.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockUser),
      });

      Vlog.find.mockReturnValue({
        session: jest.fn().mockResolvedValue([]),
      });

      Comment.deleteMany.mockResolvedValue({ deletedCount: 0 });
      Like.deleteMany.mockResolvedValue({ deletedCount: 0 });
      Vlog.deleteMany.mockResolvedValue({ deletedCount: 0 });
      User.findByIdAndDelete.mockResolvedValue(mockUser);

      // Act
      await userDeletionService.deleteUser(mockUser._id);

      // Assert
      expect(mockRedisClient.safeDel).toHaveBeenCalledWith(`session:${mockUser._id}`, `socket:${mockUser._id}`);

      // Verify Redis cleanup happens after commit
      const commitCallOrder = mockSession.commitTransaction.mock.invocationCallOrder[0];
      const redisCallOrder = mockRedisClient.safeDel.mock.invocationCallOrder[0];

      expect(redisCallOrder).toBeGreaterThan(commitCallOrder);
    });

    it('should queue Cloudinary asset cleanup with correct publicIds', async () => {
      // Arrange
      User.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockUser),
      });

      Vlog.find.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockVlogs),
      });

      Comment.deleteMany.mockResolvedValue({ deletedCount: 0 });
      Like.deleteMany.mockResolvedValue({ deletedCount: 0 });
      Vlog.deleteMany.mockResolvedValue({ deletedCount: 2 });
      User.findByIdAndDelete.mockResolvedValue(mockUser);

      // Act
      await userDeletionService.deleteUser(mockUser._id);

      // Assert
      expect(queueAssetCleanup).toHaveBeenCalledWith(mockUser._id, [
        'vlog/image1',
        'vlog/image2',
        'vlog/image3',
      ]);
    });
  });

  describe('❌ Security & Validation', () => {
    it('should throw error if userId is invalid', async () => {
      // Arrange
      mongoose.Types.ObjectId.isValid.mockReturnValue(false);

      // Act & Assert
      await expect(
        userDeletionService.deleteUser('invalid-id'),
      ).rejects.toThrow('Invalid user ID');

      expect(mockSession.startTransaction).not.toHaveBeenCalled();
    });

    it('should throw error if user not found', async () => {
      // Arrange
      User.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
      });

      // Act & Assert
      await expect(
        userDeletionService.deleteUser(mockUser._id),
      ).rejects.toThrow('User not found');

      expect(mockSession.abortTransaction).toHaveBeenCalledTimes(1);
      expect(mockSession.commitTransaction).not.toHaveBeenCalled();
    });

    it('should only delete data for the specified user', async () => {
      // Arrange
      const targetUserId = '507f1f77bcf86cd799439011';

      User.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockUser),
      });

      Vlog.find.mockReturnValue({
        session: jest.fn().mockResolvedValue([]),
      });

      Comment.deleteMany.mockResolvedValue({ deletedCount: 0 });
      Like.deleteMany.mockResolvedValue({ deletedCount: 0 });
      Vlog.deleteMany.mockResolvedValue({ deletedCount: 0 });
      User.findByIdAndDelete.mockResolvedValue(mockUser);

      // Act
      await userDeletionService.deleteUser(targetUserId);

      // Assert - verify userId used in all queries
      expect(Comment.deleteMany).toHaveBeenCalledWith(
        { user: targetUserId },
        { session: mockSession },
      );
      expect(Like.deleteMany).toHaveBeenCalledWith(
        { user: targetUserId },
        { session: mockSession },
      );
      expect(Vlog.deleteMany).toHaveBeenCalledWith(
        { author: targetUserId },
        { session: mockSession },
      );
      expect(User.findByIdAndDelete).toHaveBeenCalledWith(targetUserId, {
        session: mockSession,
      });
    });
  });

  describe('🔁 Transaction Safety', () => {
    it('should rollback transaction if vlog deletion fails', async () => {
      // Arrange
      User.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockUser),
      });

      Vlog.find.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockVlogs),
      });

      Comment.deleteMany.mockResolvedValue({ deletedCount: 5 });
      Like.deleteMany.mockResolvedValue({ deletedCount: 10 });
      Vlog.deleteMany.mockRejectedValue(new Error('DB connection lost'));

      // Act & Assert
      await expect(
        userDeletionService.deleteUser(mockUser._id),
      ).rejects.toThrow('DB connection lost');

      expect(mockSession.abortTransaction).toHaveBeenCalledTimes(1);
      expect(mockSession.commitTransaction).not.toHaveBeenCalled();
      expect(User.findByIdAndDelete).not.toHaveBeenCalled();
    });

    it('should rollback transaction if user deletion fails', async () => {
      // Arrange
      User.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockUser),
      });

      Vlog.find.mockReturnValue({
        session: jest.fn().mockResolvedValue([]),
      });

      Comment.deleteMany.mockResolvedValue({ deletedCount: 0 });
      Like.deleteMany.mockResolvedValue({ deletedCount: 0 });
      Vlog.deleteMany.mockResolvedValue({ deletedCount: 0 });
      User.findByIdAndDelete.mockRejectedValue(new Error('Deletion blocked'));

      // Act & Assert
      await expect(
        userDeletionService.deleteUser(mockUser._id),
      ).rejects.toThrow('Deletion blocked');

      expect(mockSession.abortTransaction).toHaveBeenCalledTimes(1);
      expect(mockSession.commitTransaction).not.toHaveBeenCalled();
    });

    it('should not execute Redis cleanup if DB transaction fails', async () => {
      // Arrange
      User.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockUser),
      });

      Vlog.find.mockReturnValue({
        session: jest.fn().mockRejectedValueOnce(new Error('Query timeout')),
      });

      // Act & Assert
      await expect(
        userDeletionService.deleteUser(mockUser._id),
      ).rejects.toThrow('Query timeout');

      expect(mockRedisClient.safeDel).not.toHaveBeenCalled();
      expect(mockRedisClient.invalidateTags).not.toHaveBeenCalled();
      expect(queueAssetCleanup).not.toHaveBeenCalled();
    });
  });

  describe('☁️ Background Jobs', () => {
    it('should call Bull queue with correct userId and publicIds', async () => {
      // Arrange
      User.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockUser),
      });

      Vlog.find.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockVlogs),
      });

      Comment.deleteMany.mockResolvedValue({ deletedCount: 0 });
      Like.deleteMany.mockResolvedValue({ deletedCount: 0 });
      Vlog.deleteMany.mockResolvedValue({ deletedCount: 2 });
      User.findByIdAndDelete.mockResolvedValue(mockUser);

      // Act
      await userDeletionService.deleteUser(mockUser._id);

      // Assert
      expect(queueAssetCleanup).toHaveBeenCalledTimes(1);
      expect(queueAssetCleanup).toHaveBeenCalledWith(
        mockUser._id,
        expect.arrayContaining(['vlog/image1', 'vlog/image2', 'vlog/image3']),
      );
    });

    it('should not fail deletion if queue job fails (non-critical)', async () => {
      // Arrange
      User.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockUser),
      });

      Vlog.find.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockVlogs),
      });

      Comment.deleteMany.mockResolvedValue({ deletedCount: 0 });
      Like.deleteMany.mockResolvedValue({ deletedCount: 0 });
      Vlog.deleteMany.mockResolvedValue({ deletedCount: 2 });
      User.findByIdAndDelete.mockResolvedValue(mockUser);

      queueAssetCleanup.mockRejectedValue(new Error('Queue unavailable'));

      // Act
      const result = await userDeletionService.deleteUser(mockUser._id);

      // Assert - should succeed despite queue failure
      expect(result.success).toBe(true);
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to queue Cloudinary cleanup',
        expect.objectContaining({
          userId: mockUser._id,
          error: 'Queue unavailable',
        }),
      );
    });

    it('should skip Cloudinary queue if no assets exist', async () => {
      // Arrange
      User.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockUser),
      });

      Vlog.find.mockReturnValue({
        session: jest.fn().mockResolvedValue([]),
      });

      Comment.deleteMany.mockResolvedValue({ deletedCount: 0 });
      Like.deleteMany.mockResolvedValue({ deletedCount: 0 });
      Vlog.deleteMany.mockResolvedValue({ deletedCount: 0 });
      User.findByIdAndDelete.mockResolvedValue(mockUser);

      // Act
      const result = await userDeletionService.deleteUser(mockUser._id);

      // Assert
      expect(queueAssetCleanup).not.toHaveBeenCalled();
      expect(result.deletedCounts.assets).toBe(0);
    });
  });

  describe('🧪 Edge Cases & Idempotency', () => {
    it('should handle Redis cleanup failure gracefully (non-critical)', async () => {
      // Arrange
      User.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockUser),
      });

      Vlog.find.mockReturnValue({
        session: jest.fn().mockResolvedValue([]),
      });

      Comment.deleteMany.mockResolvedValue({ deletedCount: 0 });
      Like.deleteMany.mockResolvedValue({ deletedCount: 0 });
      Vlog.deleteMany.mockResolvedValue({ deletedCount: 0 });
      User.findByIdAndDelete.mockResolvedValue(mockUser);

      mockRedisClient.safeDel.mockRejectedValue(new Error('Redis connection lost'));

      // Act
      const result = await userDeletionService.deleteUser(mockUser._id);

      // Assert - should succeed despite Redis failure
      expect(result.success).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith(
        'Redis cleanup failed (non-critical)',
        expect.objectContaining({
          userId: mockUser._id,
        }),
      );
    });

    it('should always close session even if error occurs', async () => {
      // Arrange
      User.findById.mockReturnValue({
        session: jest.fn().mockRejectedValue(new Error('DB error')),
      });

      // Act & Assert
      await expect(
        userDeletionService.deleteUser(mockUser._id),
      ).rejects.toThrow('DB error');

      expect(mockSession.endSession).toHaveBeenCalledTimes(1);
    });

    it('should handle vlogs with missing or empty images array', async () => {
      // Arrange
      const vlogsWithoutImages = [
        { _id: '1', title: 'Vlog 1', images: null },
        { _id: '2', title: 'Vlog 2', images: [] },
        { _id: '3', title: 'Vlog 3' },
      ];

      User.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockUser),
      });

      Vlog.find.mockReturnValue({
        session: jest.fn().mockResolvedValue(vlogsWithoutImages),
      });

      Comment.deleteMany.mockResolvedValue({ deletedCount: 0 });
      Like.deleteMany.mockResolvedValue({ deletedCount: 0 });
      Vlog.deleteMany.mockResolvedValue({ deletedCount: 3 });
      User.findByIdAndDelete.mockResolvedValue(mockUser);

      // Act
      const result = await userDeletionService.deleteUser(mockUser._id);

      // Assert
      expect(result.success).toBe(true);
      expect(queueAssetCleanup).not.toHaveBeenCalled();
      expect(result.deletedCounts.assets).toBe(0);
    });
  });
});
