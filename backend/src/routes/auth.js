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

// Import rate limiters (defined in server.js, exported via app.locals)
// Initialize as no-op middleware until setLimiters is called
let loginLimiter = (req, res, next) => next();
let sessionLimiter = (req, res, next) => next();

// Export function to set limiters from server.js
router.setLimiters = (loginLim, sessionLim) => {
  loginLimiter = loginLim;
  sessionLimiter = sessionLim;
};

// Routes with appropriate rate limiting
// Strict limiting (prevent brute force)
router.post(
  '/register',
  (req, res, next) => loginLimiter(req, res, next),
  registerValidation,
  validate,
  register,
);
router.post(
  '/login',
  (req, res, next) => loginLimiter(req, res, next),
  loginValidation,
  validate,
  login,
);
router.post(
  '/forgotpassword',
  (req, res, next) => loginLimiter(req, res, next),
  forgotPasswordValidation,
  forgotPassword,
);

// Lenient limiting (allow normal usage)
router.get(
  '/me',
  (req, res, next) => sessionLimiter(req, res, next),
  protect,
  getMe,
);
router.post(
  '/refresh',
  (req, res, next) => sessionLimiter(req, res, next),
  refreshToken,
);

// No rate limiting (protected by auth middleware)
router.put('/updatedetails', protect, updateProfileValidation, updateDetails);
router.put(
  '/updatepassword',
  protect,
  updatePasswordValidation,
  updatePassword,
);
router.put(
  '/resetpassword/:resettoken',
  resetPasswordValidation,
  resetPassword,
);
router.get('/verify/:token', verifyEmail);
router.post('/logout', protect, logout);

module.exports = router;
