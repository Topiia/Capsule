/**
 * alertService.js — Sends Sentry-based tiered alerts for CSP violation spikes.
 *
 * Alert tiers (configurable via environment variables):
 *   Below warningThreshold  — console.log only (avoid Sentry noise)
 *   >= warningThreshold     — Sentry warning-level message
 *   >= criticalThreshold    — Sentry error exception + optional Resend email
 *
 * Configuration (environment variables):
 *   ALERT_THRESHOLD       — Violations before Sentry warning (default: 100)
 *   CRITICAL_THRESHOLD    — Violations before Sentry error + email (default: 500)
 *   SECURITY_EMAIL        — Email address for critical threshold alerts (optional)
 *
 * Usage (after require):
 *   const AlertService = require('../services/alertService');
 *   const alertService = new AlertService();
 *   await alertService.notify({ blockedUri, violatedDirective, totalViolations });
 */

const Sentry = require('@sentry/node');
const { Resend } = require('resend');

class AlertService {
  constructor(config = {}) {
    this.warningThreshold = config.warningThreshold
      || parseInt(process.env.ALERT_THRESHOLD, 10)
      || 100;
    this.criticalThreshold = config.criticalThreshold
      || parseInt(process.env.CRITICAL_THRESHOLD, 10)
      || 500;
    this.emailTransport = config.emailTransport || null;
  }

  /**
   * Main alert dispatcher — called by csp.js on every alert-worthy violation.
   * @param {{ blockedUri: string, violatedDirective: string, totalViolations: number }} violation
   */
  async notify({ blockedUri, violatedDirective, totalViolations }) {
    const count = totalViolations;

    // Sentry context attached to all events for filtering/searching
    const tags = {
      type: 'csp-violation',
      blockedUri,
      directive: violatedDirective,
      count: String(count),
    };

    const extra = {
      blockedUri,
      violatedDirective,
      count,
      timestamp: new Date().toISOString(),
    };

    // ── Tier 1: Below warning threshold — just log (avoid Sentry noise) ───────
    if (count < this.warningThreshold) {
      console.log('📊 CSP Violation:', { blockedUri, violatedDirective, count });
      return;
    }

    // ── Tier 2: Warning level — send a Sentry message ────────────────────────
    if (count < this.criticalThreshold) {
      Sentry.captureMessage(
        `⚠️ CSP Warning: ${blockedUri} (${count} violations)`,
        { level: 'warning', tags, extra },
      );
      return;
    }

    // ── Tier 3: Critical level — Sentry error + optional email ───────────────
    Sentry.captureException(
      new Error(`🚨 CRITICAL: High volume CSP violations on ${blockedUri}`),
      { tags, extra },
    );

    // Optional Resend email for critical alerts (requires SECURITY_EMAIL + RESEND_API_KEY)
    const securityEmail = process.env.SECURITY_EMAIL;
    if (securityEmail) {
      await AlertService._sendEmailAlert({ blockedUri, violatedDirective, count }).catch((err) => {
        console.error('[AlertService] Email send failed:', err.message);
      });
    }
  }

  /**
   * Send a critical alert email via Resend (already used by the project).
   * Declared static because it does not depend on instance state.
   * @private
   */
  static async _sendEmailAlert({ blockedUri, violatedDirective, count }) {
    if (!process.env.RESEND_API_KEY) {
      console.warn('[AlertService] RESEND_API_KEY not set — skipping email alert.');
      return;
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.FROM_EMAIL || 'security@capsule.app',
      to: process.env.SECURITY_EMAIL,
      subject: `🚨 CRITICAL: CSP Violation Spike — ${blockedUri}`,
      text: [
        'CRITICAL CSP Violation Alert',
        `Blocked URI:  ${blockedUri}`,
        `Directive:    ${violatedDirective}`,
        `Total count:  ${count}`,
        `Time:         ${new Date().toISOString()}`,
        '',
        'Review the CSP dashboard to investigate and take action.',
      ].join('\n'),
    });

    console.log(`[AlertService] Critical alert emailed to ${process.env.SECURITY_EMAIL}`);
  }
}

module.exports = AlertService;
