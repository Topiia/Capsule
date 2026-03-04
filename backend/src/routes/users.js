const express = require('express');
const {
  deleteAccountLimiter,
  generalReadLimiter,
  mutationLimiter,
} = require('../middleware/rateLimit');
const { readSlowDown } = require('../middleware/slowDown');

const router = express.Router();

const {
  getBookmarks,
  addBookmark,
  removeBookmark,
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  getUserByUsername,
  getLikedVlogs,
  deleteAccount,
} = require('../controllers/userController');

const { protect } = require('../middleware/auth');
const { validatePasswordConfirmation } = require('../middleware/validation');
// Public routes (no authentication required)
router.get('/profile/:username', readSlowDown, generalReadLimiter, getUserByUsername);

// All routes below require authentication
router.use(protect);

// Liked vlogs route
router.get('/likes', readSlowDown, generalReadLimiter, getLikedVlogs);

// Bookmark routes
router.get('/bookmarks', readSlowDown, generalReadLimiter, getBookmarks);
router.post('/bookmarks/:vlogId', mutationLimiter, addBookmark);
router.delete('/bookmarks/:vlogId', mutationLimiter, removeBookmark);

// Follow routes
router.post('/:userId/follow', mutationLimiter, followUser);
router.delete('/:userId/follow', mutationLimiter, unfollowUser);
router.get('/:userId/followers', readSlowDown, generalReadLimiter, getFollowers);
router.get('/:userId/following', readSlowDown, generalReadLimiter, getFollowing);

// SECURITY: Account deletion (requires password + rate limiting)
router.delete(
  '/me',
  deleteAccountLimiter,
  validatePasswordConfirmation,
  deleteAccount,
);

module.exports = router;
