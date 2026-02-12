const User = require('../models/User');
const Vlog = require('../models/Vlog');
const Like = require('../models/Like');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const userDeletionService = require('../services/userDeletionService');

/* ----------------------------------------------------------
   GET USER BOOKMARKS
---------------------------------------------------------- */
exports.getBookmarks = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const user = await User.findById(req.user.id).populate({
    path: 'bookmarks',
    options: {
      skip,
      limit,
      sort: { createdAt: -1 },
    },
    populate: {
      path: 'author',
      select: 'username avatar bio followerCount',
    },
  });

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // Get total count of bookmarks for pagination
  const totalBookmarks = await User.findById(req.user.id).select('bookmarks');
  const total = totalBookmarks.bookmarks.length;
  const totalPages = Math.ceil(total / limit);

  res.status(200).json({
    success: true,
    count: user.bookmarks.length,
    total,
    totalPages,
    currentPage: page,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
    data: user.bookmarks,
  });
});

/* ----------------------------------------------------------
   ADD BOOKMARK
---------------------------------------------------------- */
exports.addBookmark = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);
  const vlog = await Vlog.findById(req.params.vlogId);

  if (!vlog) {
    return next(new ErrorResponse('Vlog not found', 404));
  }

  // Check if already bookmarked
  if (!user.bookmarks.includes(req.params.vlogId)) {
    user.bookmarks.push(req.params.vlogId);
    await user.save();
  }

  res.status(200).json({
    success: true,
    data: { bookmarked: true },
  });
});

/* ----------------------------------------------------------
   REMOVE BOOKMARK
---------------------------------------------------------- */
exports.removeBookmark = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // Remove bookmark
  user.bookmarks = user.bookmarks.filter(
    (id) => id.toString() !== req.params.vlogId,
  );
  await user.save();

  res.status(200).json({
    success: true,
    data: { bookmarked: false },
  });
});

/* ----------------------------------------------------------
   FOLLOW USER
---------------------------------------------------------- */
exports.followUser = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const followerId = req.user.id;

  // Cannot follow yourself
  if (userId === followerId) {
    return next(new ErrorResponse('Cannot follow yourself', 400));
  }

  // Check if user exists
  const userToFollow = await User.findById(userId);
  if (!userToFollow) {
    return next(new ErrorResponse('User not found', 404));
  }

  const follower = await User.findById(followerId);

  // Check if already following
  if (follower.following.includes(userId)) {
    return next(new ErrorResponse('Already following this user', 400));
  }

  // Update both users atomically
  follower.following.push(userId);
  userToFollow.followers.push(followerId);

  await Promise.all([follower.save(), userToFollow.save()]);

  res.status(200).json({
    success: true,
    data: {
      isFollowing: true,
      followerCount: userToFollow.followerCount,
      followingCount: follower.followingCount,
      following: follower.following, // Include updated following array
    },
  });
});

/* ----------------------------------------------------------
   UNFOLLOW USER
---------------------------------------------------------- */
exports.unfollowUser = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const followerId = req.user.id;

  // Check if user exists
  const userToUnfollow = await User.findById(userId);
  if (!userToUnfollow) {
    return next(new ErrorResponse('User not found', 404));
  }

  const follower = await User.findById(followerId);

  // Check if currently following
  if (!follower.following.includes(userId)) {
    return next(new ErrorResponse('Not following this user', 400));
  }

  // Update both users atomically
  follower.following = follower.following.filter(
    (id) => id.toString() !== userId,
  );
  userToUnfollow.followers = userToUnfollow.followers.filter(
    (id) => id.toString() !== followerId,
  );

  await Promise.all([follower.save(), userToUnfollow.save()]);

  res.status(200).json({
    success: true,
    data: {
      isFollowing: false,
      followerCount: userToUnfollow.followerCount,
      followingCount: follower.followingCount,
      following: follower.following, // Include updated following array
    },
  });
});

