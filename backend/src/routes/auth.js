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

// Routes
router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.get('/me', protect, getMe);
router.put('/updatedetails', protect, updateProfileValidation, updateDetails);
router.put('/updatepassword', protect, updatePasswordValidation, updatePassword);
router.post('/forgotpassword', forgotPasswordValidation, forgotPassword);
router.put('/resetpassword/:resettoken', resetPasswordValidation, resetPassword);
router.get('/verify/:token', verifyEmail);
router.post('/refresh', refreshToken);
router.post('/logout', protect, logout);

module.exports = router;
