const express = require('express');

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
} = require('../controllers/userController');
const { protect } = require('../middleware/auth');

// Public routes (no authentication required)
router.get('/profile/:username', getUserByUsername);

// All routes below require authentication
router.use(protect);

// Liked vlogs route
router.get('/likes', getLikedVlogs);

// Bookmark routes
router.get('/bookmarks', getBookmarks);
router.post('/bookmarks/:vlogId', addBookmark);
router.delete('/bookmarks/:vlogId', removeBookmark);

// Follow routes
router.post('/:userId/follow', followUser);
router.delete('/:userId/follow', unfollowUser);
router.get('/:userId/followers', getFollowers);
router.get('/:userId/following', getFollowing);

module.exports = router;