/* ----------------------------------------------------------
   GET FOLLOWERS
---------------------------------------------------------- */
exports.getFollowers = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const user = await User.findById(userId).populate({
    path: 'followers',
    select: 'username avatar bio followerCount',
    options: {
      skip,
      limit,
    },
  });

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  const total = user.followers.length;
  const totalPages = Math.ceil(total / limit);

  // Add isFollowing status for current user
  const currentUser = req.user ? await User.findById(req.user.id) : null;
  const followersWithStatus = user.followers.map((follower) => ({
    ...follower.toObject(),
    isFollowing: currentUser
      ? currentUser.following.includes(follower._id)
      : false,
  }));

  res.status(200).json({
    success: true,
    count: followersWithStatus.length,
    total,
    totalPages,
    currentPage: page,
    data: followersWithStatus,
  });
});

/* ----------------------------------------------------------
   GET FOLLOWING
---------------------------------------------------------- */
exports.getFollowing = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const user = await User.findById(userId).populate({
    path: 'following',
    select: 'username avatar bio followerCount',
    options: {
      skip,
      limit,
    },
  });

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  const total = user.following.length;
  const totalPages = Math.ceil(total / limit);

  // Add isFollowing status for current user
  const currentUser = req.user ? await User.findById(req.user.id) : null;
  const followingWithStatus = user.following.map((followedUser) => ({
    ...followedUser.toObject(),
    isFollowing: currentUser
      ? currentUser.following.includes(followedUser._id)
      : false,
  }));

  res.status(200).json({
    success: true,
    count: followingWithStatus.length,
    total,
    totalPages,
    currentPage: page,
    data: followingWithStatus,
  });
});

/* ----------------------------------------------------------
   GET USER BY USERNAME
---------------------------------------------------------- */
exports.getUserByUsername = asyncHandler(async (req, res, next) => {
  const { username } = req.params;

  const user = await User.findOne({ username }).select(
    '_id username avatar bio followerCount followingCount createdAt',
  );

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  res.status(200).json({
    success: true,
    data: user,
  });
});

/* ----------------------------------------------------------
   GET LIKED VLOGS
---------------------------------------------------------- */
exports.getLikedVlogs = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;
  const sortBy = req.query.sort || '-createdAt';
  const { category } = req.query;

  // FIXED: Query Like collection to get vlog IDs that user has liked
  const likeQuery = { user: req.user.id, type: 'like' };
  const likes = await Like.find(likeQuery).select('vlog');
  const vlogIds = likes.map((like) => like.vlog);

  // Build query for vlogs using the liked vlog IDs
  const query = { _id: { $in: vlogIds } };

  // Add category filter if provided
  if (category && category !== 'all') {
    query.category = category;
  }

  // Get total count for pagination
  const total = await Vlog.countDocuments(query);
  const totalPages = Math.ceil(total / limit);

  // Query vlogs with pagination and sorting
  const vlogs = await Vlog.find(query)
    .populate({
      path: 'author',
      select: 'username avatar bio followerCount',
    })
    .sort(sortBy)
    .skip(skip)
    .limit(limit);

  // FIXED: Added missing 'data' field in response
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
   DELETE USER ACCOUNT (SECURE CASCADE DELETION)
---------------------------------------------------------- */
exports.deleteAccount = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { password } = req.body;

  // Optional password verification for additional security
  if (password) {
    const user = await User.findById(userId).select('+password');

    if (!user) {
      return next(new ErrorResponse('User not found', 404));
    }

    const isPasswordMatch = await user.comparePassword(password);
    if (!isPasswordMatch) {
      return next(new ErrorResponse('Invalid password', 401));
    }
  }

  try {
    // Perform cascade deletion
    const result = await userDeletionService.deleteUser(userId, {
      correlationId: req.id,
      ip: req.ip,
    });

    // Clear authentication cookies
    const clearOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      expires: new Date(0),
    };

    res.cookie('token', '', clearOptions);
    res.cookie('refreshToken', '', clearOptions);

    res.status(200).json({
      success: true,
      message: 'Account deleted successfully',
      data: result.deletedCounts,
    });
  } catch (error) {
    return next(
      new ErrorResponse(`Account deletion failed: ${error.message}`, 500),
    );
  }
});
