const { Resend } = require('resend');
const logger = require('../config/logger');
const emailConfig = require('../config/email');

// Resend client for synchronous fallback
const resend = new Resend(emailConfig.resend.apiKey);

/**
 * Send email synchronously via Resend
 * Used as fallback when Redis queue is unavailable
 *
 * @param {object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} options.text - Plain text content
 * @returns {Promise<object>} - Resend API response
 */
const sendEmailSync = async (options) => {
  if (!emailConfig.validateEmailConfig()) {
    throw new Error('Email service not configured - RESEND_API_KEY missing');
  }

  // ─── [FP] Phase 3 — Email Provider Timing (sync-fallback path) ────────────
  const EMAIL_API_START = Date.now();
  console.log(`[FP] EMAIL_API_START  (sync-fallback)  to=${options.to}  subject="${options.subject}"  (${new Date(EMAIL_API_START).toISOString()})`);

  try {
    const result = await resend.emails.send({
      from: `${emailConfig.resend.fromName} <${emailConfig.resend.fromEmail}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    // ─── [FP] Phase 3 — Provider response received ─────────────────────────
    const EMAIL_API_DONE = Date.now();
    const providerLatency = EMAIL_API_DONE - EMAIL_API_START;
    console.log(`[FP] EMAIL_API_DONE  (sync-fallback)  emailId=${result && result.id}  providerLatency=${providerLatency}ms  (${new Date(EMAIL_API_DONE).toISOString()})`);

    logger.info('Email sent synchronously (fallback)', {
      emailId: result.id,
      to: options.to,
      subject: options.subject,
      providerLatencyMs: providerLatency,
    });

    return result;
  } catch (error) {
    const EMAIL_API_FAIL = Date.now();
    const failLatency = EMAIL_API_FAIL - EMAIL_API_START;
    console.log(`[FP] EMAIL_API_FAIL  (sync-fallback)  error=${error.message}  latency=${failLatency}ms  (${new Date(EMAIL_API_FAIL).toISOString()})`);

    logger.error('Synchronous email send failed', {
      to: options.to,
      subject: options.subject,
      error: error.message,
    });
    throw error;
  }
};

module.exports = {
  sendEmailSync,
};
