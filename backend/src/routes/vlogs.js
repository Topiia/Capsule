const express = require('express');

const router = express.Router();
const { body } = require('express-validator');
const {
  getVlogs,
  getVlog,
  createVlog,
  updateVlog,
  deleteVlog,
  toggleLike,
  toggleDislike,
  addComment,
  deleteComment,
  incrementShare,
  getTrendingVlogs,
  getUserVlogs,
  recordView,
} = require('../controllers/vlogController');
const { protect, optionalAuth } = require('../middleware/auth');
const { uploadMultiple } = require('../middleware/upload');
const { cacheMiddleware } = require('../middleware/cache');
const {
  viewCountLimiter,
  generalReadLimiter,
  mutationLimiter,
} = require('../middleware/rateLimit');
const { readSlowDown } = require('../middleware/slowDown');

// Validation rules
const createVlogValidation = [
  body('title')
    .isLength({ min: 3, max: 100 })
    .withMessage('Title must be between 3 and 100 characters'),
  body('description')
    .isLength({ min: 10, max: 2000 })
    .withMessage('Description must be between 10 and 2000 characters'),
  body('category')
    .isIn([
      'technology',
      'travel',
      'lifestyle',
      'food',
      'fashion',
      'fitness',
      'music',
      'art',
      'business',
      'education',
      'entertainment',
      'gaming',
      'sports',
      'health',
      'science',
      'photography',
      'diy',
      'other',
    ])
    .withMessage('Please select a valid category'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array')
    .custom((tags) => tags.every(
      (tag) => typeof tag === 'string' && tag.length >= 2 && tag.length <= 30,
    ))
    .withMessage('Each tag must be a string between 2 and 30 characters'),
  body('content')
    .optional()
    .isLength({ max: 10000 })
    .withMessage('Content cannot exceed 10000 characters'),
  body('isPublic')
    .optional()
    .isBoolean()
    .withMessage('isPublic must be a boolean value'),
];

const updateVlogValidation = [
  body('title')
    .optional()
    .isLength({ min: 3, max: 100 })
    .withMessage('Title must be between 3 and 100 characters'),
  body('description')
    .optional()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Description must be between 10 and 2000 characters'),
  body('category')
    .optional()
    .isIn([
      'technology',
      'travel',
      'lifestyle',
      'food',
      'fashion',
      'fitness',
      'music',
      'art',
      'business',
      'education',
      'entertainment',
      'gaming',
      'sports',
      'health',
      'science',
      'photography',
      'diy',
      'other',
    ])
    .withMessage('Please select a valid category'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array')
    .custom((tags) => {
      if (tags.length > 10) {
        throw new Error('Cannot have more than 10 tags');
      }
      return tags.every(
        (tag) => typeof tag === 'string' && tag.length >= 2 && tag.length <= 30,
      );
    })
    .withMessage('Each tag must be a string between 2 and 30 characters'),
  body('images')
    .optional()
    .isArray()
    .withMessage('Images must be an array')
    .custom((images) => {
      if (images.length > 10) {
        throw new Error('Cannot have more than 10 images');
      }
      if (images.length === 0) {
        throw new Error('At least one image is required');
      }
      return images.every((img) => img.url && img.publicId);
    })
    .withMessage('Each image must have url and publicId'),
  body('content')
    .optional()
    .isLength({ max: 10000 })
    .withMessage('Content cannot exceed 10000 characters'),
  body('isPublic')
    .optional()
    .isBoolean()
    .withMessage('isPublic must be a boolean value'),
];

const commentValidation = [
  body('text')
    .isLength({ min: 1, max: 500 })
    .withMessage('Comment must be between 1 and 500 characters')
    .trim(),
];

// Routes
// Cached GET routes (TTL in seconds)
router.get('/trending', readSlowDown, generalReadLimiter, cacheMiddleware(600), getTrendingVlogs); // Cache for 10 minutes
router.get('/user/:userId', optionalAuth, readSlowDown, generalReadLimiter, cacheMiddleware(300), getUserVlogs); // Cache for 5 minutes
router.get('/', optionalAuth, readSlowDown, generalReadLimiter, cacheMiddleware(180), getVlogs); // Cache for 3 minutes
router.get('/:id', optionalAuth, readSlowDown, generalReadLimiter, cacheMiddleware(300), getVlog); // Cache for 5 minutes
router.post(
  '/',
  protect,
  mutationLimiter,
  uploadMultiple('images', 10),
  createVlogValidation,
  createVlog,
);
router.put(
  '/:id',
  protect,
  mutationLimiter,
  uploadMultiple('images', 10),
  updateVlogValidation,
  updateVlog,
);
router.delete('/:id', protect, mutationLimiter, deleteVlog);
router.put('/:id/like', protect, mutationLimiter, toggleLike);
router.put('/:id/dislike', protect, mutationLimiter, toggleDislike);
router.put('/:id/share', protect, mutationLimiter, incrementShare);
router.put('/:id/view', protect, viewCountLimiter, recordView);
router.post('/:id/comments', protect, mutationLimiter, commentValidation, addComment);
router.delete('/:id/comments/:commentId', protect, mutationLimiter, deleteComment);

module.exports = router;
