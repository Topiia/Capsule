/**
 * Interface that all AI providers must implement
 */
/* eslint-disable class-methods-use-this */
class AIProviderInterface {
  /**
    * Analyzes text content for harmful material
    * @param {string} text - The text to analyze
    * @returns {Promise<{score: number, flagged: boolean, categories: object}>}
    */
  async analyzeText(_text) {
    throw new Error('Method analyzeText() must be implemented');
  }

  /**
    * Analyzes image for harmful material
    * @param {string} imageUrl - The URL of the image
    * @returns {Promise<{score: number, flagged: boolean, labels: string[]}>}
    */
  async analyzeImage(_imageUrl) {
    throw new Error('Method analyzeImage() must be implemented');
  }
}

module.exports = AIProviderInterface;
