const express = require('express');

const router = express.Router();

const User = require('../models/User');
const Vlog = require('../models/Vlog');

const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.use(authorize('admin'));

/**
 * @desc Get All Users
 * @route GET /api/admin/users
 */
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({})
      .select('-password')
      .sort('-createdAt');

    res.json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @desc Platform Analytics
 * @route GET /api/admin/stats
 */
router.get('/stats', async (req, res) => {
  try {
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
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
