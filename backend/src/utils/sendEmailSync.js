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

  try {
    const result = await resend.emails.send({
      from: `${emailConfig.resend.fromName} <${emailConfig.resend.fromEmail}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    logger.info('Email sent synchronously (fallback)', {
      emailId: result.id,
      to: options.to,
      subject: options.subject,
    });

    return result;
  } catch (error) {
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
