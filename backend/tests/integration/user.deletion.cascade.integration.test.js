/**
 * Integration Tests: User Deletion Full Cascade
 *
 * Verifies that deleteUser leaves zero orphan documents
 * and maintains referential integrity for:
 *  - followers[] / following[] on other users
 *  - bookmarks[] on other users
 *  - Comments and Likes on deleted user's vlogs
 *  - commentCount / likeCount counters on external vlogs
 */

const User = require('../../src/models/User');
const Vlog = require('../../src/models/Vlog');
const Comment = require('../../src/models/Comment');
const Like = require('../../src/models/Like');

// Mock external services before app import
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
  cloudinary: { uploader: { destroy: jest.fn().mockResolvedValue({ result: 'ok' }) } },
}));
jest.mock('../../src/queues/accountDeletionQueue', () => ({
  queueAssetCleanup: jest.fn().mockResolvedValue({}),
}));
// Suppress Redis side-effects in integration tests
jest.mock('../../src/middleware/cache', () => ({
  cacheMiddleware: jest.fn().mockReturnValue((req, res, next) => next()),
  invalidateVlog: jest.fn().mockResolvedValue(0),
  invalidateUser: jest.fn().mockResolvedValue(0),
}));
jest.mock('../../src/config/redis', () => {
  const mock = {
    isAvailable: jest.fn().mockReturnValue(false),
    getJSON: jest.fn().mockResolvedValue(null),
    setJSON: jest.fn().mockResolvedValue('OK'),
    addTags: jest.fn().mockResolvedValue(0),
    invalidateTags: jest.fn().mockResolvedValue(0),
    safeDel: jest.fn().mockResolvedValue(0),
    invalidateUserCache: jest.fn().mockResolvedValue(0),
    pipeline: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
  };
  return { createRedisClient: jest.fn().mockReturnValue(mock) };
});

const userDeletionService = require('../../src/services/userDeletionService');

// ── Helpers ────────────────────────────────────────────────────────────────

let _userSeq = 0;
const makeUser = async (overrides = {}) => {
  _userSeq += 1;
  return User.create({
    username: `testuser${_userSeq}`,
    email: `testuser${_userSeq}@cascade.com`,
    password: 'Password123!',
    isVerified: true,
    ...overrides,
  });
};

const makeVlog = async (authorId, overrides = {}) => Vlog.create({
  title: `Test Vlog ${Date.now()}`,
  description: 'A description long enough to satisfy validation requirements.',
  category: 'technology',
  author: authorId,
  status: 'APPROVED',
  isPublic: true,
  images: [{ url: 'https://example.com/img.jpg', publicId: 'test/img', order: 0 }],
  ...overrides,
});

// ── Test Suite ─────────────────────────────────────────────────────────────

