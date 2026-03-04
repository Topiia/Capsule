/**
 * Shared utility for evaluating if an Origin or Referer is trusted.
 * Replaces duplicated logic in CORS and CSRF middlewares.
 *
 * @param {string | undefined | null} origin - The origin string to validate
 * @param {Object} options - Configuration options
 * @param {boolean} options.requireDefinedOrigin - Reject undefined origins
 * @returns {boolean} - True if the origin is trusted, false otherwise
 */
const isTrustedOrigin = (origin, { requireDefinedOrigin = false } = {}) => {
  const { NODE_ENV, ALLOWED_ORIGINS } = process.env;

  // ===== PRODUCTION =====
  if (NODE_ENV === 'production') {
    if (!ALLOWED_ORIGINS) {
      throw new Error('CORS misconfiguration: ALLOWED_ORIGINS not set');
    }

    if (origin === undefined || origin === null) {
      return !requireDefinedOrigin;
    }

    const allowedOrigins = ALLOWED_ORIGINS
      .split(',')
      .map((o) => o.trim().replace(/\/$/, '')); // normalize

    if (allowedOrigins.includes(origin.replace(/\/$/, ''))) {
      return true;
    }

    return false;
  }

  // ===== DEVELOPMENT =====
  // Allow server-to-server, curl, Postman
  if (origin === undefined || origin === null) {
    return !requireDefinedOrigin;
  }

  try {
    const { hostname } = new URL(origin);

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return true;
    }

    return false;
  } catch {
    return false;
  }
};

module.exports = isTrustedOrigin;
