const mongoose = require('mongoose');
const Vlog = require('../models/Vlog');
const Like = require('../models/Like');
const Comment = require('../models/Comment');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');
const redis = require('../config/redis');
const logger = require('../config/logger');

class VlogService {
  /**
   * Get single vlog with populated data and user interaction state
   * Note: Does NOT auto-increment views - use explicit recordView endpoint
   */
  /* eslint-disable class-methods-use-this */
  async getVlog(vlogId, userId) {
    const vlog = await Vlog.findById(vlogId).populate(
      'author',
      'username avatar bio followerCount followers',
    );

    if (!vlog) {
      throw new ErrorResponse('Vlog not found', 404);
    }

    let isLiked = false;
    let isDisliked = false;
    let isBookmarked = false;
    let isFollowedByCurrentUser = false;

    if (userId) {
      // Check interactions in parallel
      const [like, dislike, user] = await Promise.all([
        Like.findOne({ vlog: vlogId, user: userId, type: 'like' }),
        Like.findOne({ vlog: vlogId, user: userId, type: 'dislike' }),
        User.findById(userId).select('bookmarks'),
      ]);

      isLiked = !!like;
      isDisliked = !!dislike;
      isBookmarked = user ? user.bookmarks.includes(vlogId) : false;

      if (vlog.author) {
        isFollowedByCurrentUser = vlog.author.followers.includes(userId);
      }

      // DO NOT auto-increment views here - let explicit recordView endpoint handle it
      // This prevents double-counting from: list fetches, refetches, cache warming
    }

    // Convert to object and attach explicit states
    const vlogData = vlog.toObject();
    vlogData.isLiked = isLiked;
    vlogData.isDisliked = isDisliked;
    vlogData.isBookmarked = isBookmarked;
    vlogData.author.isFollowedByCurrentUser = isFollowedByCurrentUser;

    // Fetch latest 10 comments (pagination should be separate endpoint for full list)
    const comments = await Comment.find({ vlog: vlogId })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('user', 'username avatar');

    vlogData.comments = comments;

    return vlogData;
  }

