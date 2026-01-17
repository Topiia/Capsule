const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const sendEmail = require('../utils/sendEmail');

// Generate JWT Token
const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, {
  expiresIn: process.env.JWT_EXPIRE,
});

// SECURITY: Generate Refresh Token with rotation tracking
// Embeds tokenFamily and tokenVersion in JWT payload for reuse detection
const generateRefreshToken = (id, tokenFamily, tokenVersion) => jwt.sign(
  {
    id,
    tokenFamily,
    tokenVersion,
  },
  process.env.JWT_REFRESH_SECRET,
  {
    expiresIn: process.env.JWT_REFRESH_EXPIRE,
  },
);

// PRODUCTION FIX: Cookie options for cross-site authentication
// Required for Vercel (frontend) + Render (backend) deployment
const getCookieOptions = (maxAge) => {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    httpOnly: true, // Prevents XSS attacks (JS cannot access)
    secure: isProduction, // HTTPS only in production (required for SameSite=None)
    sameSite: isProduction ? 'none' : 'lax', // Cross-site in prod, same-site in dev
    maxAge, // Expiry time in milliseconds
    // Note: No 'domain' attribute - browser automatically uses backend's domain
    // (vlogsphere-backend.onrender.com). Setting domain='.vercel.app' would fail
    // because backend doesn't own that domain.
  };
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = asyncHandler(async (req, res, next) => {
  const { username, email, password } = req.body;

  // Check if user exists
  const existingUser = await User.findOne({
    $or: [{ email }, { username }],
  });

  if (existingUser) {
    return next(new ErrorResponse('User already exists with this email or username', 400));
  }

  // Create user
  const user = await User.create({
    username,
    email,
    password,
  });

  // Generate verification token
  const verificationToken = crypto.randomBytes(32).toString('hex');
  user.verificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');

  await user.save();

  // SECURITY: Generate tokens with rotation tracking
  // Token family groups related tokens in rotation chain for compromise detection
  // Token version enforces single-use and enables reuse detection
  const token = generateToken(user._id);
  const tokenFamily = crypto.randomBytes(16).toString('hex');
  const tokenVersion = 1;
  const refreshToken = generateRefreshToken(user._id, tokenFamily, tokenVersion);

  // SECURITY: Hash refresh token before storing (prevents database breach replay)
  user.refreshTokenHash = await user.hashRefreshToken(refreshToken);
  user.tokenFamily = tokenFamily;
  user.tokenVersion = tokenVersion;
  user.revokedAt = null;
  await user.save();

  // Send verification email
  if (process.env.EMAIL_HOST || process.env.NODE_ENV === 'development') {
    try {
      const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email/${verificationToken}`;

      await sendEmail({
        to: user.email,
        subject: 'Welcome to VlogSphere - Verify Your Email',
        text: `Hi ${user.username},

Welcome to VlogSphere! We're excited to have you join our community of content creators.

To complete your registration and activate your account, please click the link below:

${verificationUrl}

This verification link will expire in 24 hours.

If you didn't create an account with VlogSphere, please ignore this email.

Best regards,
The VlogSphere Team`,
        html: `
          <h2>Welcome to VlogSphere!</h2>
          <p>Hi ${user.username},</p>
          <p>We're excited to have you join our community of content creators.</p>
          <p>To complete your registration and activate your account, please click the button below:</p>
          <p style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" style="background-color: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Verify Email Address
            </a>
          </p>
          <p>Or copy and paste this link into your browser:</p>
          <p><a href="${verificationUrl}">${verificationUrl}</a></p>
          <p><small>This verification link will expire in 24 hours.</small></p>
          <p>If you didn't create an account with VlogSphere, please ignore this email.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px;">Best regards,<br>The VlogSphere Team</p>
        `,
      });
    } catch (error) {
      console.error('Email sending failed:', error.message);
      // Don't block registration if email fails
    }
  }

  // PRODUCTION FIX: Set cookies with cross-site support
  // Always set cookies (both dev and prod) for consistent behavior
  // Cross-site attributes (SameSite=None; Secure) enable Vercel → Render auth
  res.cookie('token', token, getCookieOptions(7 * 24 * 60 * 60 * 1000)); // 7 days
  res.cookie('refreshToken', refreshToken, getCookieOptions(30 * 24 * 60 * 60 * 1000)); // 30 days

  res.status(201).json({
    success: true,
    message: 'Registration successful',
    token,
    refreshToken,
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      bio: user.bio,
      preferences: user.preferences,
      isVerified: user.isVerified,
      followerCount: user.followerCount,
      followingCount: user.followingCount,
    },
  });
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  // Validate email & password
  if (!email || !password) {
    return next(new ErrorResponse('Please provide an email and password', 400));
  }

  // Check for user
  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    return next(new ErrorResponse('Invalid credentials', 401));
  }

  // Check if password matches
  const isMatch = await user.comparePassword(password);

  if (!isMatch) {
    return next(new ErrorResponse('Invalid credentials', 401));
  }

  // Check if this is first login (no lastLogin set)
  const isFirstLogin = !user.lastLogin;

  // Update last login
  user.lastLogin = Date.now();

  // SECURITY: Generate tokens with rotation tracking
  // Token family groups related tokens in rotation chain for compromise detection
  // Token version enforces single-use and enables reuse detection
  const token = generateToken(user._id);
  const tokenFamily = crypto.randomBytes(16).toString('hex');
  const tokenVersion = 1;
  const refreshToken = generateRefreshToken(user._id, tokenFamily, tokenVersion);

  // SECURITY: Hash refresh token before storing (prevents database breach replay)
  user.refreshTokenHash = await user.hashRefreshToken(refreshToken);
  user.tokenFamily = tokenFamily;
  user.tokenVersion = tokenVersion;
  user.revokedAt = null;
  await user.save();

  // Send welcome email on first login
  if (isFirstLogin && process.env.EMAIL_HOST) {
    try {
      await sendEmail({
        to: user.email,
        subject: 'Welcome to VlogSphere! 🎉',
        text: `Hi ${user.username},

Welcome to VlogSphere! Your account is now active and ready to use.

We're thrilled to have you join our community of content creators. Here are some things you can do to get started:

✨ Create your first vlog
📸 Upload images and videos
🤖 Try our AI auto-tagging feature
👥 Connect with other creators
🔖 Bookmark content you love

If you have any questions or need help getting started, check out our help center or reach out to our support team.

Happy vlogging!

Best regards,
The VlogSphere Team`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #4F46E5;">Welcome to VlogSphere! 🎉</h1>
            <p>Hi ${user.username},</p>
            <p>Welcome to VlogSphere! Your account is now active and ready to use.</p>
            <p>We're thrilled to have you join our community of content creators. Here are some things you can do to get started:</p>
            <ul style="line-height: 2;">
              <li>✨ Create your first vlog</li>
              <li>📸 Upload images and videos</li>
              <li>🤖 Try our AI auto-tagging feature</li>
              <li>👥 Connect with other creators</li>
              <li>🔖 Bookmark content you love</li>
            </ul>
            <p>If you have any questions or need help getting started, check out our help center or reach out to our support team.</p>
            <p style="margin-top: 30px;"><strong>Happy vlogging!</strong></p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            <p style="color: #666; font-size: 12px;">Best regards,<br>The VlogSphere Team</p>
          </div>
        `,
      });
    } catch (error) {
      console.error('Welcome email failed:', error.message);
      // Don't block login if email fails
    }
  }

  // PRODUCTION FIX: Set cookies with cross-site support
  // Always set cookies (both dev and prod) for consistent behavior
  // Cross-site attributes (SameSite=None; Secure) enable Vercel → Render auth
  res.cookie('token', token, getCookieOptions(7 * 24 * 60 * 60 * 1000)); // 7 days
  res.cookie('refreshToken', refreshToken, getCookieOptions(30 * 24 * 60 * 60 * 1000)); // 30 days

  res.status(200).json({
    success: true,
    token,
    refreshToken,
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      bio: user.bio,
      preferences: user.preferences,
      isVerified: user.isVerified,
      followerCount: user.followerCount,
      followingCount: user.followingCount,
    },
  });
});

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = asyncHandler(async (req, res, _next) => {
  const user = await User.findById(req.user.id)
    .populate('followers', 'username avatar')
    .populate('following', 'username avatar');

  res.status(200).json({
    success: true,
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      bio: user.bio,
      preferences: user.preferences,
      isVerified: user.isVerified,
      followerCount: user.followerCount,
      followingCount: user.followingCount,
      followers: user.followers,
      following: user.following,
      createdAt: user.createdAt,
    },
  });
});