describe('User Deletion — Full Cascade Integration', () => {
  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      Vlog.deleteMany({}),
      Comment.deleteMany({}),
      Like.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await Promise.all([
      User.deleteMany({}),
      Vlog.deleteMany({}),
      Comment.deleteMany({}),
      Like.deleteMany({}),
    ]);
  });

  // ── Test 1 ──────────────────────────────────────────────────────────────
  test('removes deleted user from other users followers[] arrays', async () => {
    const deleted = await makeUser();
    const watcher1 = await makeUser();
    const watcher2 = await makeUser();

    // watcher1 and watcher2 follow deleted
    await User.findByIdAndUpdate(deleted._id, {
      $addToSet: { followers: [watcher1._id, watcher2._id] },
    });
    await User.findByIdAndUpdate(watcher1._id, { $addToSet: { following: deleted._id } });
    await User.findByIdAndUpdate(watcher2._id, { $addToSet: { following: deleted._id } });

    await userDeletionService.deleteUser(deleted._id.toString());

    const w1After = await User.findById(watcher1._id).select('following');
    const w2After = await User.findById(watcher2._id).select('following');

    expect(w1After.following.map(String)).not.toContain(deleted._id.toString());
    expect(w2After.following.map(String)).not.toContain(deleted._id.toString());
  });

  // ── Test 2 ──────────────────────────────────────────────────────────────
  test('removes deleted user from other users following[] arrays', async () => {
    const deleted = await makeUser();
    const author1 = await makeUser();
    const author2 = await makeUser();

    // deleted follows author1 and author2
    await User.findByIdAndUpdate(deleted._id, {
      $addToSet: { following: [author1._id, author2._id] },
    });
    await User.findByIdAndUpdate(author1._id, { $addToSet: { followers: deleted._id } });
    await User.findByIdAndUpdate(author2._id, { $addToSet: { followers: deleted._id } });

    await userDeletionService.deleteUser(deleted._id.toString());

    const a1After = await User.findById(author1._id).select('followers');
    const a2After = await User.findById(author2._id).select('followers');

    expect(a1After.followers.map(String)).not.toContain(deleted._id.toString());
    expect(a2After.followers.map(String)).not.toContain(deleted._id.toString());
  });

  // ── Test 3 ──────────────────────────────────────────────────────────────
  test('removes deleted user vlogs from other users bookmarks[]', async () => {
    const deleted = await makeUser();
    const bookmarker = await makeUser();
    const vlog = await makeVlog(deleted._id);

    await User.findByIdAndUpdate(bookmarker._id, {
      $addToSet: { bookmarks: vlog._id },
    });

    await userDeletionService.deleteUser(deleted._id.toString());

    const bookmarkerAfter = await User.findById(bookmarker._id).select('bookmarks');
    expect(bookmarkerAfter.bookmarks.map(String)).not.toContain(vlog._id.toString());
  });

  // ── Test 4 ──────────────────────────────────────────────────────────────
  test('deletes all comments posted ON deleted user vlogs by other users', async () => {
    const deleted = await makeUser();
    const commenter = await makeUser();
    const vlog = await makeVlog(deleted._id);

    await Comment.create({ vlog: vlog._id, user: commenter._id, text: 'Nice vlog!' });
    await Comment.create({ vlog: vlog._id, user: commenter._id, text: 'Great content!' });

    await userDeletionService.deleteUser(deleted._id.toString());

    const orphans = await Comment.find({ vlog: vlog._id });
    expect(orphans).toHaveLength(0);
  });

  // ── Test 5 ──────────────────────────────────────────────────────────────
  test('deletes all likes posted ON deleted user vlogs by other users', async () => {
    const deleted = await makeUser();
    const liker = await makeUser();
    const vlog = await makeVlog(deleted._id);

    await Like.create({ vlog: vlog._id, user: liker._id, type: 'like' });

    await userDeletionService.deleteUser(deleted._id.toString());

    const orphans = await Like.find({ vlog: vlog._id });
    expect(orphans).toHaveLength(0);
  });

  // ── Test 6 ──────────────────────────────────────────────────────────────
  test('decrements commentCount on external vlogs where deleted user commented', async () => {
    const deleted = await makeUser();
    const author = await makeUser();
    const vlog = await makeVlog(author._id);

    // Set starting commentCount
    await Vlog.findByIdAndUpdate(vlog._id, { $set: { commentCount: 3 } });
    // deleted user left 2 comments on that vlog
    await Comment.create({ vlog: vlog._id, user: deleted._id, text: 'Comment 1' });
    await Comment.create({ vlog: vlog._id, user: deleted._id, text: 'Comment 2' });

    await userDeletionService.deleteUser(deleted._id.toString());

    const vlogAfter = await Vlog.findById(vlog._id).select('commentCount');
    // Should go from 3 down to 1 (3 - 2 = 1)
    expect(vlogAfter.commentCount).toBe(1);
  });

  // ── Test 7 ──────────────────────────────────────────────────────────────
  test('decrements likeCount on external vlogs where deleted user liked', async () => {
    const deleted = await makeUser();
    const author = await makeUser();
    const vlog = await makeVlog(author._id);

    await Vlog.findByIdAndUpdate(vlog._id, { $set: { likeCount: 5 } });
    await Like.create({ vlog: vlog._id, user: deleted._id, type: 'like' });

    await userDeletionService.deleteUser(deleted._id.toString());

    const vlogAfter = await Vlog.findById(vlog._id).select('likeCount');
    expect(vlogAfter.likeCount).toBe(4);
  });

  // ── Test 8 ──────────────────────────────────────────────────────────────
  test('counter floors at 0 — never goes negative', async () => {
    const deleted = await makeUser();
    const author = await makeUser();
    const vlog = await makeVlog(author._id);

    // Deliberately start counter at 0 (edge case)
    await Vlog.findByIdAndUpdate(vlog._id, { $set: { commentCount: 0, likeCount: 0 } });
    await Comment.create({ vlog: vlog._id, user: deleted._id, text: 'Edge case comment' });
    await Like.create({ vlog: vlog._id, user: deleted._id, type: 'like' });

    await userDeletionService.deleteUser(deleted._id.toString());

    const vlogAfter = await Vlog.findById(vlog._id).select('commentCount likeCount');
    expect(vlogAfter.commentCount).toBeGreaterThanOrEqual(0);
    expect(vlogAfter.likeCount).toBeGreaterThanOrEqual(0);
  });

  // ── Test 9 ──────────────────────────────────────────────────────────────
  test('leaves zero orphan documents after full deletion', async () => {
    const deleted = await makeUser();
    const other = await makeUser();
    const vlog1 = await makeVlog(deleted._id);
    const vlog2 = await makeVlog(other._id);

    // Create cross-linked state
    await Comment.create({ vlog: vlog1._id, user: other._id, text: 'Comment on deleted vlog' });
    await Comment.create({ vlog: vlog2._id, user: deleted._id, text: 'Comment by deleted user' });
    await Like.create({ vlog: vlog1._id, user: other._id, type: 'like' });
    await Like.create({ vlog: vlog2._id, user: deleted._id, type: 'like' });
    await User.findByIdAndUpdate(other._id, { $addToSet: { bookmarks: vlog1._id } });
    await User.findByIdAndUpdate(deleted._id, { $addToSet: { followers: other._id } });
    await User.findByIdAndUpdate(other._id, { $addToSet: { following: deleted._id } });

    await userDeletionService.deleteUser(deleted._id.toString());

    // No orphan comments pointing to deleted vlogs
    const orphanComments = await Comment.find({ vlog: vlog1._id });
    expect(orphanComments).toHaveLength(0);

    // No orphan likes pointing to deleted vlogs
    const orphanLikes = await Like.find({ vlog: vlog1._id });
    expect(orphanLikes).toHaveLength(0);

    // User document removed
    const deletedDoc = await User.findById(deleted._id);
    expect(deletedDoc).toBeNull();

    // Vlogs removed
    const deletedVlog = await Vlog.findById(vlog1._id);
    expect(deletedVlog).toBeNull();

    // Other user's bookmark cleaned
    const otherAfter = await User.findById(other._id).select('bookmarks following');
    expect(otherAfter.bookmarks.map(String)).not.toContain(vlog1._id.toString());
    // other's following no longer includes deleted user
    expect(otherAfter.following.map(String)).not.toContain(deleted._id.toString());
  });
});
