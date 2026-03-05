const express = require('express');

const router = express.Router();

const User = require('../models/User');
const Vlog = require('../models/Vlog');
const asyncHandler = require('../middleware/asyncHandler');

const { protect, authorize } = require('../middleware/auth');
const { generalReadLimiter } = require('../middleware/rateLimit');

router.use(protect);
router.use(authorize('admin'));

/**
 * @desc Get All Users
 * @route GET /api/admin/users?page=1&limit=50
 */
router.get('/users', generalReadLimiter, asyncHandler(async (req, res) => {
  // HIGH-2: Mandatory pagination to prevent unbound memory usage
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    User.find({}).select('-password').sort('-createdAt').skip(skip)
      .limit(limit),
    User.countDocuments(),
  ]);

  res.json({
    success: true,
    count: users.length,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    data: users,
  });
}));

/**
 * @desc Platform Analytics
 * @route GET /api/admin/stats
 */
router.get('/stats', generalReadLimiter, asyncHandler(async (req, res) => {
  const totalUsers = await User.countDocuments();
  const totalVlogs = await Vlog.countDocuments();
  const activeUsers = await User.countDocuments({ isActive: true });

  res.json({
    success: true,
    data: {
      totalUsers,
      totalVlogs,
      activeUsers,
    },
  });
}));

module.exports = router;
