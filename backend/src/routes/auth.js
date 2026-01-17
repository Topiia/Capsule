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
} = require('../middleware/validation');

// Import rate limiters (defined in server.js, exported via app.locals)
// We'll pass them from server.js instead
let loginLimiter;
let sessionLimiter;

// Export function to set limiters from server.js
router.setLimiters = (loginLim, sessionLim) => {
  loginLimiter = loginLim;
  sessionLimiter = sessionLim;
};

// Routes with appropriate rate limiting
// Strict limiting (prevent brute force)
router.post('/register', loginLimiter, registerValidation, register);
router.post('/login', loginLimiter, loginValidation, login);
router.post('/forgotpassword', loginLimiter, forgotPasswordValidation, forgotPassword);

// Lenient limiting (allow normal usage)
router.get('/me', sessionLimiter, protect, getMe);
router.post('/refresh', sessionLimiter, refreshToken);

// No rate limiting (protected by auth middleware)
router.put('/updatedetails', protect, updateProfileValidation, updateDetails);
router.put('/updatepassword', protect, updatePasswordValidation, updatePassword);
router.put('/resetpassword/:resettoken', resetPasswordValidation, resetPassword);
router.get('/verify/:token', verifyEmail);
router.post('/logout', protect, logout);

module.exports = router;
