const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const { sendEmail } = require('../utils/sendEmail');
const { queuePasswordResetEmail } = require('../queues/emailQueue');

// Generate JWT Token — uses fallback so undefined JWT_EXPIRE never crashes jwt.sign
const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET || 'testsecret', {
  expiresIn: process.env.JWT_EXPIRE || '7d',
});

// SECURITY: Generate Refresh Token with rotation tracking
// Embeds tokenFamily and tokenVersion in JWT payload for reuse detection
const generateRefreshToken = (id, tokenFamily, tokenVersion) => jwt.sign(
  {
    id,
    tokenFamily,
    tokenVersion,
  },
  process.env.JWT_REFRESH_SECRET || 'refreshsecret',
  {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d',
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
    // (capsule-backend.onrender.com). Setting domain='.vercel.app' would fail
    // because backend doesn't own that domain.
  };
};

// Helper to set both auth cookies (DRY principle)
const setCookies = (res, token, refreshToken) => {
  res.cookie('token', token, getCookieOptions(7 * 24 * 60 * 60 * 1000)); // 7 days
  res.cookie(
    'refreshToken',
    refreshToken,
    getCookieOptions(30 * 24 * 60 * 60 * 1000),
  ); // 30 days
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
    return next(
      new ErrorResponse('User already exists with this email or username', 400),
    );
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

  // SECURITY: Generate tokens with rotation tracking
  // Token family groups related tokens in rotation chain for compromise detection
  // Token version enforces single-use and enables reuse detection
  const token = generateToken(user._id);
  const tokenFamily = crypto.randomBytes(16).toString('hex');
  const tokenVersion = 1;
  const refreshToken = generateRefreshToken(
    user._id,
    tokenFamily,
    tokenVersion,
  );

  // SECURITY: Hash refresh token before storing (prevents database breach replay)
  user.refreshTokenHash = await user.hashRefreshToken(refreshToken);
  user.tokenFamily = tokenFamily;
  user.tokenVersion = tokenVersion;
  user.revokedAt = null;

  // Single save operation to prevent double-hashing password
  await user.save();

  // Send verification email — skip entirely in test env to avoid external calls
  if (process.env.NODE_ENV !== 'test' && (process.env.EMAIL_HOST || process.env.NODE_ENV === 'development')) {
    try {
      const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email/${verificationToken}`;

      await sendEmail({
        to: user.email,
        subject: 'Welcome to Capsule - Verify Your Email',
        text: `Hi ${user.username},

Welcome to Capsule! We're excited to have you join our community of content creators.

To complete your registration and activate your account, please click the link below:

${verificationUrl}

This verification link will expire in 24 hours.

If you didn't create an account with Capsule, please ignore this email.

Best regards,
The Capsule Team`,
        html: `
          <h2>Welcome to Capsule!</h2>
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
          <p>If you didn't create an account with Capsule, please ignore this email.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px;">Best regards,<br>The Capsule Team</p>
        `,
      });
    } catch (error) {
      console.error('Email sending failed:', error.message);
      // Don't block registration if email fails
    }
  }

  // Set auth cookies
  setCookies(res, token, refreshToken);

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
      role: user.role,
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
  const refreshToken = generateRefreshToken(
    user._id,
    tokenFamily,
    tokenVersion,
  );

  // SECURITY: Hash refresh token before storing (prevents database breach replay)
  user.refreshTokenHash = await user.hashRefreshToken(refreshToken);
  user.tokenFamily = tokenFamily;
  user.tokenVersion = tokenVersion;
  user.revokedAt = null;
  await user.save();

  // Send welcome email on first login — skip in test env
  if (isFirstLogin && process.env.NODE_ENV !== 'test' && process.env.EMAIL_HOST) {
    try {
      await sendEmail({
        to: user.email,
        subject: 'Welcome to Capsule! 🎉',
        text: `Hi ${user.username},

Welcome to Capsule! Your account is now active and ready to use.

We're thrilled to have you join our community of content creators. Here are some things you can do to get started:

✨ Create your first vlog
📸 Upload images and videos
🤖 Try our AI auto-tagging feature
👥 Connect with other creators
🔖 Bookmark content you love

If you have any questions or need help getting started, check out our help center or reach out to our support team.

Happy vlogging!

Best regards,
The Capsule Team`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #4F46E5;">Welcome to Capsule! 🎉</h1>
            <p>Hi ${user.username},</p>
            <p>Welcome to Capsule! Your account is now active and ready to use.</p>
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
            <p style="color: #666; font-size: 12px;">Best regards,<br>The Capsule Team</p>
          </div>
        `,
      });
    } catch (error) {
      console.error('Welcome email failed:', error.message);
      // Don't block login if email fails
    }
  }

  // Set auth cookies
  setCookies(res, token, refreshToken);

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
      role: user.role,
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
      role: user.role,
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

  const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, {
    new: true,
    runValidators: true,
  });

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
      role: user.role,
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
  // ─── [FP] PHASE 1 — Request Lifecycle Timing ────────────────────────────
  const FP_START = Date.now();
  const fp = (label) => {
    const elapsed = Date.now() - FP_START;
    console.log(`[FP] ${label} +${elapsed}ms  (${new Date().toISOString()})`);
  };

  fp('REQUEST_START');
  fp('BODY_PARSED'); // Body already parsed by Express middleware before controller runs

  // ─── [FP] MISSING SIGNAL 1 — HTTP Socket Completion Listeners ───────────
  // Attach immediately so they fire on EVERY exit path (success, error, timeout)
  res.on('finish', () => {
    console.log(`[FP] RES_FINISH  +${Date.now() - FP_START}ms  (${new Date().toISOString()})  statusCode=${res.statusCode}`);
  });
  res.on('close', () => {
    console.log(`[FP] RES_CLOSE  +${Date.now() - FP_START}ms  (${new Date().toISOString()})  finished=${res.writableFinished}`);
  });
  res.on('error', (socketErr) => {
    console.log(`[FP] RES_ERROR  +${Date.now() - FP_START}ms  (${new Date().toISOString()})  err=${socketErr.message}`);
  });

  // ─── [FP] PHASE 4 — Redis Health Snapshot ───────────────────────────────
  // Capture Redis state at the moment the request executes
  try {
    // eslint-disable-next-line global-require
    const { createRedisClient } = require('../config/redis');
    const redisSnap = createRedisClient();
    const redisStatus = redisSnap ? redisSnap.status : 'not-created';
    const redisAvailable = redisSnap && typeof redisSnap.isAvailable === 'function'
      ? redisSnap.isAvailable()
      : 'unknown';
    console.log(`[FP] REDIS_STATUS  status=${redisStatus}  available=${redisAvailable}  +${Date.now() - FP_START}ms  (${new Date().toISOString()})`);
  } catch (redisErr) {
    console.log(`[FP] REDIS_STATUS  ERROR: ${redisErr.message}  +${Date.now() - FP_START}ms`);
  }

  // ─── [FP] PHASE 3a — DB: User Lookup ────────────────────────────────────
  fp('USER_LOOKUP_START');
  const user = await User.findOne({ email: req.body.email });
  fp('USER_LOOKUP_DONE');

  if (!user) {
    fp('RESPONSE_SENDING'); // Early exit — no user found
    console.log(`[FP] BEFORE_RES_JSON  +${Date.now() - FP_START}ms`);
    // Security: Don't reveal if email exists
    const earlyRes = res.status(200).json({
      success: true,
      message: 'If that email exists, a password reset link has been sent.',
    });
    console.log(`[FP] AFTER_RES_JSON  +${Date.now() - FP_START}ms`);
    fp('RESPONSE_SENT');
    return earlyRes;
  }

  // ─── [FP] Token Generation ───────────────────────────────────────────────
  fp('TOKEN_GENERATED'); // generatePasswordResetToken is synchronous

  // Get reset token
  const resetToken = user.generatePasswordResetToken();

  // ─── [FP] PHASE 3b — DB: Token Save ─────────────────────────────────────
  fp('TOKEN_SAVE_START');
  await user.save({ validateBeforeSave: false });
  fp('TOKEN_SAVE_DONE');
  fp('TOKEN_SAVED');

  // Create reset URL - point to frontend
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;
  // ─── [FP] Part 5 — Reset Link Verification ───────────────────────────────
  console.log(`[FP] RESET_URL: ${resetUrl}  +${Date.now() - FP_START}ms`);

  // ─── [FP] PHASE 3c — Queue Operations (FIRE AND FORGET) ─────────────────
  // eslint-disable-next-line global-require
  const { isQueueAvailable } = require('../queues/emailQueue');
  const _qReady = isQueueAvailable();
  console.log(`[FP] QUEUE_STATE  queueReady=${_qReady}  emailQueue=${_qReady ? 'exists' : 'null'}  queue=email  +${Date.now() - FP_START}ms  (${new Date().toISOString()})`);

  // CRITICAL: Do NOT await email sending.
  // Email is a side-effect — it must NEVER block the HTTP response.
  // Token is already saved; response goes out now regardless of email outcome.
  if (process.env.NODE_ENV !== 'test') {
    fp('QUEUE_ADD_START');
    queuePasswordResetEmail(user.email, resetUrl)
      .then(() => {
        fp('QUEUE_ADD_DONE');
      })
      .catch((err) => {
        fp('QUEUE_ADD_DONE'); // Mark done even on failure
        // SECURITY: log internally, never expose to user
        console.error({
          level: 'error',
          service: 'email',
          event: 'password_reset_send_failed',
          user_id: user._id,
          username: user.username,
          error: err.message,
          timestamp: new Date().toISOString(),
        });
        // Token remains valid — user can retry forgot-password
      });
  }

  // ─── [FP] PHASE 2 — HTTP Response (sent immediately, before email) ────────
  fp('RESPONSE_SENDING');
  console.log(`[FP] BEFORE_RES_JSON  +${Date.now() - FP_START}ms`);
  // SECURITY: Always return same message regardless of email outcome or whether
  // account exists — prevents email enumeration attacks
  res.status(200).json({
    success: true,
    message: 'If that email exists, a password reset link has been sent.',
  });
  console.log(`[FP] AFTER_RES_JSON  +${Date.now() - FP_START}ms`);
  fp('RESPONSE_SENT');
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
    console.warn(
      `[SECURITY] Attempted reuse of password reset token - User: ${user.username}`,
    );
    return next(
      new ErrorResponse(
        'This password reset link has already been used. Please request a new one.',
        400,
      ),
    );
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
