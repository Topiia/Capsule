const mongoose = require('mongoose');
const Vlog = require('../models/Vlog');
const Like = require('../models/Like');
const Comment = require('../models/Comment');
const ErrorResponse = require('../utils/errorResponse');

class VlogService {
  /**
     * Get single vlog with populated data and user interaction state
     */
  async getVlog(vlogId, userId) {
    const vlog = await Vlog.findById(vlogId).populate('author', 'username avatar bio followerCount followers');

    if (!vlog) {
      throw new ErrorResponse('Vlog not found', 404);
    }

    let isLiked = false;
    let isDisliked = false;
    let isFollowedByCurrentUser = false;

    if (userId) {
      // Check interactions in parallel
      const [like, dislike] = await Promise.all([
        Like.findOne({ vlog: vlogId, user: userId, type: 'like' }),
        Like.findOne({ vlog: vlogId, user: userId, type: 'dislike' }),
      ]);

      isLiked = !!like;
      isDisliked = !!dislike;

      if (vlog.author) {
        isFollowedByCurrentUser = vlog.author.followers.includes(userId);
      }

      // Record view asynchronously (fire and forget pattern)
      this.recordView(vlogId, userId).catch(console.error);
    } else {
      // Increment anon view
      this.incrementViews(vlogId).catch(console.error);
    }

    // Convert to object and attach explicit states
    const vlogData = vlog.toObject();
    vlogData.isLiked = isLiked;
    vlogData.isDisliked = isDisliked;
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
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const existingLike = await Like.findOne({ vlog: vlogId, user: userId, type: 'like' }).session(session);
      const existingDislike = await Like.findOne({ vlog: vlogId, user: userId, type: 'dislike' }).session(session);

      let isLiked = false;
      const isDisliked = false;

      if (existingLike) {
        // Unlike
        await Like.deleteOne({ _id: existingLike._id }).session(session);
        await Vlog.findByIdAndUpdate(vlogId, { $inc: { likeCount: -1 } }).session(session);
      } else {
        // Like
        await Like.create([{ vlog: vlogId, user: userId, type: 'like' }], { session });
        await Vlog.findByIdAndUpdate(vlogId, { $inc: { likeCount: 1 } }).session(session);
        isLiked = true;

        // Remove dislike if exists
        if (existingDislike) {
          await Like.deleteOne({ _id: existingDislike._id }).session(session);
          await Vlog.findByIdAndUpdate(vlogId, { $inc: { dislikeCount: -1 } }).session(session);
        }
      }

      await session.commitTransaction();

      // Return new state
      const vlog = await Vlog.findById(vlogId, 'likeCount dislikeCount');
      return {
        likeCount: vlog.likeCount,
        dislikeCount: vlog.dislikeCount,
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
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const existingDislike = await Like.findOne({ vlog: vlogId, user: userId, type: 'dislike' }).session(session);
      const existingLike = await Like.findOne({ vlog: vlogId, user: userId, type: 'like' }).session(session);

      let isLiked = (!!existingLike); // State before change
      let isDisliked = false;

      if (existingDislike) {
        // Remove Dislike
        await Like.deleteOne({ _id: existingDislike._id }).session(session);
        await Vlog.findByIdAndUpdate(vlogId, { $inc: { dislikeCount: -1 } }).session(session);
      } else {
        // Dislike
        await Like.create([{ vlog: vlogId, user: userId, type: 'dislike' }], { session });
        await Vlog.findByIdAndUpdate(vlogId, { $inc: { dislikeCount: 1 } }).session(session);
        isDisliked = true;

        // Remove like if exists
        if (existingLike) {
          await Like.deleteOne({ _id: existingLike._id }).session(session);
          await Vlog.findByIdAndUpdate(vlogId, { $inc: { likeCount: -1 } }).session(session);
          isLiked = false;
        }
      }

      await session.commitTransaction();

      const vlog = await Vlog.findById(vlogId, 'likeCount dislikeCount');
      return {
        likeCount: vlog.likeCount,
        dislikeCount: vlog.dislikeCount,
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
    const comment = await Comment.create({
      vlog: vlogId,
      user: userId,
      text,
    });

    // Increment count (atomic)
    await Vlog.findByIdAndUpdate(vlogId, { $inc: { commentCount: 1 } });

    return comment.populate('user', 'username avatar');
  }

  async deleteComment(vlogId, commentId, userId, isAdmin = false) {
    const comment = await Comment.findById(commentId);
    if (!comment) throw new ErrorResponse('Comment not found', 404);

    const vlog = await Vlog.findById(vlogId);

    // Auth check
    if (comment.user.toString() !== userId && vlog.author.toString() !== userId && !isAdmin) {
      throw new ErrorResponse('Not authorized', 403);
    }

    await Comment.deleteOne({ _id: commentId });
    await Vlog.findByIdAndUpdate(vlogId, { $inc: { commentCount: -1 } });
  }

  async recordView(vlogId, _userId) {
    // Only record unique views would differ, logic typically requires Redis or separate View table
    // For now, assuming direct update to Vlog (but we removed unique array for scale)
    // We should just increment views. To track uniqueness properly at scale,
    // we need a separate View collection or Redis HyperLogLog.
    // Falling back to simple increment for this phase.
    return Vlog.findByIdAndUpdate(vlogId, { $inc: { views: 1 } });
  }

  async incrementViews(vlogId) {
    return Vlog.findByIdAndUpdate(vlogId, { $inc: { views: 1 } });
  }
}
/* eslint-enable class-methods-use-this */
// Singleton export because why not
module.exports = new VlogService();
