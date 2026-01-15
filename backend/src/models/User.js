const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username cannot exceed 30 characters'],
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'],
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email'],
  },
  isActive: {
    type: Boolean,
    default: true,
  },

  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
  },
  avatar: {
    type: String,
    default: '',
  },
  bio: {
    type: String,
    maxlength: [500, 'Bio cannot exceed 500 characters'],
    default: '',
  },
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  following: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  bookmarks: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vlog',
  }],
  // SECURITY: Refresh token rotation and secure storage
  // Tokens are stored as bcrypt hashes to prevent replay attacks from database breaches
  refreshTokenHash: {
    type: String,
    default: '',
  },
  // Token family groups related tokens in a rotation chain
  // Used to detect when an old token in the chain is reused (compromise indicator)
  tokenFamily: {
    type: String,
    default: '',
  },
  // Token version increments on each refresh, enforcing single-use tokens
  // If client presents old version, it indicates token reuse (security violation)
  tokenVersion: {
    type: Number,
    default: 0,
  },
  // Set when session is revoked due to compromise detection or logout
  // Any token with matching tokenFamily is rejected if revokedAt is set
  revokedAt: {
    type: Date,
    default: null,
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  verificationToken: {
    type: String,
    default: '',
  },
  // SECURITY: Password reset tokens - single-use enforcement
  passwordResetToken: {
    type: String,
    default: '',
  },
  passwordResetExpires: {
    type: Date,
    default: null,
  },
  passwordResetUsed: {
    type: Boolean,
    default: false,
  },
  lastLogin: {
    type: Date,
    default: Date.now,
  },
  preferences: {
    theme: {
      type: String,
      enum: ['noir-velvet', 'deep-space', 'crimson-night', 'light'],
      default: 'noir-velvet',
    },
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      follows: { type: Boolean, default: true },
      comments: { type: Boolean, default: true },
    },
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Virtual for follower count
userSchema.virtual('followerCount').get(function getFollowerCount() {
  return this.followers ? this.followers.length : 0;
});

// Virtual for following count
userSchema.virtual('followingCount').get(function getFollowingCount() {
  return this.following ? this.following.length : 0;
});

// Pre-save middleware to hash password
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// SECURITY: Generate single-use password reset token
// Token is valid for 10 minutes and can only be used once
userSchema.methods.generatePasswordResetToken = function generatePasswordResetToken() {
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  this.passwordResetExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
  this.passwordResetUsed = false; // Reset flag when new token generated
  return resetToken;
};

// SECURITY: Hash refresh token before storing in database
// Uses bcrypt to ensure database breach cannot replay tokens
userSchema.methods.hashRefreshToken = async function hashRefreshToken(token) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(token, salt);
};

// SECURITY: Revoke all active sessions for this user
// Called when token reuse is detected or user explicitly logs out
// Sets revokedAt timestamp to prevent any token in current family from working
userSchema.methods.revokeAllSessions = function revokeAllSessions() {
  this.revokedAt = Date.now();
  this.tokenVersion = 0;
  this.tokenFamily = '';
  this.refreshTokenHash = '';
};

// Index for performance
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ createdAt: -1 });

module.exports = mongoose.model('User', userSchema);
