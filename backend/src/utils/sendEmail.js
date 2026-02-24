const { Resend } = require('resend');
const emailConfig = require('../config/email');

let resendInstance;

function getResendClient() {
  if (!resendInstance) {
    resendInstance = new Resend(process.env.RESEND_API_KEY);
  }
  return resendInstance;
}

/**
 * Send email using Resend API
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text content
 * @param {string} options.html - HTML content
 * @returns {Promise} - Resend API response
 */
const sendEmail = async (options) => {
  try {
    // Validate API key exists
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY not configured');
    }

    const resend = getResendClient();

    // Send email via Resend API
    const data = await resend.emails.send({
      from: `${emailConfig.resend.fromName} <${emailConfig.resend.fromEmail}>`,
      to: options.to,
      subject: options.subject,
      html: options.html || options.text.replace(/\n/g, '<br>'),
      text: options.text,
    });

    // Log success in development
    if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
      console.log('\n✅ [EMAIL SENT via Resend]');
      console.log(`   To: ${options.to}`);
      console.log(`   Subject: ${options.subject}`);
      console.log(`   Message ID: ${data.id}`);
      console.log('');
    }

    return data;
  } catch (error) {
    // Log error internally but don't expose details
    if (process.env.NODE_ENV !== 'test') {
      console.error('\n❌ [EMAIL ERROR]:', error.message);
      console.error({
        level: 'error',
        service: 'resend',
        event: 'email_send_failed',
        to: options.to,
        subject: options.subject,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }

    // Throw error so caller can handle
    throw new Error(`Email delivery failed: ${error.message}`);
  }
};

module.exports = {
  sendEmail,
  getResendClient,
};
