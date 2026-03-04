const crypto = require('crypto');
const mongoose = require('mongoose');
const Vlog = require('../models/Vlog');
const User = require('../models/User');
const Like = require('../models/Like');
const Comment = require('../models/Comment');
const { deleteImage } = require('../middleware/upload');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const { generateTags } = require('../services/aiService');
const VlogService = require('../services/vlogService');
const { invalidateVlog } = require('../middleware/cache');
const logger = require('../config/logger');
const { createModerationQueue } = require('../queues/moderationQueue');

/* ----------------------------------------------------------
   GET ALL VLOGS (Public)
---------------------------------------------------------- */
exports.getVlogs = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const startIndex = (page - 1) * limit;

  const query = { isPublic: true, status: 'APPROVED' };

  if (req.query.category) query.category = req.query.category;
  if (req.query.tag) query.tags = { $in: [req.query.tag] };
  if (req.query.author) query.author = req.query.author;

  if (req.query.search && req.query.search.trim()) {
    const rawSearch = req.query.search.trim();

    // Escape regex special characters to prevent injection
    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Split multi-word input — each term must match at least one field
    const terms = rawSearch.split(/\s+/).filter(Boolean);

    // Build per-term conditions including author username lookup
    const termConditions = await Promise.all(
      terms.map(async (term) => {
        const pattern = escapeRegex(term);
        const regex = { $regex: pattern, $options: 'i' };

        // Find users whose username matches this term
        const matchingUsers = await User.find({ username: regex })
          .select('_id')
          .lean();
        const authorIds = matchingUsers.map((u) => u._id);

        const orConditions = [
          { title: regex },
          { description: regex },
          { tags: regex },
        ];

        // Include author match only when users were found
        if (authorIds.length > 0) {
          orConditions.push({ author: { $in: authorIds } });
        }

        return { $or: orConditions };
      }),
    );

    query.$and = termConditions;
  }

  if (req.query.dateFrom || req.query.dateTo) {
    query.createdAt = {};
    if (req.query.dateFrom) query.createdAt.$gte = new Date(req.query.dateFrom);
    if (req.query.dateTo) query.createdAt.$lte = new Date(req.query.dateTo);
  }

  let sortBy = '-createdAt';
  switch (req.query.sort) {
    case 'popular':
      sortBy = '-views';
      break;
    case 'liked':
      sortBy = '-likeCount';
      break; // Updated to use new field
    case 'oldest':
      sortBy = 'createdAt';
      break;
    case 'alphabetical':
      sortBy = 'title';
      break;
    default:
      sortBy = '-createdAt';
  }

  const vlogs = await Vlog.find(query)
    .populate('author', 'username avatar bio followerCount')
    .sort(sortBy)
    .skip(startIndex)
    .limit(limit)
    .lean();

  const total = await Vlog.countDocuments(query);
  const totalPages = Math.ceil(total / limit);

  // Note: For lists, we might not populate isLiked for every item to save performance
  // unless explicitly requested or via separate batch endpoint.
  // Keeping it lightweight for now.

  res.status(200).json({
    success: true,
    count: vlogs.length,
    total,
    totalPages,
    currentPage: page,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
    data: vlogs,
  });
});

/* ----------------------------------------------------------
   GET SINGLE VLOG
---------------------------------------------------------- */
exports.getVlog = asyncHandler(async (req, res, next) => {
  // Validate ObjectId format early — prevents Mongoose CastError 500
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse('Vlog not found', 404));
  }

  const userId = req.user ? req.user.id : null;
  const vlogData = await VlogService.getVlog(req.params.id, userId);

  // Authorization check for private vlogs
  const isAdmin = req.user && req.user.role === 'admin';
  const isAuthor = userId && vlogData.author._id.toString() === userId;

  if (!vlogData.isPublic && !isAuthor && !isAdmin) {
    return next(new ErrorResponse('Not authorized to view this vlog', 403));
  }

  res.status(200).json({ success: true, data: vlogData });
});

