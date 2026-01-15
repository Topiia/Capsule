const User = require('../models/User');
const { followUser, unfollowUser } = require('../controllers/userController');

// Mock the User model
jest.mock('../models/User');

describe('Follow/Unfollow Controller', () => {
  let req; let res; let
    next;

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

      User.findById = jest.fn()
        .mockResolvedValueOnce(mockUserToFollow)
        .mockResolvedValueOnce(mockFollower);

      await followUser(req, res, next);

      expect(mockFollower.following).toContain('user2');
      expect(mockUserToFollow.followers).toContain('user1');
      expect(mockFollower.save).toHaveBeenCalled();
      expect(mockUserToFollow.save).toHaveBeenCalled();
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

      User.findById = jest.fn()
        .mockResolvedValueOnce(mockUserToFollow)
        .mockResolvedValueOnce(mockFollower);

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

      User.findById = jest.fn()
        .mockResolvedValueOnce(mockUserToFollow)
        .mockResolvedValueOnce(mockFollower);

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

      User.findById = jest.fn()
        .mockResolvedValueOnce(mockUserToFollow)
        .mockResolvedValueOnce(mockFollower);

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

      User.findById = jest.fn()
        .mockResolvedValueOnce(mockUserToUnfollow)
        .mockResolvedValueOnce(mockFollower);

      await unfollowUser(req, res, next);

      expect(mockFollower.following).not.toContain('user2');
      expect(mockUserToUnfollow.followers).not.toContain('user1');
      expect(mockFollower.save).toHaveBeenCalled();
      expect(mockUserToUnfollow.save).toHaveBeenCalled();
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

      User.findById = jest.fn()
        .mockResolvedValueOnce(mockUserToUnfollow)
        .mockResolvedValueOnce(mockFollower);

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

      User.findById = jest.fn()
        .mockResolvedValueOnce(mockUserToUnfollow)
        .mockResolvedValueOnce(mockFollower);

      await unfollowUser(req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
      }));
      const responseData = res.json.mock.calls[0][0];
      expect(responseData.data.following).toEqual(expect.arrayContaining(['user3']));
      expect(responseData.data.following).not.toContain('user2');
    });
  });
});
