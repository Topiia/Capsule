/**
 * Deterministic rule-based filter
 * catch obvious things before/after AI
 */
class RuleFilter {
  constructor() {
    this.blocklist = [
      'scam',
      'fraud',
      'xxx',
      'casino',
      'lottery',
    ];
  }

  /**
     * Checks text against blocklist
     * @param {string} text
     * @returns {boolean} true if blocked
     */
  isBlocked(text) {
    if (!text) return false;
    const lowerText = text.toLowerCase();
    return this.blocklist.some((word) => lowerText.includes(word));
  }
}

module.exports = new RuleFilter();
