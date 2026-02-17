/**
 * Scoring Engine
 * Aggregates scores from multiple sources into a single risk score (0-100)
 */
class ScoringEngine {
  constructor() {
    this.weights = {
      text: 0.6,
      image: 0.4,
    };
    this.thresholds = {
      approved: 30,
      flagged: 60,
      limited: 80,
    };
  }

  /**
     * Calculate weighted average score
     * @param {number} textScore (0-100)
     * @param {number} imageScore (0-100)
     * @returns {number} Final risk score
     */
  calculateScore(textScore, imageScore) {
    // If any component is 100% unsafe, the whole content is unsafe
    if (textScore >= 100 || imageScore >= 100) return 100;

    const weightedScore = (textScore * this.weights.text)
            + (imageScore * this.weights.image);

    return Math.min(Math.round(weightedScore), 100);
  }

  /**
     * Determine status based on score
     * @param {number} score
     * @returns {string} Status enum
     */
  determineStatus(score) {
    if (score <= this.thresholds.approved) return 'APPROVED';
    if (score <= this.thresholds.flagged) return 'FLAGGED';
    if (score <= this.thresholds.limited) return 'LIMITED';
    return 'REJECTED';
  }
}

module.exports = new ScoringEngine();
