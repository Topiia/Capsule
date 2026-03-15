/**
 * csp.js — CSP violation ingestion & stats endpoints.
 *
 * Delegates all storage logic to services/violationStore.js so the
 * dashboard, weekly script, and this route all share one data source.
 */

const express = require('express');

const router = express.Router();
const violationStore = require('../services/violationStore');
const alertService = require('../services/alertService');

// ── POST /api/csp-report ────────────────────────────────────────────────────
// Receives violation reports sent by browsers when the CSP is violated.
router.post(
  '/csp-report',
  express.json({ type: 'application/csp-report' }),
  (req, res) => {
    const report = req.body['csp-report'] || {};
    const blockedUri = report['blocked-uri'] || 'unknown';
    const violatedDirective = report['violated-directive'] || 'unknown';

    const { isAlert, totalViolations } = violationStore.record(blockedUri, violatedDirective);

    // Structured log — picked up by Winston / Render log drains
    console.warn(
      `[CSP VIOLATION] directive="${violatedDirective}" uri="${blockedUri}" total=${totalViolations}`,
    );

    // Fire-and-forget alert (does not block the response)
    if (isAlert) {
      console.error(`🚨 [CSP ALERT] Threshold reached — total violations: ${totalViolations}`);
      alertService.notify({ blockedUri, violatedDirective, totalViolations }).catch((err) => {
        console.error('[CSP] Alert dispatch failed:', err.message);
      });
    }

    res.status(204).end();
  },
);

// ── GET /api/csp-stats ──────────────────────────────────────────────────────
// Protected admin endpoint — returns aggregated violation statistics as JSON.
const { protect, authorize } = require('../middleware/auth');

router.get('/csp-stats', protect, authorize('admin'), (req, res) => {
  res.status(200).json({ success: true, data: violationStore.getStats() });
});

module.exports = router;
