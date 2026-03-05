/**
 * sentry.js — Sentry error tracking initialisation
 *
 * Must be required BEFORE the Express app is created (server.js, first line).
 * Skipped entirely in test environment to prevent network calls during Jest runs.
 *
 * Environment variables:
 *   SENTRY_DSN  — Sentry project DSN (optional; if absent, Sentry is a no-op)
 */

const Sentry = require('@sentry/node');

if (process.env.NODE_ENV !== 'test') {
  Sentry.init({
    dsn: process.env.SENTRY_DSN || '', // empty string → Sentry silently no-ops
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.2,
    sendDefaultPii: false,
  });

  if (process.env.SENTRY_DSN) {
    // Require logger after this file is safely loaded
    // eslint-disable-next-line global-require
    const logger = require('../config/logger');
    logger.info('Sentry error tracking initialised', {
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0.2,
    });
  }
}

module.exports = Sentry;
