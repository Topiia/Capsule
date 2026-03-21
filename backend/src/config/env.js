/**
 * env.js — Centralized environment variable config with safe fallbacks
 *
 * IMPORTANT: All exports are FUNCTIONS or GETTERS so they read process.env
 * at call time, not at import time. This ensures that test files which set
 * process.env.JWT_SECRET in beforeAll() are honoured correctly.
 *
 * Tests can run with ZERO .env file using these safe placeholder values.
 *
 * FAILURE BOUNDARIES:
 *   CRITICAL vars  → process.exit(1) if missing in production
 *   OPTIONAL vars  → warn only, app runs degraded
 */

module.exports = {
  get NODE_ENV() { return process.env.NODE_ENV || 'test'; },
  get JWT_SECRET() {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET must be defined in environment variables');
    }
    return process.env.JWT_SECRET;
  },
  get JWT_REFRESH_SECRET() {
    if (!process.env.JWT_REFRESH_SECRET) {
      throw new Error('JWT_REFRESH_SECRET must be defined in environment variables');
    }
    return process.env.JWT_REFRESH_SECRET;
  },
  get JWT_EXPIRE() { return process.env.JWT_EXPIRE || '7d'; },
  get JWT_REFRESH_EXPIRE() { return process.env.JWT_REFRESH_EXPIRE || '30d'; },
  get EMAIL_ENABLED() { return this.NODE_ENV !== 'test'; },
  get REDIS_ENABLED() { return this.NODE_ENV !== 'test'; },

  /**
   * Validate environment variables with severity-based failure boundaries.
   *
   * CRITICAL → process.exit(1): app cannot function at all without these.
   * OPTIONAL → warn only: app runs in degraded mode without these.
   *
   * @returns {{ envStatus: 'OK'|'FAIL' }}
   */
  validateEnv() {
    if (process.env.NODE_ENV !== 'production') {
      return { envStatus: 'OK' };
    }

    // ── CRITICAL: app refuses to start if ANY of these are missing ────────────
    const critical = [
      'MONGODB_URI',
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
    ];

    // ── OPTIONAL: app runs degraded without these ──────────────────────────────
    const optional = [
      'REDIS_URL',
      'RESEND_API_KEY',
      'CLOUDINARY_API_SECRET',
      'CORS_ORIGINS',
      'FRONTEND_URL',
    ];

    const missingCritical = critical.filter((k) => !process.env[k]);
    const missingOptional = optional.filter((k) => !process.env[k]);

    if (missingOptional.length > 0) {
      missingOptional.forEach((k) => console.warn(`[ENV] Optional missing: ${k} — app may run with reduced functionality`));
    }

    if (missingCritical.length > 0) {
      console.error('');
      console.error('╔══════════════════════════════════════════════════════╗');
      console.error('║           FATAL: CRITICAL ENV VARS MISSING           ║');
      console.error('╠══════════════════════════════════════════════════════╣');
      missingCritical.forEach((k) => console.error(`║  ✗  ${k.padEnd(48)}║`));
      console.error('╠══════════════════════════════════════════════════════╣');
      console.error('║  Set these in your Render/Railway dashboard and      ║');
      console.error('║  redeploy. App cannot start safely without them.     ║');
      console.error('╚══════════════════════════════════════════════════════╝');
      console.error('');
      process.exit(1);
    }

    return { envStatus: 'OK' };
  },
};
