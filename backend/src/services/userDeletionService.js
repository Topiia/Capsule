const mongoose = require('mongoose');
const User = require('../models/User');
const Vlog = require('../models/Vlog');
const Comment = require('../models/Comment');
const Like = require('../models/Like');
const { createRedisClient } = require('../config/redis');
const { invalidateUser } = require('../middleware/cache');

const redis = new Proxy({}, {
  get: (target, prop) => {
    const client = createRedisClient();
    return typeof client[prop] === 'function' ? client[prop].bind(client) : client[prop];
  },
});
const logger = require('../config/logger');
const { queueAssetCleanup } = require('../queues/accountDeletionQueue');

/**
 * SECURITY: User Account Deletion Service
 *
 * Performs atomic cascade deletion of user and all related data.
 *
 * TRANSACTION ORDER (dependency hierarchy):
 *  1. Fetch user + vlog list
 *  2. Fetch external interaction counts (for counter adjustment)
 *  3. Delete Comments ON user's vlogs (orphan prevention)
 *  4. Delete Likes ON user's vlogs (orphan prevention)
 *  5. Decrement commentCount on affected external vlogs
 *  6. Delete Comments BY user on external vlogs
 *  7. Decrement likeCount/dislikeCount on affected external vlogs
 *  8. Delete Likes BY user on external vlogs
 *  9. Remove userId from other users' followers[]
 * 10. Remove userId from other users' following[]
 * 11. Remove deleted vlogs from other users' bookmarks[]
 * 12. Delete user's vlogs
 * 13. Delete user document
 * COMMIT
 * POST-COMMIT: Redis invalidation
 * POST-COMMIT: Cloudinary cleanup queue
 */
