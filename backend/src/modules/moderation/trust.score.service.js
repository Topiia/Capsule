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

      // FIX: Use atomic $inc to prevent read-modify-write lost updates during concurrency
      const updateDoc = { $inc: { trustScore: impact } };
      if (status === 'FLAGGED' || status === 'REJECTED') {
        updateDoc.$inc.flagsCount = 1;
      }

      const updatedUser = await User.findByIdAndUpdate(userId, updateDoc, { new: true });
      if (!updatedUser) return;

      // Lazy background clamping (Minor tradeoff: score might briefly exceed 100 before clamping,
      // but strictly prevents lost updates on the increment itself)
      if (updatedUser.trustScore > 100 || updatedUser.trustScore < 0) {
        updatedUser.trustScore = Math.max(0, Math.min(100, updatedUser.trustScore));
        await updatedUser.save();
      }

      logger.info(`Updated trust score for user ${userId}: ${updatedUser.trustScore} (${impact > 0 ? '+' : ''}${impact})`);
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
