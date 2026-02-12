const mongoose = require('mongoose');
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

  // FIXED Bug #6: Mongoose populate doesn't support skip/limit on arrays
  // Fetch user with bookmarks array only
  const user = await User.findById(req.user.id).select('bookmarks');

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  const total = user.bookmarks.length;
  const totalPages = Math.ceil(total / limit);

  // Manual pagination: slice the bookmarks array
  const paginatedBookmarkIds = user.bookmarks.slice(skip, skip + limit);

  // Fetch vlogs with proper population
  const vlogs = await Vlog.find({ _id: { $in: paginatedBookmarkIds } })
    .populate({
      path: 'author',
      select: 'username avatar bio followerCount',
    })
    .sort({ createdAt: -1 });

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
   ADD BOOKMARK
---------------------------------------------------------- */
exports.addBookmark = asyncHandler(async (req, res, next) => {
  // Check if vlog exists
  const vlog = await Vlog.findById(req.params.vlogId);
  if (!vlog) {
    return next(new ErrorResponse('Vlog not found', 404));
  }

  // FIXED Bug #10: Use atomic $addToSet instead of includes() check
  // This prevents race conditions and is more efficient
  await User.findByIdAndUpdate(
    req.user.id,
    { $addToSet: { bookmarks: req.params.vlogId } },
  );

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

  // FIXED Bug #3: Use MongoDB transactions for atomicity
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Check if user exists
    const userToFollow = await User.findById(userId).session(session);
    if (!userToFollow) {
      throw new ErrorResponse('User not found', 404);
    }

    const follower = await User.findById(followerId).session(session);

    // Check if already following
    if (follower.following.includes(userId)) {
      throw new ErrorResponse('Already following this user', 400);
    }

    // FIXED Bug #3: Use $addToSet for atomic updates (prevents duplicates)
    await User.findByIdAndUpdate(
      followerId,
      { $addToSet: { following: userId } },
      { session },
    );

    await User.findByIdAndUpdate(
      userId,
      { $addToSet: { followers: followerId } },
      { session },
    );

    // Commit transaction
    await session.commitTransaction();

    // Fetch updated counts (outside transaction for better performance)
    const updatedFollower = await User.findById(followerId).select(
      'followingCount following',
    );
    const updatedUserToFollow = await User.findById(userId).select(
      'followerCount',
    );

    res.status(200).json({
      success: true,
      data: {
        isFollowing: true,
        followerCount: updatedUserToFollow.followerCount,
        followingCount: updatedFollower.followingCount,
        following: updatedFollower.following,
      },
    });
  } catch (error) {
    // Rollback on error
    await session.abortTransaction();
    throw error;
  } finally {
    // Always end session
    session.endSession();
  }
});

/* ----------------------------------------------------------
   UNFOLLOW USER
---------------------------------------------------------- */
exports.unfollowUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const followerId = req.user.id;

  // FIXED Bug #3: Use MongoDB transactions for atomicity
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Check if user exists
    const userToUnfollow = await User.findById(userId).session(session);
    if (!userToUnfollow) {
      throw new ErrorResponse('User not found', 404);
    }

    const follower = await User.findById(followerId).session(session);

    // Check if currently following
    if (!follower.following.includes(userId)) {
      throw new ErrorResponse('Not following this user', 400);
    }

    // FIXED Bug #3: Use $pull for atomic removal
    await User.findByIdAndUpdate(
      followerId,
      { $pull: { following: userId } },
      { session },
    );

    await User.findByIdAndUpdate(
      userId,
      { $pull: { followers: followerId } },
      { session },
    );

    // Commit transaction
    await session.commitTransaction();

    // Fetch updated counts (outside transaction for better performance)
    const updatedFollower = await User.findById(followerId).select(
      'followingCount following',
    );
    const updatedUserToUnfollow = await User.findById(userId).select(
      'followerCount',
    );

    res.status(200).json({
      success: true,
      data: {
        isFollowing: false,
        followerCount: updatedUserToUnfollow.followerCount,
        followingCount: updatedFollower.followingCount,
        following: updatedFollower.following,
      },
    });
  } catch (error) {
    // Rollback on error
    await session.abortTransaction();
    throw error;
  } finally {
    // Always end session
    session.endSession();
  }
});

/* ----------------------------------------------------------
   GET FOLLOWERS
---------------------------------------------------------- */
exports.getFollowers = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  // FIXED Bug #7: Mongoose populate doesn't support skip/limit on arrays
  const user = await User.findById(userId).select('followers');

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  const total = user.followers.length;
  const totalPages = Math.ceil(total / limit);

  // Manual pagination: slice the followers array
  const paginatedFollowerIds = user.followers.slice(skip, skip + limit);

  // Fetch users with proper selection
  const followers = await User.find({ _id: { $in: paginatedFollowerIds } })
    .select('username avatar bio followerCount');

  // Add isFollowing status for current user
  const currentUser = req.user
    ? await User.findById(req.user.id).select('following')
    : null;
  const followersWithStatus = followers.map((follower) => ({
    ...follower.toObject(),
    isFollowing: currentUser
      ? currentUser.following.some((id) => id.equals(follower._id))
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

  // FIXED Bug #7: Mongoose populate doesn't support skip/limit on arrays
  const user = await User.findById(userId).select('following');

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  const total = user.following.length;
  const totalPages = Math.ceil(total / limit);

  // Manual pagination: slice the following array
  const paginatedFollowingIds = user.following.slice(skip, skip + limit);

  // Fetch users with proper selection
  const following = await User.find({ _id: { $in: paginatedFollowingIds } })
    .select('username avatar bio followerCount');

  // Add isFollowing status for current user
  const currentUser = req.user
    ? await User.findById(req.user.id).select('following')
    : null;
  const followingWithStatus = following.map((followedUser) => ({
    ...followedUser.toObject(),
    isFollowing: currentUser
      ? currentUser.following.some((id) => id.equals(followedUser._id))
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

  // FIXED Bug #1: Query Like collection to get vlog IDs that user has liked
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

  // FIXED Bug #2: Added missing data field
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