  /**
   * Toggle Like status
   */
  /* eslint-disable class-methods-use-this */
  async toggleLike(vlogId, userId) {
    const vlog = await Vlog.findById(vlogId);
    if (!vlog) {
      throw new ErrorResponse('Vlog not found', 404);
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const existingLike = await Like.findOne({
        vlog: vlogId,
        user: userId,
        type: 'like',
      }).session(session);
      const existingDislike = await Like.findOne({
        vlog: vlogId,
        user: userId,
        type: 'dislike',
      }).session(session);

      let isLiked = false;
      const isDisliked = false;
      const vlogUpdate = { $inc: {} };

      if (existingLike) {
        // User already liked -> Untoggle (Remove Like)
        await Like.deleteOne({ _id: existingLike._id }).session(session);
        vlogUpdate.$inc.likeCount = -1;
        isLiked = false;
        // isDisliked remains false (neutral state)
      } else {
        // User hasn't liked -> Add Like
        // If they disliked, remove that first (Switch)
        if (existingDislike) {
          await Like.deleteOne({ _id: existingDislike._id }).session(session);
          vlogUpdate.$inc.dislikeCount = -1;
        }

        await Like.create([{ vlog: vlogId, user: userId, type: 'like' }], {
          session,
        });
        vlogUpdate.$inc.likeCount = 1;
        isLiked = true;
        // isDisliked is false because we switched or were neutral
      }

      // Execute single atomic update for Vlog counters
      if (Object.keys(vlogUpdate.$inc).length > 0) {
        await Vlog.findByIdAndUpdate(vlogId, vlogUpdate, {
          new: true,
          session,
        });
      }

      await session.commitTransaction();

      // Fetch fresh state to return accurate numbers
      const updatedVlog = await Vlog.findById(vlogId, 'likeCount dislikeCount');
      return {
        likeCount: updatedVlog.likeCount,
        dislikeCount: updatedVlog.dislikeCount,
        isLiked,
        isDisliked,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Toggle Dislike status
   */
  async toggleDislike(vlogId, userId) {
    const vlog = await Vlog.findById(vlogId);
    if (!vlog) {
      throw new ErrorResponse('Vlog not found', 404);
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const existingLike = await Like.findOne({
        vlog: vlogId,
        user: userId,
        type: 'like',
      }).session(session);
      const existingDislike = await Like.findOne({
        vlog: vlogId,
        user: userId,
        type: 'dislike',
      }).session(session);

      const isLiked = false;
      let isDisliked = false;
      const vlogUpdate = { $inc: {} };

      if (existingDislike) {
        // User already disliked -> Untoggle (Remove Dislike)
        await Like.deleteOne({ _id: existingDislike._id }).session(session);
        vlogUpdate.$inc.dislikeCount = -1;
        isDisliked = false;
        // isLiked remains false (neutral state)
      } else {
        // User hasn't disliked -> Add Dislike
        // If they liked, remove that first (Switch)
        if (existingLike) {
          await Like.deleteOne({ _id: existingLike._id }).session(session);
          vlogUpdate.$inc.likeCount = -1;
        }

        await Like.create([{ vlog: vlogId, user: userId, type: 'dislike' }], {
          session,
        });
        vlogUpdate.$inc.dislikeCount = 1;
        isDisliked = true;
        // isLiked is false because we switched or were neutral
      }

      // Execute single atomic update for Vlog counters
      if (Object.keys(vlogUpdate.$inc).length > 0) {
        await Vlog.findByIdAndUpdate(vlogId, vlogUpdate, {
          new: true,
          session,
        });
      }

      await session.commitTransaction();

      // Fetch fresh state to return accurate numbers
      const updatedVlog = await Vlog.findById(vlogId, 'likeCount dislikeCount');
      return {
        likeCount: updatedVlog.likeCount,
        dislikeCount: updatedVlog.dislikeCount,
        isLiked,
        isDisliked,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async addComment(vlogId, userId, text) {
    if (!text || !text.trim()) {
      throw new ErrorResponse('Comment cannot be empty', 400);
    }

    if (text.length > 500) {
      throw new ErrorResponse('Comment cannot exceed 500 characters', 400);
    }

    const comment = await Comment.create({
      vlog: vlogId,
      user: userId,
      text: text.trim(),
    });

    // Increment count (atomic)
    await Vlog.findByIdAndUpdate(vlogId, { $inc: { commentCount: 1 } });

    const populatedComment = await comment.populate('user', 'username avatar');
    // Normalize response contract
    const commentObj = populatedComment.toObject();
    return {
      ...commentObj,
      content: commentObj.text, // contract requires 'content'
    };
  }

  async deleteComment(vlogId, commentId, userId, isAdmin = false) {
    const comment = await Comment.findById(commentId);
    if (!comment) throw new ErrorResponse('Comment not found', 404);

    const vlog = await Vlog.findById(vlogId);

    // Auth check
    if (
      comment.user.toString() !== userId
      && vlog.author.toString() !== userId
      && !isAdmin
    ) {
      throw new ErrorResponse('Not authorized', 403);
    }

    await Comment.deleteOne({ _id: commentId });
    // FIXED Bug #8: Prevent negative commentCount
    await Vlog.findByIdAndUpdate(vlogId, {
      $inc: { commentCount: -1 },
      $max: { commentCount: 0 },
    });
  }

  async recordView(vlogId, viewerId) {
    // 24 hours default
    const VIEW_TTL_SECONDS = parseInt(process.env.VIEW_TTL_SECONDS, 10) || 86400;

    // Generate unique Redis key: view:{vlogId}:{viewerId}
    const redisKey = `view:${vlogId}:${viewerId}`;

    try {
      // Atomic SET NX EX: Set key ONLY if not exists, with TTL
      // Returns "OK" if set successfully (new view), null if key exists (duplicate)
      const wasSet = await redis.set(
        redisKey,
        '1',
        'NX',
        'EX',
        VIEW_TTL_SECONDS,
      );

      if (wasSet === 'OK') {
        // New view within TTL window - increment database
        const vlog = await Vlog.findByIdAndUpdate(
          vlogId,
          { $inc: { views: 1 } },
          { new: true },
        );
        return { incremented: true, views: vlog.views };
      }

      // Duplicate view within TTL window - do NOT increment
      const vlog = await Vlog.findById(vlogId, 'views');
      return { incremented: false, views: vlog.views };
    } catch (redisError) {
      // FALLBACK: If Redis unavailable, increment anyway (degraded mode)
      // Better to over-count than block users
      logger.warn(
        'Redis unavailable for view deduplication - allowing increment',
        {
          vlogId,
          viewerId,
          error: redisError.message,
        },
      );

      const vlog = await Vlog.findByIdAndUpdate(
        vlogId,
        { $inc: { views: 1 } },
        { new: true },
      );
      return { incremented: true, views: vlog.views, degraded: true };
    }
  }

  async incrementViews(vlogId) {
    return Vlog.findByIdAndUpdate(vlogId, { $inc: { views: 1 } });
  }
}
/* eslint-enable class-methods-use-this */
// Singleton export because why not
module.exports = new VlogService();
