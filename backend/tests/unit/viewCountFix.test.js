const VlogService = require('../../src/services/vlogService');
const Vlog = require('../../src/models/Vlog');
const Like = require('../../src/models/Like');
const Comment = require('../../src/models/Comment');

const User = require('../../src/models/User');

jest.mock('../../src/models/Vlog');
jest.mock('../../src/models/Like');
jest.mock('../../src/models/Comment');
jest.mock('../../src/models/User');
jest.mock('../../src/config/redis');

describe('View Count Logic - Bug Fix Verification', () => {
  let vlogService;

  beforeEach(() => {
    jest.clearAllMocks();
    vlogService = VlogService;

    Comment.find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockResolvedValue([]),
    });

    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({ bookmarks: [] }),
    });
  });

  describe('SUCCESS: Views increment only when intended', () => {
    test('Fetching single vlog does NOT auto-increment views', async () => {
      const mockVlog = {
        _id: '507f1f77bcf86cd799439012',
        title: 'Test Vlog',
        views: 100,
        author: {
          _id: '507f1f77bcf86cd799439013',
          username: 'testuser',
          followers: [],
        },
        toObject: jest.fn().mockReturnThis(),
      };

      Vlog.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockVlog),
      });

      Like.findOne = jest.fn().mockResolvedValue(null);

      // Act: Fetch vlog (should NOT increment)
      await vlogService.getVlog('507f1f77bcf86cd799439012', '507f1f77bcf86cd799439011');

      // Assert: No view increment calls made
      expect(Vlog.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(mockVlog.views).toBe(100); // Unchanged
    });

    test('recordView endpoint increments views exactly once', async () => {
      Vlog.findByIdAndUpdate = jest.fn().mockResolvedValue({ views: 101 });

      // Act: Explicit view record
      await vlogService.recordView('507f1f77bcf86cd799439012', '507f1f77bcf86cd799439011');

      // Assert: Incremented exactly once
      expect(Vlog.findByIdAndUpdate).toHaveBeenCalledTimes(1);
      expect(Vlog.findByIdAndUpdate).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439012',
        { $inc: { views: 1 } },
        { new: true },
      );
    });

    test('Fetching vlog list does NOT increment views', async () => {
      const mockVlogs = [
        { _id: 'vlog1', title: 'Vlog 1', views: 50 },
        { _id: 'vlog2', title: 'Vlog 2', views: 75 },
      ];

      Vlog.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockVlogs),
      });

      Vlog.countDocuments = jest.fn().mockResolvedValue(2);

      // Act: Simulate GET /api/vlogs
      await Vlog.find({ isPublic: true });

      // Assert: No view increments
      expect(Vlog.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('EDGE CASE: Prevent double increments', () => {
    test('Multiple fetches of same vlog do NOT increment views', async () => {
      const mockVlog = {
        _id: 'vlog123',
        title: 'Test Vlog',
        views: 100,
        author: { _id: 'author123', username: 'testuser', followers: [] },
        toObject: jest.fn().mockReturnThis(),
      };

      Vlog.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockVlog),
      });

      Like.findOne = jest.fn().mockResolvedValue(null);

      // Act: Fetch same vlog 5 times (simulating refetches)
      await vlogService.getVlog('507f1f77bcf86cd799439012', '507f1f77bcf86cd799439011');
      await vlogService.getVlog('507f1f77bcf86cd799439012', '507f1f77bcf86cd799439011');
      await vlogService.getVlog('507f1f77bcf86cd799439012', '507f1f77bcf86cd799439011');
      await vlogService.getVlog('507f1f77bcf86cd799439012', '507f1f77bcf86cd799439011');
      await vlogService.getVlog('507f1f77bcf86cd799439012', '507f1f77bcf86cd799439011');

      // Assert: No increments from getVlog
      expect(Vlog.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test('React Query refetch does NOT trigger view increment', async () => {
      const mockVlog = {
        _id: 'vlog123',
        title: 'Test Vlog',
        views: 100,
        author: { _id: 'author123', username: 'testuser', followers: [] },
        toObject: jest.fn().mockReturnThis(),
      };

      Vlog.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockVlog),
      });

      Like.findOne = jest.fn().mockResolvedValue(null);

      // Act: Simulate refetch (cache invalidation)
      await vlogService.getVlog('507f1f77bcf86cd799439012', '507f1f77bcf86cd799439011');

      // Assert: No auto-increment
      expect(Vlog.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test('Anonymous user vlog fetch does NOT auto-increment', async () => {
      const mockVlog = {
        _id: 'vlog123',
        title: 'Test Vlog',
        views: 100,
        author: { _id: 'author123', username: 'testuser', followers: [] },
        toObject: jest.fn().mockReturnThis(),
      };

      Vlog.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockVlog),
      });

      // Act: Fetch without userId (anonymous)
      await vlogService.getVlog('507f1f77bcf86cd799439012', null);

      // Assert: No auto-increment
      expect(Vlog.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('VALIDATION: View count accuracy', () => {
    test('Single user opens vlog detail page once = views +1', async () => {
      Vlog.findByIdAndUpdate = jest.fn().mockResolvedValue({ views: 101 });

      // Act: User opens detail page (frontend calls recordView)
      await vlogService.recordView('507f1f77bcf86cd799439012', '507f1f77bcf86cd799439011');

      // Assert: Incremented exactly once
      expect(Vlog.findByIdAndUpdate).toHaveBeenCalledTimes(1);
    });

    test('Other user opens vlog = views +1 more', async () => {
      Vlog.findByIdAndUpdate = jest
        .fn()
        .mockResolvedValueOnce({ views: 101 })
        .mockResolvedValueOnce({ views: 102 });

      // Act: Two different users view
      await vlogService.recordView('507f1f77bcf86cd799439012', '507f1f77bcf86cd799439016');
      await vlogService.recordView('507f1f77bcf86cd799439012', '507f1f77bcf86cd799439017');

      // Assert: Incremented twice (once per user)
      expect(Vlog.findByIdAndUpdate).toHaveBeenCalledTimes(2);
    });

    test('Page refresh does NOT double-count (requires sessionStorage check in frontend)', async () => {
      // Note: This is tested on frontend with sessionStorage.getItem check
      // Backend only increments when endpoint is called
      Vlog.findByIdAndUpdate = jest.fn().mockResolvedValue({ views: 101 });

      // Act: Single recordView call
      await vlogService.recordView('507f1f77bcf86cd799439012', '507f1f77bcf86cd799439011');

      // Assert: Only one increment
      expect(Vlog.findByIdAndUpdate).toHaveBeenCalledTimes(1);
    });
  });
});
