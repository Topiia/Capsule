const Vlog = require('../../src/models/Vlog');
const User = require('../../src/models/User');
const Like = require('../../src/models/Like');
const Comment = require('../../src/models/Comment');
const { getVlog } = require('../../src/controllers/vlogController');

jest.mock('../../src/models/Vlog');
jest.mock('../../src/models/User');
jest.mock('../../src/models/Like');
jest.mock('../../src/models/Comment');
jest.mock('../../src/config/redis');

describe('VlogDetail Follow Status', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = {
      params: { id: 'vlog1' },
      user: { id: 'user1', _id: 'user1' },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
    jest.clearAllMocks();

    Like.findOne = jest.fn().mockResolvedValue(null);
    Comment.find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockResolvedValue([]),
    });
  });

  it('should include isFollowedByCurrentUser when user is following author', async () => {
    const mockVlog = {
      _id: 'vlog1',
      title: 'Test Vlog',
      isPublic: true,
      author: {
        _id: 'author1',
        username: 'author',
        followerCount: 1,
        followers: ['user1'],
      },
      likes: [],
      dislikes: [],
      userViews: [],
      comments: [],
      recordUniqueView: jest.fn(),
    };
    mockVlog.toObject = jest.fn().mockReturnValue({
      ...mockVlog,
      author: { ...mockVlog.author },
    });

    Vlog.findById = jest.fn().mockReturnValue({
      populate: jest.fn().mockResolvedValue(mockVlog),
    });

    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({ bookmarks: [] }),
    });

    await getVlog(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        author: expect.objectContaining({
          isFollowedByCurrentUser: true,
        }),
      }),
    });
  });

  it('should set isFollowedByCurrentUser to false when not following', async () => {
    const mockVlog = {
      _id: 'vlog1',
      title: 'Test Vlog',
      isPublic: true,
      author: {
        _id: 'author1',
        username: 'author',
        followerCount: 0,
        followers: [],
      },
      likes: [],
      dislikes: [],
      userViews: [],
      comments: [],
      recordUniqueView: jest.fn(),
    };
    mockVlog.toObject = jest.fn().mockReturnValue({
      ...mockVlog,
      author: { ...mockVlog.author },
    });

    Vlog.findById = jest.fn().mockReturnValue({
      populate: jest.fn().mockResolvedValue(mockVlog),
    });

    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({ bookmarks: [] }),
    });

    await getVlog(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        author: expect.objectContaining({
          isFollowedByCurrentUser: false,
        }),
      }),
    });
  });

  it('should set isFollowedByCurrentUser to false for unauthenticated users', async () => {
    req.user = null;

    const mockVlog = {
      _id: 'vlog1',
      title: 'Test Vlog',
      isPublic: true,
      author: {
        _id: 'author1',
        username: 'author',
        followerCount: 1,
        followers: ['user2'],
      },
      likes: [],
      dislikes: [],
      userViews: [],
      comments: [],
      incrementViews: jest.fn(),
    };
    mockVlog.toObject = jest.fn().mockReturnValue({
      ...mockVlog,
      author: { ...mockVlog.author },
    });

    Vlog.findById = jest.fn().mockReturnValue({
      populate: jest.fn().mockResolvedValue(mockVlog),
    });

    await getVlog(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        author: expect.objectContaining({
          isFollowedByCurrentUser: false,
        }),
      }),
    });
  });

  it('should not have undefined values in author section', async () => {
    const mockVlog = {
      _id: 'vlog1',
      title: 'Test Vlog',
      isPublic: true,
      author: {
        _id: 'author1',
        username: 'author',
        followerCount: 5,
        followers: ['user1', 'user2'],
      },
      likes: [],
      dislikes: [],
      userViews: [],
      comments: [],
      recordUniqueView: jest.fn(),
    };
    mockVlog.toObject = jest.fn().mockReturnValue({
      ...mockVlog,
      author: { ...mockVlog.author },
    });

    Vlog.findById = jest.fn().mockReturnValue({
      populate: jest.fn().mockResolvedValue(mockVlog),
    });

    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({ bookmarks: [] }),
    });

    await getVlog(req, res, next);

    const responseData = res.json.mock.calls[0][0].data;

    expect(responseData.author._id).toBeDefined();
    expect(responseData.author.username).toBeDefined();
    expect(responseData.author.followerCount).toBeDefined();
    expect(responseData.author.isFollowedByCurrentUser).toBeDefined();
    expect(responseData.author.isFollowedByCurrentUser).not.toBeUndefined();
  });
});
