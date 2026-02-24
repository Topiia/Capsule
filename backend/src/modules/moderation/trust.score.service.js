const User = require('../../models/User');
const logger = require('../../config/logger');

class TrustScoreService {
  constructor() {
    this.IMPACT = {
      APPROVED: 1,
      FLAGGED: -5,
      REJECTED: -20,
    };
  }

  /**
     * Update user trust score based on moderation result
     * @param {string} userId
     * @param {string} status (APPROVED, FLAGGED, REJECTED)
     */
  async updateTrustScore(userId, status) {
    const impact = this.IMPACT[status] || 0;
    if (impact === 0) return;

    try {
      const user = await User.findById(userId);
      if (!user) return;

      // Update Score
      let newScore = (user.trustScore || 50) + impact;
      newScore = Math.max(0, Math.min(100, newScore)); // Clamp between 0-100

      // Update Flags Count
      if (status === 'FLAGGED' || status === 'REJECTED') {
        user.flagsCount = (user.flagsCount || 0) + 1;
      }

      user.trustScore = newScore;
      await user.save();

      logger.info(`Updated trust score for user ${userId}: ${newScore} (${impact > 0 ? '+' : ''}${impact})`);
    } catch (error) {
      logger.error(`Failed to update trust score for user ${userId}`, error);
    }
  }

  /**
     * Get trust level for decision making
     * @param {number} score
     * @returns {string} 'TRUSTED' | 'NEUTRAL' | 'UNTRUSTED'
     */
  // eslint-disable-next-line class-methods-use-this
  getTrustLevel(score) {
    if (score >= 80) return 'TRUSTED'; // Can skip some checks
    if (score <= 30) return 'UNTRUSTED'; // Stricter checks
    return 'NEUTRAL';
  }
}

module.exports = new TrustScoreService();
