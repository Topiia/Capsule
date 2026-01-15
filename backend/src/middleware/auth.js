const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const asyncHandler = require('./asyncHandler');
const ErrorResponse = require('../utils/errorResponse');

// Protect routes - requires valid JWT token
exports.protect = asyncHandler(async (req, res, next) => {
  let token;

  // Check for token in Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  // Check for token in cookies
  else if (req.cookies.token) {
    token = req.cookies.token;
  }

  // Make sure token exists
  if (!token) {
    return next(new ErrorResponse('Not authorized to access this route', 401));
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if user still exists
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return next(new ErrorResponse('User no longer exists', 401));
    }

    // SECURITY FIX: Only auto-activate in development mode
    // In production, inactive users should remain inactive
    if (process.env.NODE_ENV === 'development') {
      // Auto-activate for easier development
      if (typeof user.isActive === 'undefined' || user.isActive === false) {
        user.isActive = true;
        try { await User.findByIdAndUpdate(user._id, { isActive: true }); } catch (err) { /* ignore */ }
      }
    } else if (!user.isActive) {
      // Production: reject inactive users
      return next(new ErrorResponse('Account has been deactivated. Please contact support.', 403));
    }

    req.user = user;
    next();
  } catch (error) {
    return next(new ErrorResponse('Not authorized to access this route', 401));
  }
});

// Grant access to specific roles
exports.authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(new ErrorResponse(`User role ${req.user.role} is not authorized to access this route`, 403));
  }
  next();
};

// Optional authentication - doesn't require token but loads user if provided
exports.optionalAuth = asyncHandler(async (req, res, next) => {
  let token;

  // Check for token in Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  // Check for token in cookies
  else if (req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return next();
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if user still exists
    const user = await User.findById(decoded.id).select('-password');
    if (user && user.isActive) {
      req.user = user;
    }

    next();
  } catch (error) {
    // Token is invalid, but we don't throw error since auth is optional
    next();
  }
});

// SECURITY: Refresh token rotation middleware with reuse detection
// Implements single-use tokens, bcrypt verification, and session revocation on compromise
exports.refreshToken = asyncHandler(async (req, res, next) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return next(new ErrorResponse('Refresh token is required', 401));
  }

  try {
    // SECURITY: Verify JWT signature and decode payload
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // Extract token family and version from JWT payload
    const { id, tokenFamily, tokenVersion } = decoded;

    // Check if user exists
    const user = await User.findById(id).select('-password');
    if (!user) {
      return next(new ErrorResponse('User not found', 401));
    }

    // SECURITY: Check if session has been revoked (compromise or logout)
    if (user.revokedAt) {
      console.warn(`[SECURITY] Attempted use of revoked token - User: ${user.username}, TokenFamily: ${tokenFamily}`);
      return next(new ErrorResponse('Session has been revoked. Please log in again.', 401));
    }

    // SECURITY: Verify token family matches (prevents cross-session token use)
    if (user.tokenFamily !== tokenFamily) {
      console.warn(`[SECURITY] Token family mismatch - User: ${user.username}, Expected: ${user.tokenFamily}, Got: ${tokenFamily}`);
      return next(new ErrorResponse('Invalid refresh token', 401));
    }

    // SECURITY: Hash incoming token and compare with stored hash using bcrypt
    // Constant-time comparison prevents timing attacks
    const isValidToken = await bcrypt.compare(refreshToken, user.refreshTokenHash);

    if (!isValidToken) {
      console.warn(`[SECURITY] Token hash mismatch - User: ${user.username}`);
      return next(new ErrorResponse('Invalid refresh token', 401));
    }

    // SECURITY: REUSE DETECTION - Check token version
    // If stored version > presented version, token is old (already used)
    // This indicates compromise - revoke all sessions immediately
    if (user.tokenVersion > tokenVersion) {
      console.error(`[SECURITY BREACH] Token reuse detected - User: ${user.username}, Stored: ${user.tokenVersion}, Presented: ${tokenVersion}`);
      console.error(`[SECURITY BREACH] Revoking all sessions for user: ${user.username}`);

      // Revoke all active sessions
      user.revokeAllSessions();
      await user.save();

      return next(new ErrorResponse('Token reuse detected. All sessions have been revoked for security. Please log in again.', 401));
    }

    // SECURITY: Enforce single-use - version must match exactly
    if (user.tokenVersion !== tokenVersion) {
      console.warn(`[SECURITY] Token version mismatch - User: ${user.username}, Expected: ${user.tokenVersion}, Got: ${tokenVersion}`);
      return next(new ErrorResponse('Invalid refresh token', 401));
    }

    // Token is valid - proceed with rotation

    // Generate new access token
    const newAccessToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE,
    });

    // SECURITY: Increment token version (enforces single-use)
    const newTokenVersion = user.tokenVersion + 1;

    // SECURITY: Generate new refresh token with same family (maintains rotation chain)
    const newRefreshToken = jwt.sign(
      {
        id: user._id,
        tokenFamily: user.tokenFamily,
        tokenVersion: newTokenVersion,
      },
      process.env.JWT_REFRESH_SECRET,
      {
        expiresIn: process.env.JWT_REFRESH_EXPIRE,
      },
    );

    // SECURITY: Hash new refresh token before storing
    user.refreshTokenHash = await user.hashRefreshToken(newRefreshToken);
    user.tokenVersion = newTokenVersion;
    await user.save();

    console.log(`[AUTH] Token refresh successful - User: ${user.username}, New version: ${newTokenVersion}`);

    res.status(200).json({
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
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
  } catch (error) {
    // JWT verification failed (expired, invalid signature, etc.)
    if (error.name === 'JsonWebTokenError') {
      return next(new ErrorResponse('Invalid refresh token', 401));
    }
    if (error.name === 'TokenExpiredError') {
      return next(new ErrorResponse('Refresh token has expired. Please log in again.', 401));
    }
    // Other errors
    console.error('[AUTH] Refresh token error:', error);
    return next(new ErrorResponse('Token refresh failed', 401));
  }
});

// SECURITY: Logout middleware - revokes all active sessions
exports.logout = asyncHandler(async (req, res, next) => {
  if (req.user) {
    // SECURITY: Revoke all sessions for this user
    // This prevents any existing refresh tokens from being used
    const user = await User.findById(req.user._id);
    user.revokeAllSessions();
    await user.save();

    console.log(`[AUTH] User logged out - Sessions revoked: ${user.username}`);
  }

  // Clear cookies
  res.cookie('token', '', { maxAge: 0 });
  res.cookie('refreshToken', '', { maxAge: 0 });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
});
