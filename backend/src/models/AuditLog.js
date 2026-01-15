const mongoose = require('mongoose');

/**
 * SECURITY & COMPLIANCE: Audit Log Schema
 *
 * Tracks all destructive and sensitive operations for:
 * - Security incident investigation
 * - Compliance requirements (GDPR, SOC2)
 * - User activity monitoring
 * - Data recovery support
 */

const auditLogSchema = new mongoose.Schema({
  // Who performed the action
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },

  // What action was performed
  action: {
    type: String,
    required: true,
    enum: [
      // Vlog actions
      'VLOG_CREATE',
      'VLOG_UPDATE',
      'VLOG_DELETE',
      'VLOG_PUBLISH',

      // User actions
      'USER_REGISTER',
      'USER_LOGIN',
      'USER_LOGOUT',
      'USER_UPDATE_PROFILE',
      'USER_UPDATE_PASSWORD',
      'USER_DELETE_ACCOUNT',
      'USER_PASSWORD_RESET_REQUEST',
      'USER_PASSWORD_RESET_COMPLETE',

      // Comment actions
      'COMMENT_CREATE',
      'COMMENT_DELETE',

      // Moderation actions
      'USER_BAN',
      'USER_UNBAN',
      'CONTENT_FLAG',
      'CONTENT_REMOVE',

      // Security events
      'FAILED_LOGIN',
      'TOKEN_REUSE_DETECTED',
      'SUSPICIOUS_ACTIVITY',
      'RATE_LIMIT_EXCEEDED',
    ],
    index: true,
  },

  // Resource details
  resourceType: {
    type: String,
    enum: ['Vlog', 'User', 'Comment', 'Session', 'N/A'],
    required: true,
  },

  resourceId: {
    type: String,
    sparse: true,
    index: true,
  },

  // Change details (before/after for updates)
  changes: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },

  // Request context
  ipAddress: {
    type: String,
    required: true,
  },

  userAgent: {
    type: String,
    default: '',
  },

  // Additional metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },

  // Success or failure
  success: {
    type: Boolean,
    default: true,
  },

  errorMessage: {
    type: String,
    default: null,
  },

  // Timestamp (auto-indexed)
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
    expires: 7776000, // Auto-delete after 90 days (compliance retention)
  },
}, {
  timestamps: false, // Using custom timestamp field
});

// Compound indexes for common queries
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ resourceType: 1, resourceId: 1 });

// Prevent modification of audit logs
auditLogSchema.pre('save', function (next) {
  if (!this.isNew) {
    return next(new Error('Audit logs cannot be modified'));
  }
  next();
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