exports.deleteUser = async (userId, options = {}) => {
  const { correlationId, ip } = options;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Invalid user ID');
  }

  const isTransactionEnabled = process.env.SKIP_TRANSACTIONS !== 'true';
  let session = null;

  if (isTransactionEnabled) {
    session = await mongoose.startSession();
    session.startTransaction();
  }

  const deletedCounts = {
    vlogs: 0,
    comments: 0,
    likes: 0,
    assets: 0,
    redisKeys: 0,
  };

  let user = null;
  let userVlogs = [];
  let publicIds = [];

  try {
    const sessionOpt = session ? { session } : {};

    logger.info('Account deletion initiated', { userId, correlationId, ip });

    // ── STEP 1: Verify user exists ─────────────────────────────────────────
    user = await User.findById(userId).session(session);
    if (!user) throw new Error('User not found');

    // ── STEP 2: Collect user's vlog IDs + Cloudinary publicIds ─────────────
    userVlogs = await Vlog.find({ author: userId }, '_id images').session(session);
    const userVlogIds = userVlogs.map((v) => v._id);
    publicIds = userVlogs.flatMap(
      (v) => (v.images || []).map((img) => img.publicId).filter(Boolean),
    );

    logger.debug('Collected user vlogs for cascade', {
      userId,
      vlogCount: userVlogIds.length,
      assetCount: publicIds.length,
    });

    // ── STEP 3: Find interactions BY user on OTHER users' vlogs ───────────
    // These are collected BEFORE delete so we can adjust counters.
    const externalCommentFilter = userVlogIds.length > 0
      ? { user: userId, vlog: { $nin: userVlogIds } }
      : { user: userId };

    const externalLikeFilter = userVlogIds.length > 0
      ? { user: userId, vlog: { $nin: userVlogIds } }
      : { user: userId };

    const [externalComments, externalLikes] = [
      await Comment.find(externalCommentFilter, 'vlog').session(session),
      await Like.find(externalLikeFilter, 'vlog type').session(session),
    ];

    // ── STEP 4: Delete Comments ON user's vlogs (by any user) ─────────────
    // These records are orphaned once the vlogs are deleted.
    if (userVlogIds.length > 0) {
      await Comment.deleteMany({ vlog: { $in: userVlogIds } }, sessionOpt);
    }

    // ── STEP 5: Delete Likes ON user's vlogs (by any user) ────────────────
    if (userVlogIds.length > 0) {
      await Like.deleteMany({ vlog: { $in: userVlogIds } }, sessionOpt);
    }

    // ── STEP 6: Decrement commentCount on external vlogs atomically ────────
    // Counter strategy: build a per-vlogId delta map, apply via bulkWrite
    // (single command, not parallel writes), then floor-correct any negatives.
    if (externalComments.length > 0) {
      const commentDeltaMap = {};
      externalComments.forEach((c) => {
        const id = c.vlog.toString();
        commentDeltaMap[id] = (commentDeltaMap[id] || 0) + 1;
      });

      const commentBulkOps = Object.entries(commentDeltaMap).map(([vlogId, count]) => ({
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(vlogId) },
          update: { $inc: { commentCount: -count } },
        },
      }));
      await Vlog.bulkWrite(commentBulkOps, sessionOpt);

      // Floor protection: any counter that went negative is reset to 0
      await Vlog.updateMany(
        { commentCount: { $lt: 0 } },
        { $set: { commentCount: 0 } },
        sessionOpt,
      );
    }

    // ── STEP 7: Delete Comments BY user (catches self-comments + external) ──
    const commentResult = await Comment.deleteMany({ user: userId }, sessionOpt);
    deletedCounts.comments = commentResult.deletedCount || 0;

    // ── STEP 8: Decrement likeCount/dislikeCount on external vlogs ─────────
    if (externalLikes.length > 0) {
      const likeDeltaMap = {};
      externalLikes.forEach((l) => {
        const id = l.vlog.toString();
        if (!likeDeltaMap[id]) likeDeltaMap[id] = { like: 0, dislike: 0 };
        if (l.type === 'like') likeDeltaMap[id].like += 1;
        else likeDeltaMap[id].dislike += 1;
      });

      const likeBulkOps = Object.entries(likeDeltaMap).map(([vlogId, counts]) => ({
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(vlogId) },
          update: {
            $inc: {
              ...(counts.like > 0 && { likeCount: -counts.like }),
              ...(counts.dislike > 0 && { dislikeCount: -counts.dislike }),
            },
          },
        },
      }));
      await Vlog.bulkWrite(likeBulkOps, sessionOpt);

      // Floor protection for like/dislike counters
      await Vlog.updateMany({ likeCount: { $lt: 0 } }, { $set: { likeCount: 0 } }, sessionOpt);
      await Vlog.updateMany(
        { dislikeCount: { $lt: 0 } },
        { $set: { dislikeCount: 0 } },
        sessionOpt,
      );
    }

    // ── STEP 9: Delete Likes BY user ───────────────────────────────────────
    const likeResult = await Like.deleteMany({ user: userId }, sessionOpt);
    deletedCounts.likes = likeResult.deletedCount || 0;

    // ── STEP 10: Remove userId from other users' followers[] ───────────────
    // Without this, all users who followed the deleted account accumulate
    // a stale ObjectId in their followers array permanently.
    await User.updateMany(
      { followers: userId },
      { $pull: { followers: userId } },
      sessionOpt,
    );

    // ── STEP 11: Remove userId from other users' following[] ───────────────
    await User.updateMany(
      { following: userId },
      { $pull: { following: userId } },
      sessionOpt,
    );

    // ── STEP 12: Remove deleted vlogs from other users' bookmarks[] ─────────
    if (userVlogIds.length > 0) {
      await User.updateMany(
        { bookmarks: { $in: userVlogIds } },
        { $pull: { bookmarks: { $in: userVlogIds } } },
        sessionOpt,
      );
    }

    // ── STEP 13: Delete user's vlogs ───────────────────────────────────────
    const vlogResult = await Vlog.deleteMany({ author: userId }, sessionOpt);
    deletedCounts.vlogs = vlogResult.deletedCount || 0;

    // ── STEP 14: Delete user document ──────────────────────────────────────
    await User.findByIdAndDelete(userId, sessionOpt);

    // ── COMMIT ──────────────────────────────────────────────────────────────
    if (session) {
      await session.commitTransaction();
    }

    logger.info('Database transaction committed successfully', {
      userId,
      deletedCounts: {
        vlogs: deletedCounts.vlogs,
        comments: deletedCounts.comments,
        likes: deletedCounts.likes,
      },
    });

    // ── POST-COMMIT: Redis invalidation (never inside transaction) ──────────
    try {
      let totalRedisDeleted = 0;

      // Invalidate explicit session keys
      totalRedisDeleted += await redis.safeDel(`session:${userId}`, `socket:${userId}`);

      // Invalidate tag:user:{userId} — clears all cached vlog responses with this author
      const userTagsDeleted = await invalidateUser(userId);
      totalRedisDeleted += userTagsDeleted;

      // Invalidate tag:vlog:{id} for each of the user's vlogs
      if (userVlogIds.length > 0) {
        const authorVlogTags = userVlogIds.map((v) => `tag:vlog:${v}`);
        totalRedisDeleted += await redis.invalidateTags(authorVlogTags);
      }

      deletedCounts.redisKeys = totalRedisDeleted;
      logger.debug('Redis keys invalidated post-commit', { userId, count: totalRedisDeleted });
    } catch (redisError) {
      // Non-critical: cache entries expire naturally via TTL
      logger.warn('Redis cleanup failed (non-critical)', {
        userId,
        error: redisError.message,
      });
    }

    // ── POST-COMMIT: Queue Cloudinary cleanup (async, non-blocking) ─────────
    if (publicIds.length > 0) {
      try {
        await queueAssetCleanup(userId, publicIds);
        deletedCounts.assets = publicIds.length;
        logger.info('Queued Cloudinary asset cleanup', { userId, assetCount: publicIds.length });
      } catch (queueError) {
        logger.error('Failed to queue Cloudinary cleanup', {
          userId,
          assetCount: publicIds.length,
          error: queueError.message,
        });
      }
    }

    logger.info('Account deletion completed successfully', {
      userId,
      username: user.username,
      email: user.email,
      correlationId,
      ip,
      deletedCounts,
    });

    return {
      success: true,
      deletedCounts,
      username: user.username,
    };
  } catch (error) {
    if (session) {
      await session.abortTransaction();
    }

    logger.error('Account deletion failed - transaction rolled back', {
      userId,
      correlationId,
      error: {
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
    });

    throw error;
  } finally {
    if (session) {
      session.endSession();
    }
  }
};

/**
 * Get deletion preview (what will be deleted)
 * Useful for showing user what they're about to delete
 *
 * @param {string} userId - User ID
 * @returns {Promise<object>} - Preview counts
 */
exports.getDeletionPreview = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Invalid user ID');
  }

  const [vlogCount, commentCount, likeCount, user] = await Promise.all([
    Vlog.countDocuments({ author: userId }),
    Comment.countDocuments({ user: userId }),
    Like.countDocuments({ user: userId }),
    User.findById(userId).select('username email createdAt'),
  ]);

  if (!user) {
    throw new Error('User not found');
  }

  // Count total images across all vlogs
  const vlogs = await Vlog.find({ author: userId }).select('images');
  let imageCount = 0;
  vlogs.forEach((vlog) => {
    if (vlog.images) {
      imageCount += vlog.images.length;
    }
  });

  return {
    user: {
      username: user.username,
      email: user.email,
      memberSince: user.createdAt,
    },
    willDelete: {
      vlogs: vlogCount,
      comments: commentCount,
      likes: likeCount,
      images: imageCount,
    },
  };
};