/* ----------------------------------------------------------
   CREATE VLOG
---------------------------------------------------------- */
exports.createVlog = asyncHandler(async (req, res) => {
  req.body.author = req.user.id;

  if (req.files?.length > 0) {
    req.body.images = req.files.map((file, i) => ({
      url: file.path,
      publicId: file.filename || file.public_id,
      caption: req.body.captions?.[i] || '',
      order: i,
    }));
  }

  // TODO: Move AI Tagging to background job (Phase 4)
  if (
    process.env.AI_TAGGING_ENABLED === 'true'
    && req.body.description
    && req.body.description.length >= Number(process.env.MIN_DESCRIPTION_LENGTH)
  ) {
    try {
      const tags = await generateTags(req.body.description);
      req.body.tags = [...(req.body.tags || []), ...tags];
      req.body.aiGeneratedTags = true;
    } catch {
      req.body.aiGeneratedTags = false;
    }
  }

  // Set initial status
  req.body.status = 'PENDING';
  // ENFORCEMENT: Force private until AI moderation approves
  req.body.isPublic = false;

  const vlog = await Vlog.create(req.body);

  await vlog.populate('author', 'username avatar bio');

  // Trigger Async Moderation
  try {
    const q = createModerationQueue();
    if (q) {
      q.add(
        { vlogId: vlog._id.toString() },
        {
          priority: 1, // High priority for new vlogs
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: true,
        },
      );
    }
    logger.info(`Queued moderation for vlog ${vlog._id}`);
  } catch (error) {
    logger.error('Failed to queue moderation job', error);
    // Don't fail the request, just log error.
    // In production, might want alerting here.
  }

  // PERFORMANCE: Invalidate specific vlog presence
  await invalidateVlog(vlog._id.toString());

  res.status(201).json({ success: true, data: vlog });
});

/* ----------------------------------------------------------
   UPDATE VLOG
---------------------------------------------------------- */
exports.updateVlog = asyncHandler(async (req, res, next) => {
  let vlog = await Vlog.findById(req.params.id);

  if (!vlog) return next(new ErrorResponse('Vlog not found', 404));

  if (vlog.author.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to update this vlog', 403));
  }

  // Handle image updates
  let updatedImages = req.body.images || vlog.images;

  if (req.files?.length > 0) {
    const newImages = req.files.map((file, i) => ({
      url: file.path,
      publicId: file.filename || file.public_id,
      caption: req.body.captions?.[i] || '',
      order: updatedImages.length + i,
    }));

    updatedImages = [...updatedImages, ...newImages];
  }

  if (updatedImages.length > 10) {
    return next(new ErrorResponse('Cannot have more than 10 images', 400));
  }

  if (updatedImages.length === 0) {
    return next(new ErrorResponse('At least one image is required', 400));
  }

  req.body.images = updatedImages;

  // Explicitly trim title and description because findByIdAndUpdate
  // can bypass Mongoose schema string trimming depending on mongoose version/config
  const sanitizedUpdate = {
    ...req.body,
    ...(req.body.title !== undefined && { title: req.body.title.trim() }),
    ...(req.body.description !== undefined && { description: req.body.description.trim() }),
  };

  vlog = await Vlog.findByIdAndUpdate(req.params.id, sanitizedUpdate, {
    new: true,
    runValidators: true,
  }).populate('author', 'username avatar bio');

  // PERFORMANCE: Invalidate specific cached vlog
  await invalidateVlog(vlog._id.toString());

  res.status(200).json({ success: true, data: vlog });
});

