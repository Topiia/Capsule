/**
 * weekly-csp-report.js — Generates a weekly CSP violation report and emails it.
 *
 * Can be run:
 *   - Directly:        node src/scripts/weekly-csp-report.js
 *   - Via node-cron:   require this file in server.js after startup
 *   - Via shell cron:  0 9 * * 1 node /app/src/scripts/weekly-csp-report.js
 *
 * Outputs:
 *   - JSON file in reports/ directory
 *   - Email to SECURITY_EMAIL via Resend
 */

const fs = require('fs');
const path = require('path');

// violationStore is the shared in-memory service.
// When called as a cron job inside the running process, this module is already
// cached by Node so it shares the same Map; when invoked externally the store
// will be empty — in that case wire this to Redis/Mongo.
const { Resend } = require('resend');
const violationStore = require('../services/violationStore');

const REPORTS_DIR = path.resolve(__dirname, '../../..', 'reports');

// ── HTML report template ─────────────────────────────────────────────────────

function generateReportHTML(report) {
  const topRows = report.topViolations
    .map(
      (v) => `<tr>
          <td>${v.blockedUri}</td>
          <td>${v.violatedDirective}</td>
          <td>${v.count}</td>
          <td>${v.severity}</td>
        </tr>`,
    )
    .join('');

  const recItems = report.recommendations.map((r) => `<li>${r}</li>`).join('') || '<li>None — all good!</li>';

  return `
    <h2>Weekly CSP Violation Report — Capsule</h2>
    <p>Generated: ${report.date}</p>
    <ul>
      <li><strong>Total violations (7 d):</strong> ${report.totalViolations}</li>
      <li><strong>Unique blocking patterns:</strong> ${report.uniqueViolations}</li>
      <li><strong>New domains (first seen this week):</strong> ${report.newDomains}</li>
    </ul>
    <h3>Top 10 Violations</h3>
    <table border="1" cellpadding="6" cellspacing="0">
      <tr><th>Blocked URI</th><th>Directive</th><th>Count</th><th>Severity</th></tr>
      ${topRows}
    </table>
    <h3>Recommendations</h3>
    <ul>${recItems}</ul>
  `;
}

// ── Report generation ────────────────────────────────────────────────────────

async function generateWeeklyReport() {
  const violations = violationStore.getLast7Days();
  const stats = violationStore.getStats();
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const report = {
    date: new Date().toISOString(),
    totalViolations: stats.totalViolations,
    uniqueViolations: stats.uniqueViolations,
    newDomains: violations.filter((v) => v.firstSeen.getTime() > weekAgo).length,
    topViolations: violations.slice(0, 10),
    recommendations: [],
  };

  // Auto-recommendations
  violations.forEach((v) => {
    if (v.count > 50) {
      report.recommendations.push(
        `Consider allowlisting "${v.blockedUri}" for directive "${v.violatedDirective}" (${v.count} violations this week).`,
      );
    }
  });

  // ── Persist to disk ──────────────────────────────────────────────────────
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const dateStr = new Date().toISOString().split('T')[0];
  const outPath = path.join(REPORTS_DIR, `csp-weekly-${dateStr}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`[WeeklyReport] Saved to ${outPath}`);

  // ── Email via Resend ─────────────────────────────────────────────────────
  const securityEmail = process.env.SECURITY_EMAIL;
  if (securityEmail && process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.FROM_EMAIL || 'security@capsule.app',
      to: securityEmail,
      subject: `Weekly CSP Report — ${dateStr}`,
      html: generateReportHTML(report),
    });
    console.log(`[WeeklyReport] Emailed to ${securityEmail}`);
  } else {
    console.warn('[WeeklyReport] SECURITY_EMAIL or RESEND_API_KEY not set — skipping email.');
  }

  return report;
}

// ── Run directly ─────────────────────────────────────────────────────────────
if (require.main === module) {
  generateWeeklyReport()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[WeeklyReport] Failed:', err);
      process.exit(1);
    });
}

module.exports = { generateWeeklyReport };
