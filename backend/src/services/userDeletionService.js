const mongoose = require('mongoose');
const User = require('../models/User');
const Vlog = require('../models/Vlog');
const Comment = require('../models/Comment');
const Like = require('../models/Like');
const { createRedisClient } = require('../config/redis');

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
 * Performs atomic cascade deletion of user and all related data:
 * - User document
 * - All Vlogs authored by user
 * - All Comments by user
 * - All Likes by user
 * - Redis session/cache keys
 * - Cloudinary assets (async via Bull queue)
 *
 * Uses MongoDB transactions to ensure atomicity (all-or-nothing)
 */

/**
 * Delete user account and cascade all related data
 *
 * @param {string} userId - User ID to delete
 * @param {object} options - Optional settings
 * @param {string} options.correlationId - Request correlation ID for logging
 * @param {string} options.ip - Client IP address for audit log
 * @returns {Promise<object>} - Deletion result with counts
 */
exports.deleteUser = async (userId, options = {}) => {
  const { correlationId, ip } = options;

  // Validate userId
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Invalid user ID');
  }

  // Start MongoDB session for transaction
  let session;
  const isTransactionEnabled = process.env.SKIP_TRANSACTIONS !== 'true';

  if (isTransactionEnabled) {
    session = await mongoose.startSession();
  } else {
    // Mock session for testing on standalone instances
    session = {
      startTransaction: () => {},
      commitTransaction: async () => {},
      abortTransaction: async () => {},
      endSession: () => {},
    };
  }

  const deletedCounts = {
    vlogs: 0,
    comments: 0,
    likes: 0,
    assets: 0,
    redisKeys: 0,
  };

  try {
    // Start transaction
    session.startTransaction();

    logger.info('Account deletion initiated', {
      userId,
      correlationId,
      ip,
    });

    // 1. Fetch user to verify existence
    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new Error('User not found');
    }

    // 2. Find all vlogs authored by user and collect Cloudinary publicIds
    const userVlogs = await Vlog.find({ author: userId }).session(session);
    const publicIds = [];

    userVlogs.forEach((vlog) => {
      if (vlog.images && Array.isArray(vlog.images)) {
        vlog.images.forEach((image) => {
          if (image.publicId) {
            publicIds.push(image.publicId);
          }
        });
      }
    });

    logger.debug('Collected Cloudinary assets for deletion', {
      userId,
      assetCount: publicIds.length,
      vlogCount: userVlogs.length,
    });

    // 3. Delete all Comments by this user
    const commentDeleteResult = await Comment.deleteMany(
      { user: userId },
      { session },
    );
    deletedCounts.comments = commentDeleteResult.deletedCount || 0;

    logger.debug('Deleted user comments', {
      userId,
      count: deletedCounts.comments,
    });

    // 4. Delete all Likes by this user
    const likeDeleteResult = await Like.deleteMany(
      { user: userId },
      { session },
    );
    deletedCounts.likes = likeDeleteResult.deletedCount || 0;

    logger.debug('Deleted user likes', {
      userId,
      count: deletedCounts.likes,
    });

    // 5. Delete all Vlogs authored by this user
    const vlogDeleteResult = await Vlog.deleteMany(
      { author: userId },
      { session },
    );
    deletedCounts.vlogs = vlogDeleteResult.deletedCount || 0;

    logger.debug('Deleted user vlogs', {
      userId,
      count: deletedCounts.vlogs,
    });

    // 6. Delete User document
    await User.findByIdAndDelete(userId, { session });

    logger.debug('Deleted user document', {
      userId,
      username: user.username,
    });

    // Commit transaction - all database operations succeeded
    await session.commitTransaction();

    logger.info('Database transaction committed successfully', {
      userId,
      deletedCounts: {
        vlogs: deletedCounts.vlogs,
        comments: deletedCounts.comments,
        likes: deletedCounts.likes,
      },
    });

    // 7. Delete Redis keys (post-transaction, non-critical)
    // These won't rollback if they fail, but that's acceptable
    try {
      const redisPatterns = [
        `user:${userId}:*`,
        `session:${userId}`,
        `socket:${userId}`,
        `cache:vlogs:author:${userId}`,
      ];

      let totalRedisDeleted = 0;
      // Sequential deletion is intentional - we want to ensure order
      // eslint-disable-next-line no-restricted-syntax
      for (const pattern of redisPatterns) {
        // eslint-disable-next-line no-await-in-loop
        const deleted = await redis.delPattern(pattern);
        totalRedisDeleted += deleted;
      }

      deletedCounts.redisKeys = totalRedisDeleted;

      logger.debug('Deleted Redis keys', {
        userId,
        count: totalRedisDeleted,
      });
    } catch (redisError) {
      // Log but don't fail - Redis cleanup is not critical
      logger.warn('Redis cleanup failed (non-critical)', {
        userId,
        error: redisError.message,
      });
    }

    // 8. Queue Cloudinary asset cleanup (async, non-blocking)
    if (publicIds.length > 0) {
      try {
        await queueAssetCleanup(userId, publicIds);
        deletedCounts.assets = publicIds.length;

        logger.info('Queued Cloudinary asset cleanup', {
          userId,
          assetCount: publicIds.length,
        });
      } catch (queueError) {
        // Log but don't fail - async cleanup can be retried manually
        logger.error('Failed to queue Cloudinary cleanup', {
          userId,
          assetCount: publicIds.length,
          error: queueError.message,
        });
      }
    }

    // Final success log
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
    // Rollback transaction on any error
    await session.abortTransaction();

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
    // Always end session
    session.endSession();
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