/* ----------------------------------------------------------
   DELETE VLOG (with image cleanup)
---------------------------------------------------------- */
exports.deleteVlog = asyncHandler(async (req, res, next) => {
  const { id: vlogId } = req.params;

  // Pre-flight: verify existence and authorization before opening a session
  const vlog = await Vlog.findById(vlogId);
  if (!vlog) return next(new ErrorResponse('Vlog not found', 404));

  if (vlog.author.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to delete this vlog', 403));
  }

  // Cloudinary cleanup is best-effort and intentionally outside the transaction.
  // Cloud storage is non-transactional; failures here are logged but never block deletion.
  if (vlog.images?.length > 0) {
    await Promise.all(
      vlog.images.map(async (img) => {
        try {
          await deleteImage(img.publicId);
        } catch (error) {
          logger.error('Failed to delete Cloudinary image', {
            publicId: img.publicId,
            error: error.message,
          });
        }
      }),
    );
  }

  // TRANSACTION: atomic cascade delete — all or nothing.
  // Covers: Likes, Comments, User bookmarks, Vlog document.
  // Without this, a partial failure leaves orphaned Likes/Comments permanently.
  const isTransactionEnabled = process.env.SKIP_TRANSACTIONS !== 'true';
  let session = null;

  if (isTransactionEnabled) {
    session = await mongoose.startSession();
    session.startTransaction();
  }

  try {
    const sessionOpt = session ? { session } : {};

    // All four writes are atomic. If any fails, abortTransaction() rolls back all.
    await Promise.all([
      Like.deleteMany({ vlog: vlogId }, sessionOpt),
      Comment.deleteMany({ vlog: vlogId }, sessionOpt),
      // Remove vlog from any user's bookmarks array (previously missing)
      User.updateMany(
        { bookmarks: vlogId },
        { $pull: { bookmarks: vlogId } },
        sessionOpt,
      ),
      vlog.deleteOne(sessionOpt),
    ]);

    if (session) {
      await session.commitTransaction();
    }
  } catch (error) {
    if (session) {
      await session.abortTransaction();
    }
    throw error;
  } finally {
    if (session) {
      session.endSession();
    }
  }

  // Cache invalidation fires only after confirmed DB commit.
  // If the transaction aborted, the throw above skips this line.
  await invalidateVlog(vlogId);

  res.status(200).json({
    success: true,
    message: 'Vlog deleted successfully',
    data: {},
  });
});

/* ----------------------------------------------------------
   TOGGLE LIKE
---------------------------------------------------------- */
exports.toggleLike = asyncHandler(async (req, res) => {
  const result = await VlogService.toggleLike(req.params.id, req.user.id);
  // SURGICAL INVALIDATION: clear only paths containing this vlog
  await invalidateVlog(req.params.id);
  res.status(200).json({ success: true, data: result });
});

/* ----------------------------------------------------------
   TOGGLE DISLIKE
---------------------------------------------------------- */
exports.toggleDislike = asyncHandler(async (req, res) => {
  const result = await VlogService.toggleDislike(req.params.id, req.user.id);
  // SURGICAL INVALIDATION: clear only paths containing this vlog
  await invalidateVlog(req.params.id);
  res.status(200).json({ success: true, data: result });
});

/* ----------------------------------------------------------
   ADD COMMENT
---------------------------------------------------------- */
exports.addComment = asyncHandler(async (req, res) => {
  const comment = await VlogService.addComment(
    req.params.id,
    req.user.id,
    req.body.text,
  );
  // SURGICAL INVALIDATION
  await invalidateVlog(req.params.id);
  res.status(201).json({ success: true, data: comment });
});

/* ----------------------------------------------------------
   DELETE COMMENT
---------------------------------------------------------- */
exports.deleteComment = asyncHandler(async (req, res) => {
  await VlogService.deleteComment(
    req.params.id,
    req.params.commentId,
    req.user.id,
    req.user.role === 'admin',
  );
  // SURGICAL INVALIDATION
  await invalidateVlog(req.params.id);
  res.status(200).json({ success: true, data: {} });
});

/* ----------------------------------------------------------
   INCREMENT SHARE COUNT
---------------------------------------------------------- */
exports.incrementShare = asyncHandler(async (req, res, next) => {
  const vlog = await Vlog.findByIdAndUpdate(
    req.params.id,
    { $inc: { shares: 1 } },
    { new: true },
  );
  if (!vlog) return next(new ErrorResponse('Vlog not found', 404));
  // SURGICAL INVALIDATION
  await invalidateVlog(req.params.id);
  res.status(200).json({ success: true, data: { shares: vlog.shares } });
});

