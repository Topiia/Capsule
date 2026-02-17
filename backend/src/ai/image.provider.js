const { HfInference } = require('@huggingface/inference');
const AIProviderInterface = require('./ai.provider.interface');
const logger = require('../config/logger');

class ImageProvider extends AIProviderInterface {
  constructor() {
    super();
    this.hf = new HfInference(process.env.HF_API_KEY);
    this.model = process.env.HF_NSFW_MODEL || 'Falconsai/nsfw_image_detection';
  }

  // Image-only provider
  // eslint-disable-next-line class-methods-use-this
  async analyzeText() {
    return { score: 0, flagged: false, categories: {} };
  }

  async analyzeImage(imageUrl) {
    // 1. Input Validation
    if (typeof imageUrl !== 'string' || !imageUrl.startsWith('http')) {
      logger.warn(`ImageProvider received invalid URL: ${JSON.stringify(imageUrl)}`);
      // Return safe default instead of crashing
      return {
        score: 0,
        flagged: false,
        labels: [],
        provider: 'hf-inference-skipped',
        error: 'Invalid URL',
      };
    }

    try {
      // HF Inference API can take a URL directly for some models, or we fetch the blob
      // For resilience, fetch blob first
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) throw new Error(`Failed to fetch image: ${imageUrl}`);
      const imageBlob = await imageResponse.blob();

      const result = await this.hf.imageClassification({
        data: imageBlob,
        model: this.model,
      });

      // Result is usually [{ label: 'nsfw', score: 0.9 }, { label: 'normal', score: 0.1 }]
      // Map to our standard format
      const nsfwScore = result.find((r) => r.label.toLowerCase() === 'nsfw')?.score || 0;
      const score = Math.round(nsfwScore * 100);

      return {
        score,
        flagged: score > 60,
        labels: result.map((r) => r.label),
        provider: 'hf-inference',
      };
    } catch (error) {
      logger.error('HF Image Analysis Failed:', error);
      // Return safer default if strictly image fail, or rethrow for circuit breaker
      throw error;
    }
  }
}

module.exports = ImageProvider;