// @desc    Update user details
// @route   PUT /api/auth/updatedetails
// @access  Private
exports.updateDetails = asyncHandler(async (req, res, _next) => {
  const {
    username, email, bio, avatar, preferences,
  } = req.body;

  const fieldsToUpdate = {};

  if (username) fieldsToUpdate.username = username;
  if (email) fieldsToUpdate.email = email;
  if (bio !== undefined) fieldsToUpdate.bio = bio;
  if (avatar) fieldsToUpdate.avatar = avatar;
  if (preferences) fieldsToUpdate.preferences = preferences;

  const user = await User.findByIdAndUpdate(
    req.user.id,
    fieldsToUpdate,
    {
      new: true,
      runValidators: true,
    },
  );

  res.status(200).json({
    success: true,
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      bio: user.bio,
      preferences: user.preferences,
      isVerified: user.isVerified,
      followerCount: user.followerCount,
      followingCount: user.followingCount,
    },
  });
});

// @desc    Update password
// @route   PUT /api/auth/updatepassword
// @access  Private
exports.updatePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user.id).select('+password');

  // Check current password
  if (!(await user.comparePassword(currentPassword))) {
    return next(new ErrorResponse('Current password is incorrect', 401));
  }

  user.password = newPassword;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Password updated successfully',
  });
});

