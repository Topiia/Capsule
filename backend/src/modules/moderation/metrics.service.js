const logger = require('../../config/logger');

class MetricsService {
  constructor() {
    // In-memory counters (Production: Use Redis/Prometheus)
    this.stats = {
      approved: 0,
      rejected: 0,
      flagged: 0,
      limited: 0,
      total_latency: 0,
      total_processed: 0,
      tokens_used: 0,
    };
  }

  recordDecision(status, latencyMs) {
    const key = status.toLowerCase();
    if (this.stats[key] !== undefined) {
      this.stats[key] += 1;
    }
    this.stats.total_processed += 1;
    this.stats.total_latency += latencyMs;
  }

  recordTokenUsage(count) {
    this.stats.tokens_used += count;
  }

  getMetrics() {
    const total = this.stats.total_processed || 1;
    return {
      approvalRate: (this.stats.approved / total).toFixed(2),
      rejectionRate: (this.stats.rejected / total).toFixed(2),
      avgLatency: `${(this.stats.total_latency / total).toFixed(0)}ms`,
      totalTokens: this.stats.tokens_used,
      distribution: {
        approved: this.stats.approved,
        rejected: this.stats.rejected,
        flagged: this.stats.flagged,
      },
    };
  }

  logMetrics() {
    logger.info('Moderation Metrics', this.getMetrics());
  }
}

module.exports = new MetricsService();
