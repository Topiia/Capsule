/**
 * csp-dashboard.js — Admin-only HTML dashboard for CSP violations.
 *
 * Mount point: GET /api/csp-dashboard
 *
 * Protected by the existing `protect` + `authorize('admin')` middleware chain.
 * Renders a colour-coded table of violations straight from violationStore so
 * no extra database call or external service is required.
 */

const express = require('express');

const router = express.Router();
const violationStore = require('../services/violationStore');
const { protect, authorize } = require('../middleware/auth');

// ── Helpers ─────────────────────────────────────────────────────────────────

function statusBadge(count) {
  if (count > 100) return '🚨 CRITICAL';
  if (count > 20) return '⚠️ WARNING';
  return '✅ NORMAL';
}

function rowClass(count) {
  if (count > 100) return 'critical';
  if (count > 20) return 'warning';
  return 'ok';
}

function sanitize(str) {
  // Basic HTML-escape to avoid XSS in the violation URIs we display
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Route ────────────────────────────────────────────────────────────────────

router.get('/csp-dashboard', protect, authorize('admin'), (req, res) => {
  const violations = violationStore.getLast7Days();
  const stats = violationStore.getStats();

  const rows = violations
    .map(
      (v) => `
      <tr class="${rowClass(v.count)}">
        <td>${sanitize(v.blockedUri)}</td>
        <td>${sanitize(v.violatedDirective)}</td>
        <td>${v.count}</td>
        <td>${sanitize(v.severity)}</td>
        <td>${v.firstSeen.toISOString()}</td>
        <td>${v.lastSeen.toISOString()}</td>
        <td>${statusBadge(v.count)}</td>
      </tr>`,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>CSP Violation Dashboard — Capsule</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; background: #f5f5f5; }
    h1 { margin: 0 0 4px; font-size: 1.5rem; }
    .meta { color: #666; font-size: 0.875rem; margin-bottom: 24px; }
    .stat-grid { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
    .stat-card { background: #fff; border-radius: 8px; padding: 16px 24px; box-shadow: 0 1px 3px rgba(0,0,0,.1); min-width: 140px; }
    .stat-card .label { font-size: 0.75rem; text-transform: uppercase; color: #888; }
    .stat-card .value { font-size: 1.75rem; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
    th { background: #1e293b; color: #fff; padding: 10px 14px; text-align: left; font-size: 0.8rem; text-transform: uppercase; letter-spacing: .05em; }
    td { padding: 10px 14px; border-bottom: 1px solid #f0f0f0; font-size: 0.875rem; }
    tr.critical td { background: #fff1f1; }
    tr.warning  td { background: #fffbeb; }
    tr.ok       td { background: #f0fdf4; }
    tr:hover td { filter: brightness(0.96); }
  </style>
</head>
<body>
  <h1>CSP Violation Monitor</h1>
  <p class="meta">Showing last 7 days · Auto-refreshes every 60 s</p>

  <div class="stat-grid">
    <div class="stat-card"><div class="label">Total violations</div><div class="value">${stats.totalViolations}</div></div>
    <div class="stat-card"><div class="label">Unique patterns</div><div class="value">${stats.uniqueViolations}</div></div>
    <div class="stat-card"><div class="label">Alerts sent</div><div class="value">${stats.alertsSent}</div></div>
    <div class="stat-card"><div class="label">Rows (7 d)</div><div class="value">${violations.length}</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Blocked URI</th>
        <th>Violated Directive</th>
        <th>Count</th>
        <th>Severity</th>
        <th>First Seen</th>
        <th>Last Seen</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="7" style="text-align:center;padding:32px;color:#888">No violations in the last 7 days 🎉</td></tr>'}
    </tbody>
  </table>

  <script>
    // Auto-refresh every 60 s so the dashboard stays current without manual reload
    setTimeout(() => location.reload(), 60000);
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

module.exports = router;