/* ----------------------------------------------------------
   TRENDING VLOGS
---------------------------------------------------------- */
exports.getTrendingVlogs = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 10;
  const timeframe = parseInt(req.query.timeframe, 10) || 7;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - timeframe);

  // Simplified trending logic for performance (Phase 5 refactor target)
  // For now, sorting by views + likes
  const vlogs = await Vlog.find({
    isPublic: true,
    status: 'APPROVED',
    createdAt: { $gte: cutoff },
  })
    .sort({ views: -1, likeCount: -1 }) // Use mapped index
    .limit(limit)
    .populate('author', 'username avatar bio')
    .lean();

  res.status(200).json({ success: true, count: vlogs.length, data: vlogs });
});

/* ----------------------------------------------------------
   GET USER'S PUBLIC VLOGS
---------------------------------------------------------- */
exports.getUserVlogs = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const viewerId = req.user ? req.user.id : null;
  const isAuthor = viewerId && viewerId === req.params.userId;
  const isAdmin = req.user && req.user.role === 'admin';

  const query = { author: req.params.userId };

  // Visibility Access Control:
  // If NOT author AND NOT admin -> Only show APPROVED + Public content
  if (!isAuthor && !isAdmin) {
    query.isPublic = true;
    query.status = 'APPROVED';
  }

  const vlogs = await Vlog.find(query)
    .populate('author', 'username avatar bio')
    .sort('-createdAt')
    .skip(skip)
    .limit(limit);

  const total = await Vlog.countDocuments(query);
  const totalPages = Math.ceil(total / limit);

  res.status(200).json({
    success: true,
    count: vlogs.length,
    total,
    totalPages,
    currentPage: page,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
    data: vlogs,
  });
});

/* ----------------------------------------------------------
   RECORD VIEW

   CRITICAL: This endpoint should ONLY be called ONCE per user visit to detail page
   DO NOT call from:
   - List fetches (GET /api/vlogs)
   - React Query refetches
   - Cache warming
   - Background jobs
   - WebSocket events
---------------------------------------------------------- */
exports.recordView = asyncHandler(async (req, res) => {
  // Generate unique viewer ID with priority: userId > sessionID > IP hash
  let viewerId;
  if (req.user) {
    viewerId = req.user.id;
  } else if (req.sessionID) {
    viewerId = req.sessionID;
  } else {
    // Anonymous user - hash IP address for privacy
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    viewerId = crypto
      .createHash('sha256')
      .update(ip)
      .digest('hex')
      .substring(0, 16);
  }

  // Record view with Redis deduplication
  const result = await VlogService.recordView(req.params.id, viewerId);

  // OBSERVABILITY: Log view event for monitoring
  logger.info('Vlog view recorded', {
    eventType: 'view_recorded',
    vlogId: req.params.id,
    viewerId, // Hashed if anonymous
    incremented: result.incremented, // True if new view
    degraded: result.degraded || false, // True if Redis failed
    views: result.views,
    correlationId: req.correlationId,
    ip: req.ip, // Useful for abuse monitoring (if generic IP logging allowed)
  });

  // If view was tracked (incremented), invalidate cache.
  // We explicitly check result.incremented to avoid invalidating aggressively
  // if this is a deduplicated view from the same user TTL window.
  if (result.incremented) {
    // SURGICAL INVALIDATION
    await invalidateVlog(req.params.id);
  }

  // Response TTL: Use same logic as service for consistency
  const VIEW_TTL_SECONDS = parseInt(process.env.VIEW_TTL_SECONDS, 10) || 300;

  res.status(200).json({
    success: true,
    data: {
      views: result.views,
      hasViewed: true,
      incremented: result.incremented,
      ttl: VIEW_TTL_SECONDS,
      degraded: result.degraded || false,
    },
  });
});
