const express = require('express');

const router = express.Router();
const {
  register,
  login,
  getMe,
  updateDetails,
  updatePassword,
  forgotPassword,
  resetPassword,
  verifyEmail,
} = require('../controllers/authController');
const { protect, refreshToken, logout } = require('../middleware/auth');
const {
  registerValidation,
  loginValidation,
  updateProfileValidation,
  updatePasswordValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  validate,
} = require('../middleware/validation');

const {
  authLimiter,
  identityLimiter,
  mutationLimiter,
} = require('../middleware/rateLimit');

// Routes with appropriate rate limiting
// Strict limiting (prevent brute force)
router.post(
  '/register',
  authLimiter,
  registerValidation,
  validate,
  register,
);
router.post(
  '/login',
  authLimiter,
  loginValidation,
  validate,
  login,
);
router.post(
  '/forgotpassword',
  authLimiter,
  forgotPasswordValidation,
  validate,
  forgotPassword,
);

// Lenient limiting (allow normal usage)
router.get(
  '/me',
  protect,
  identityLimiter,
  getMe,
);
router.post(
  '/refresh',
  identityLimiter,
  refreshToken,
);

// No rate limiting (protected by auth middleware)
router.put('/updatedetails', protect, mutationLimiter, updateProfileValidation, updateDetails);
router.put(
  '/updatepassword',
  protect,
  mutationLimiter,
  updatePasswordValidation,
  updatePassword,
);
router.put(
  '/resetpassword/:resettoken',
  authLimiter,
  resetPasswordValidation,
  resetPassword,
);
router.get('/verify/:token', authLimiter, verifyEmail);
router.post('/logout', protect, identityLimiter, logout);

module.exports = router;