// @desc    Forgot password
// @route   POST /api/auth/forgotpassword
// @access  Public
exports.forgotPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email });

  if (!user) {
    // Security: Don't reveal if email exists
    return res.status(200).json({
      success: true,
      message: 'If that email exists, a password reset link has been sent.',
    });
  }

  // Get reset token
  const resetToken = user.generatePasswordResetToken();
  await user.save({ validateBeforeSave: false });

  // Create reset URL - point to frontend
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;

  try {
    await sendEmail({
      to: user.email,
      subject: 'VlogSphere Password Reset Request',
      text: `Hi ${user.username},

You are receiving this email because you (or someone else) has requested a password reset for your VlogSphere account.

Please click the link below to reset your password:

${resetUrl}

This link will expire in 15 minutes.

If you did not request this password reset, please ignore this email and your password will remain unchanged.

Best regards,
The VlogSphere Team`,
      html: `
        <h2>Password Reset Request</h2>
        <p>Hi ${user.username},</p>
        <p>You are receiving this email because you (or someone else) has requested a password reset for your VlogSphere account.</p>
        <p>Please click the button below to reset your password:</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #DC2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Reset Password
          </a>
        </p>
        <p>Or copy and paste this link into your browser:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p><strong style="color: #DC2626;">⏰ This link will expire in 15 minutes.</strong></p>
        <p>If you did not request this password reset, please ignore this email and your password will remain unchanged.</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #666; font-size: 12px;">Best regards,<br>The VlogSphere Team</p>
      `,
    });

    // Email sent successfully
    res.status(200).json({
      success: true,
      message: 'Password reset email sent',
    });
  } catch (err) {
    // SECURITY: Log error internally but don't expose to user
    console.error({
      level: 'error',
      service: 'email',
      event: 'password_reset_send_failed',
      user_id: user._id,
      username: user.username,
      error: err.message,
      timestamp: new Date().toISOString(),
    });

    // DO NOT clear reset token - allow user to retry
    // Token will expire naturally in 15 minutes

    // SECURITY: Return same success message even if email fails
    // This prevents email enumeration attacks
    res.status(200).json({
      success: true,
      message: 'If that email exists, a password reset link has been sent.',
    });
  }
});

// @desc    Reset password
// @route   PUT /api/auth/resetpassword/:resettoken
// @access  Public
exports.resetPassword = asyncHandler(async (req, res, next) => {
  // Get hashed token
  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(req.params.resettoken)
    .digest('hex');

  const user = await User.findOne({
    passwordResetToken: resetPasswordToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  if (!user) {
    return next(new ErrorResponse('Invalid or expired token', 400));
  }

  // SECURITY: Check if token has already been used (single-use enforcement)
  if (user.passwordResetUsed) {
    console.warn(`[SECURITY] Attempted reuse of password reset token - User: ${user.username}`);
    return next(new ErrorResponse('This password reset link has already been used. Please request a new one.', 400));
  }

  // Set new password
  user.password = req.body.password;

  // SECURITY: Mark token as used to prevent reuse
  user.passwordResetUsed = true;

  // Clear reset token fields
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;

  await user.save();

  res.status(200).json({
    success: true,
    message: 'Password reset successful',
  });
});

// @desc    Verify email
// @route   GET /api/auth/verify/:token
// @access  Public
exports.verifyEmail = asyncHandler(async (req, res, next) => {
  const verificationToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    verificationToken,
    isVerified: false,
  });

  if (!user) {
    return next(new ErrorResponse('Invalid verification token', 400));
  }

  user.isVerified = true;
  user.isActive = true;
  user.verificationToken = undefined;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Email verified successfully',
  });
});
