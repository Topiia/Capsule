const mongoose = require('mongoose');
const User = require('../../src/models/User');
const { followUser, unfollowUser } = require('../../src/controllers/userController');

// Mock the User model
jest.mock('../../src/models/User');

// Mock mongoose transactions
mongoose.startSession = jest.fn().mockResolvedValue({
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  abortTransaction: jest.fn(),
  endSession: jest.fn(),
});

describe('Follow/Unfollow Controller', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = {
      params: {},
      user: { id: 'user1' },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('followUser', () => {
    it('should follow a user successfully', async () => {
      req.params.userId = 'user2';

      const mockFollower = {
        _id: 'user1',
        following: [],
        followingCount: 0,
        save: jest.fn(),
      };

      const mockUserToFollow = {
        _id: 'user2',
        followers: [],
        followerCount: 1,
        save: jest.fn(),
      };

      User.findById = jest
        .fn()
        .mockReturnValueOnce({ session: jest.fn().mockResolvedValue(mockUserToFollow) })
        .mockReturnValueOnce({ session: jest.fn().mockResolvedValue(mockFollower) })
        .mockReturnValueOnce({
          select: jest.fn().mockResolvedValue({
            followingCount: 1,
            following: ['user2'],
          }),
        }) // updatedFollower
        .mockReturnValueOnce({
          select: jest.fn().mockResolvedValue({ followerCount: 1 }),
        }); // updatedUserToFollow

      await followUser(req, res, next);

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        'user1',
        { $addToSet: { following: 'user2' } },
        { session: expect.any(Object) },
      );
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        'user2',
        { $addToSet: { followers: 'user1' } },
        { session: expect.any(Object) },
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          isFollowing: true,
        }),
      });
    });

    it('should not allow self-follow', async () => {
      req.params.userId = 'user1';

      await followUser(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Cannot follow yourself',
          statusCode: 400,
        }),
      );
    });

    it('should not allow double follow', async () => {
      req.params.userId = 'user2';

      const mockFollower = {
        _id: 'user1',
        following: ['user2'],
        save: jest.fn(),
      };

      const mockUserToFollow = {
        _id: 'user2',
        followers: ['user1'],
        save: jest.fn(),
      };

      User.findById = jest
        .fn()
        .mockReturnValueOnce({ session: jest.fn().mockResolvedValue(mockUserToFollow) })
        .mockReturnValueOnce({ session: jest.fn().mockResolvedValue(mockFollower) });

      await followUser(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Already following this user',
          statusCode: 400,
        }),
      );
    });

    it('should return correct follower & following counts', async () => {
      req.params.userId = 'user2';

      const mockFollower = {
        _id: 'user1',
        following: [],
        followingCount: 1,
        save: jest.fn(),
      };

      const mockUserToFollow = {
        _id: 'user2',
        followers: [],
        followerCount: 1,
        save: jest.fn(),
      };

      User.findById = jest
        .fn()
        .mockReturnValueOnce({ session: jest.fn().mockResolvedValue(mockUserToFollow) })
        .mockReturnValueOnce({ session: jest.fn().mockResolvedValue(mockFollower) })
        .mockReturnValueOnce({ select: jest.fn().mockResolvedValue({ followingCount: 1, following: ['user2'] }) })
        .mockReturnValueOnce({ select: jest.fn().mockResolvedValue({ followerCount: 1 }) });

      await followUser(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          isFollowing: true,
          followerCount: 1,
          followingCount: 1,
          following: expect.arrayContaining(['user2']),
        },
      });
    });

    it('should include following array in response', async () => {
      req.params.userId = 'user2';

      const mockFollower = {
        _id: 'user1',
        following: ['user3'],
        followingCount: 2,
        save: jest.fn(),
      };

      const mockUserToFollow = {
        _id: 'user2',
        followers: [],
        followerCount: 1,
        save: jest.fn(),
      };

      User.findById = jest
        .fn()
        .mockReturnValueOnce({ session: jest.fn().mockResolvedValue(mockUserToFollow) })
        .mockReturnValueOnce({ session: jest.fn().mockResolvedValue(mockFollower) })
        .mockReturnValueOnce({ select: jest.fn().mockResolvedValue({ followingCount: 3, following: ['user2', 'user3'] }) })
        .mockReturnValueOnce({ select: jest.fn().mockResolvedValue({ followerCount: 1 }) });

      await followUser(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          following: expect.arrayContaining(['user2', 'user3']),
        }),
      });
    });
  });

  describe('unfollowUser', () => {
    it('should unfollow a user successfully', async () => {
      req.params.userId = 'user2';

      const mockFollower = {
        _id: 'user1',
        following: ['user2'],
        followingCount: 0,
        save: jest.fn(),
      };

      const mockUserToUnfollow = {
        _id: 'user2',
        followers: ['user1'],
        followerCount: 0,
        save: jest.fn(),
      };

      User.findById = jest
        .fn()
        .mockReturnValueOnce({ session: jest.fn().mockResolvedValue(mockUserToUnfollow) })
        .mockReturnValueOnce({ session: jest.fn().mockResolvedValue(mockFollower) })
        .mockReturnValueOnce({
          select: jest.fn().mockResolvedValue({ followingCount: 0, following: [] }),
        })
        .mockReturnValueOnce({
          select: jest.fn().mockResolvedValue({ followerCount: 0 }),
        });

      await unfollowUser(req, res, next);

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        'user1',
        { $pull: { following: 'user2' } },
        { session: expect.any(Object) },
      );
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        'user2',
        { $pull: { followers: 'user1' } },
        { session: expect.any(Object) },
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          isFollowing: false,
        }),
      });
    });

    it('should return correct counts after unfollow', async () => {
      req.params.userId = 'user2';

      const mockFollower = {
        _id: 'user1',
        following: ['user2'],
        followingCount: 0,
        save: jest.fn(),
      };

      const mockUserToUnfollow = {
        _id: 'user2',
        followers: ['user1'],
        followerCount: 0,
        save: jest.fn(),
      };

      User.findById = jest
        .fn()
        .mockReturnValueOnce({ session: jest.fn().mockResolvedValue(mockUserToUnfollow) })
        .mockReturnValueOnce({ session: jest.fn().mockResolvedValue(mockFollower) })
        .mockReturnValueOnce({
          select: jest.fn().mockResolvedValue({ followingCount: 0, following: [] }),
        })
        .mockReturnValueOnce({
          select: jest.fn().mockResolvedValue({ followerCount: 0 }),
        });

      await unfollowUser(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          isFollowing: false,
          followerCount: 0,
          followingCount: 0,
          following: expect.not.arrayContaining(['user2']),
        },
      });
    });

    it('should remove userId from following array', async () => {
      req.params.userId = 'user2';

      const mockFollower = {
        _id: 'user1',
        following: ['user2', 'user3'],
        followingCount: 1,
        save: jest.fn(),
      };

      const mockUserToUnfollow = {
        _id: 'user2',
        followers: ['user1'],
        followerCount: 0,
        save: jest.fn(),
      };

      User.findById = jest
        .fn()
        .mockReturnValueOnce({ session: jest.fn().mockResolvedValue(mockUserToUnfollow) })
        .mockReturnValueOnce({ session: jest.fn().mockResolvedValue(mockFollower) })
        .mockReturnValueOnce({ select: jest.fn().mockResolvedValue({ followingCount: 1, following: ['user3'] }) })
        .mockReturnValueOnce({ select: jest.fn().mockResolvedValue({ followerCount: 0 }) });

      await unfollowUser(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        }),
      );
      const responseData = res.json.mock.calls[0][0];
      expect(responseData.data.following).toEqual(
        expect.arrayContaining(['user3']),
      );
      expect(responseData.data.following).not.toContain('user2');
    });
  });
});
