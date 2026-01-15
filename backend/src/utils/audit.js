const AuditLog = require('../models/AuditLog');

/**
 * SECURITY & COMPLIANCE: Audit Logging Utilities
 *
 * Provides functions to log user actions and system events
 * for security monitoring, compliance, and incident investigation.
 */

/**
 * Log an audit event
 *
 * @param {object} params - Audit event parameters
 * @param {string} params.userId - User ID who performed the action
 * @param {string} params.action - Action type (from AuditLog enum)
 * @param {string} params.resourceType - Type of resource affected
 * @param {string} params.resourceId - ID of affected resource
 * @param {object} params.changes - Before/after data for updates
 * @param {string} params.ipAddress - Client IP address
 * @param {string} params.userAgent - Client user agent
 * @param {object} params.metadata - Additional context
 * @param {boolean} params.success - Whether action succeeded
 * @param {string} params.errorMessage - Error message if failed
 * @returns {Promise<AuditLog>} - Created audit log entry
 */
exports.logAudit = async ({
  userId,
  action,
  resourceType = 'N/A',
  resourceId = null,
  changes = {},
  ipAddress,
  userAgent = '',
  metadata = {},
  success = true,
  errorMessage = null,
}) => {
  try {
    const auditLog = await AuditLog.create({
      userId,
      action,
      resourceType,
      resourceId,
      changes,
      ipAddress,
      userAgent,
      metadata,
      success,
      errorMessage,
    });

    return auditLog;
  } catch (error) {
    // CRITICAL: Never let audit logging failures break the application
    // Log to console for troubleshooting but don't throw
    console.error('[AUDIT] Failed to create audit log:', error.message);
    return null;
  }
};

/**
 * Log vlog creation
 */
exports.logVlogCreate = async (userId, vlogId, ipAddress, userAgent) => exports.logAudit({
  userId,
  action: 'VLOG_CREATE',
  resourceType: 'Vlog',
  resourceId: vlogId,
  ipAddress,
  userAgent,
});

/**
 * Log vlog update with before/after data
 */
// eslint-disable-next-line max-len
exports.logVlogUpdate = async (userId, vlogId, beforeData, afterData, ipAddress, userAgent) => exports.logAudit({
  userId,
  action: 'VLOG_UPDATE',
  resourceType: 'Vlog',
  resourceId: vlogId,
  changes: {
    before: beforeData,
    after: afterData,
  },
  ipAddress,
  userAgent,
});

/**
 * Log vlog deletion (CRITICAL - preserve for recovery)
 */
exports.logVlogDelete = async (userId, vlogId, vlogData, ipAddress, userAgent) => exports.logAudit({
  userId,
  action: 'VLOG_DELETE',
  resourceType: 'Vlog',
  resourceId: vlogId,
  changes: {
    deletedData: vlogData, // Store full vlog for potential recovery
  },
  ipAddress,
  userAgent,
});

/**
 * Log user registration
 */
exports.logUserRegister = async (userId, ipAddress, userAgent) => exports.logAudit({
  userId,
  action: 'USER_REGISTER',
  resourceType: 'User',
  resourceId: userId,
  ipAddress,
  userAgent,
});

/**
 * Log successful login
 */
exports.logUserLogin = async (userId, ipAddress, userAgent) => exports.logAudit({
  userId,
  action: 'USER_LOGIN',
  resourceType: 'User',
  resourceId: userId,
  ipAddress,
  userAgent,
});

/**
 * Log failed login attempt (SECURITY)
 */
exports.logFailedLogin = async (email, ipAddress, userAgent, reason) => exports.logAudit({
  userId: null, // No valid user for failed login
  action: 'FAILED_LOGIN',
  resourceType: 'N/A',
  metadata: { email, reason },
  ipAddress,
  userAgent,
  success: false,
  errorMessage: reason,
});

/**
 * Log password reset request
 */
exports.logPasswordResetRequest = async (userId, ipAddress, userAgent) => exports.logAudit({
  userId,
  action: 'USER_PASSWORD_RESET_REQUEST',
  resourceType: 'User',
  resourceId: userId,
  ipAddress,
  userAgent,
});

/**
 * Log password reset completion
 */
exports.logPasswordResetComplete = async (userId, ipAddress, userAgent) => exports.logAudit({
  userId,
  action: 'USER_PASSWORD_RESET_COMPLETE',
  resourceType: 'User',
  resourceId: userId,
  ipAddress,
  userAgent,
});

/**
 * Log password change
 */
exports.logPasswordChange = async (userId, ipAddress, userAgent) => exports.logAudit({
  userId,
  action: 'USER_UPDATE_PASSWORD',
  resourceType: 'User',
  resourceId: userId,
  ipAddress,
  userAgent,
});

/**
 * Log comment deletion
 */
// eslint-disable-next-line max-len
exports.logCommentDelete = async (userId, commentId, commentData, ipAddress, userAgent) => exports.logAudit({
  userId,
  action: 'COMMENT_DELETE',
  resourceType: 'Comment',
  resourceId: commentId,
  changes: {
    deletedData: commentData,
  },
  ipAddress,
  userAgent,
});

/**
 * Log security event (token reuse, suspicious activity, etc.)
 */
// eslint-disable-next-line max-len
exports.logSecurityEvent = async (userId, action, details, ipAddress, userAgent) => exports.logAudit({
  userId,
  action,
  resourceType: 'Session',
  metadata: details,
  ipAddress,
  userAgent,
  success: false,
});

/**
 * Query audit logs for a user
 *
 * @param {string} userId - User ID
 * @param {number} limit - Max results
 * @returns {Promise<Array>} - Audit log entries
 */
exports.getUserAuditLogs = async (userId, limit = 100) => AuditLog.find({ userId })
  .sort({ timestamp: -1 })
  .limit(limit)
  .lean();

/**
 * Query audit logs for a resource
 *
 * @param {string} resourceType - Resource type
 * @param {string} resourceId - Resource ID
 * @returns {Promise<Array>} - Audit log entries
 */
// eslint-disable-next-line max-len
exports.getResourceAuditLogs = async (resourceType, resourceId) => AuditLog.find({ resourceType, resourceId })
  .sort({ timestamp: -1 })
  .limit(50)
  .lean();

/**
 * Helper to extract client IP and user agent from request
 */
exports.getClientInfo = (req) => {
  const ipAddress = req.ip
    || req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.connection?.remoteAddress
    || 'unknown';

  const userAgent = req.headers['user-agent'] || '';

  return { ipAddress, userAgent };
};

module.exports = exports;
