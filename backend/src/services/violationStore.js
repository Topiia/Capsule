/**
 * violationStore.js — In-memory CSP violation storage service.
 *
 * Extracted from routes/csp.js to allow re-use across dashboard,
 * alerting, and weekly reports without circular dependencies.
 *
 * NOTE: Data is lost on process restart. For production persistence,
 * swap the Map backing store with a Redis or MongoDB call.
 */

/** @type {Map<string, {
 *   blockedUri: string, violatedDirective: string, count: number,
 *   severity: string, firstSeen: Date, lastSeen: Date
 * }>} */
const store = new Map();

const ALERT_THRESHOLD = 50;
let totalViolations = 0;
let alertsSent = 0;

/**
 * Determine severity level from the violated CSP directive.
 * @param {string} directive
 * @returns {'critical'|'error'|'warning'}
 */
function getSeverity(directive) {
  if (directive.includes('script-src') || directive.includes('object-src')) return 'critical';
  if (directive.includes('connect-src') || directive.includes('frame-src')) return 'error';
  return 'warning';
}

/**
 * Record a new violation.
 * @param {string} blockedUri
 * @param {string} violatedDirective
 * @returns {{ isAlert: boolean, totalViolations: number }}
 */
function record(blockedUri, violatedDirective) {
  const key = `${violatedDirective}::${blockedUri}`;
  const severity = getSeverity(violatedDirective);
  const now = new Date();

  if (store.has(key)) {
    const entry = store.get(key);
    entry.count += 1;
    entry.lastSeen = now;
  } else {
    store.set(key, {
      blockedUri,
      violatedDirective,
      count: 1,
      severity,
      firstSeen: now,
      lastSeen: now,
    });
  }

  totalViolations += 1;

  const isAlert = totalViolations > 0 && totalViolations % ALERT_THRESHOLD === 0;
  if (isAlert) alertsSent += 1;

  return { isAlert, totalViolations };
}

/**
 * Get all violations sorted by count descending.
 * @returns {Array}
 */
function getAll() {
  return Array.from(store.values()).sort((a, b) => b.count - a.count);
}

/**
 * Get violations seen in the last N days.
 * @param {number} days
 * @returns {Array}
 */
function getLast7Days(days = 7) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return getAll().filter((v) => v.lastSeen.getTime() > cutoff);
}

/**
 * Return summary stats for the /api/csp-stats endpoint.
 */
function getStats() {
  const all = getAll();
  return {
    totalViolations,
    alertsSent,
    uniqueViolations: store.size,
    lastViolation: all[0]?.lastSeen ?? null,
    violationsByDirective: all.reduce((acc, v) => {
      acc[v.violatedDirective] = (acc[v.violatedDirective] || 0) + v.count;
      return acc;
    }, {}),
    violationsByUri: all.reduce((acc, v) => {
      acc[v.blockedUri] = (acc[v.blockedUri] || 0) + v.count;
      return acc;
    }, {}),
  };
}

module.exports = {
  record, getAll, getLast7Days, getStats, ALERT_THRESHOLD,
};
