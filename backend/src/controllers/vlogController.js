const Vlog = require('../models/Vlog');
const { deleteImage } = require('../middleware/upload');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const { generateTags } = require('../services/aiService');
const VlogService = require('../services/vlogService');
const { invalidateVlogCache } = require('../middleware/cache');

/* ----------------------------------------------------------
   GET ALL VLOGS (Public)
---------------------------------------------------------- */
exports.getVlogs = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const startIndex = (page - 1) * limit;

  const query = { isPublic: true };

  if (req.query.category) query.category = req.query.category;
  if (req.query.tag) query.tags = { $in: [req.query.tag] };
  if (req.query.author) query.author = req.query.author;

  if (req.query.search && req.query.search.trim()) {
    query.$text = { $search: req.query.search.trim() };
  }

  if (req.query.dateFrom || req.query.dateTo) {
    query.createdAt = {};
    if (req.query.dateFrom) query.createdAt.$gte = new Date(req.query.dateFrom);
    if (req.query.dateTo) query.createdAt.$lte = new Date(req.query.dateTo);
  }

  let sortBy = '-createdAt';
  switch (req.query.sort) {
    case 'popular': sortBy = '-views'; break;
    case 'liked': sortBy = '-likeCount'; break; // Updated to use new field
    case 'oldest': sortBy = 'createdAt'; break;
    case 'alphabetical': sortBy = 'title'; break;
    default: sortBy = '-createdAt';
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
  const userId = req.user ? req.user.id : null;
  const vlogData = await VlogService.getVlog(req.params.id, userId);

  // Authorization check for private vlogs
  if (!vlogData.isPublic && (!userId || vlogData.author._id.toString() !== userId)) {
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

  const vlog = await Vlog.create(req.body);

  await vlog.populate('author', 'username avatar bio');

  // PERFORMANCE: Invalidate vlog caches after creation
  await invalidateVlogCache();

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

  vlog = await Vlog.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  }).populate('author', 'username avatar bio');

  // PERFORMANCE: Invalidate vlog caches after update
  await invalidateVlogCache();

  res.status(200).json({ success: true, data: vlog });
});

/* ----------------------------------------------------------
   DELETE VLOG (with image cleanup)
---------------------------------------------------------- */
exports.deleteVlog = asyncHandler(async (req, res, next) => {
  const vlog = await Vlog.findById(req.params.id);

  if (!vlog) return next(new ErrorResponse('Vlog not found', 404));

  if (vlog.author.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to delete this vlog', 403));
  }

  if (vlog.images?.length > 0) {
    await Promise.all(vlog.images.map(async (img) => {
      try {
        await deleteImage(img.publicId);
      } catch (error) {
        console.error(`Failed to delete image ${img.publicId}: `, error.message);
      }
    }));
  }

  await vlog.deleteOne();

  // PERFORMANCE: Invalidate vlog caches after deletion
  await invalidateVlogCache();

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
  res.status(200).json({ success: true, data: result });
});

/* ----------------------------------------------------------
   TOGGLE DISLIKE
---------------------------------------------------------- */
exports.toggleDislike = asyncHandler(async (req, res) => {
  const result = await VlogService.toggleDislike(req.params.id, req.user.id);
  res.status(200).json({ success: true, data: result });
});

/* ----------------------------------------------------------
   ADD COMMENT
---------------------------------------------------------- */
exports.addComment = asyncHandler(async (req, res) => {
  const comment = await VlogService.addComment(req.params.id, req.user.id, req.body.text);
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
  res.status(200).json({ success: true, data: {} });
});

/* ----------------------------------------------------------
   INCREMENT SHARE COUNT
---------------------------------------------------------- */
exports.incrementShare = asyncHandler(async (req, res, next) => {
  const vlog = await Vlog.findByIdAndUpdate(req.params.id, { $inc: { shares: 1 } }, { new: true });
  if (!vlog) return next(new ErrorResponse('Vlog not found', 404));
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

  const vlogs = await Vlog.find({ author: req.params.userId, isPublic: true })
    .populate('author', 'username avatar bio')
    .sort('-createdAt')
    .skip(skip)
    .limit(limit);

  const total = await Vlog.countDocuments({ author: req.params.userId, isPublic: true });
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
---------------------------------------------------------- */
exports.recordView = asyncHandler(async (req, res) => {
  // If user is logged in, use Service to record (which might eventually handle uniqueness)
  // If not, just increment
  if (req.user) {
    await VlogService.recordView(req.params.id, req.user.id);
  } else {
    await Vlog.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });
  }

  const vlog = await Vlog.findById(req.params.id, 'views');
  res.status(200).json({
    success: true,
    data: {
      views: vlog.views,
      hasViewed: true, // Simplified for now
    },
  });
});
