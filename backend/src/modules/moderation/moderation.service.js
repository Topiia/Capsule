const Vlog = require('../../models/Vlog');
const ruleFilter = require('./rule.filter');
const scoringEngine = require('./scoring.engine');
const GroqProvider = require('../../ai/groq.provider');
const ImageProvider = require('../../ai/image.provider');
const metricsService = require('./metrics.service');
const trustScoreService = require('./trust.score.service');
const logger = require('../../config/logger');
const CircuitBreaker = require('../../utils/CircuitBreaker');

class ModerationService {
  constructor() {
    this.textProvider = new GroqProvider();
    this.imageProvider = new ImageProvider();
    this.MODERATION_VERSION = 'v2.0.0-enterprise';

    // Resilience: Circuit Breakers for External APIs
    this.textBreaker = new CircuitBreaker('GroqAI', {
      failureThreshold: 3,
      resetTimeout: 30000,
      fallback: () => ({ score: 50, flagged: true, reason: 'AI Service Unavailable' }),
    });

    this.imageBreaker = new CircuitBreaker('ImageAI', {
      failureThreshold: 3,
      resetTimeout: 30000,
      fallback: () => ({ score: 50, details: [] }),
    });
  }

  async moderateVlog(vlogId) {
    const start = Date.now();
    const vlog = await Vlog.findById(vlogId).populate('author');

    if (!vlog) {
      throw new Error(`Vlog not found: ${vlogId}`);
    }

    // WORKER GUARD: Admin Decision Finality
    // If a human has overridden this vlog, AI must NEVER touch it again.
    if (vlog.moderation && vlog.moderation.overriddenBy) {
      logger.info(`Skipped AI moderation for ${vlogId} – human override exists`);
      return;
    }

    // 0. Trust Score Check
    const userTrust = vlog.author
      ? trustScoreService.getTrustLevel(vlog.author.trustScore)
      : 'NEUTRAL';
    let trustModifier = 0;
    if (userTrust === 'TRUSTED') trustModifier = -10;
    if (userTrust === 'UNTRUSTED') trustModifier = +20;

    const textContent = `${vlog.title} ${vlog.description} ${vlog.content}`;

    // 1. Rule-based Filter
    if (ruleFilter.isBlocked(textContent)) {
      await this.updateStatus(vlog, 'REJECTED', 100, { reason: 'Blocked keyword found' });
      metricsService.recordDecision('REJECTED', Date.now() - start);
      if (vlog.author) await trustScoreService.updateTrustScore(vlog.author._id, 'REJECTED');
      return;
    }

    try {
      // 2. AI Analysis (Parallel) with Circuit Breakers
      const [textResult, imageResult] = await Promise.all([
        this.textBreaker.execute(() => this.textProvider.analyzeText(textContent)),
        this.imageBreaker.execute(() => this.moderateImages(vlog.images)),
      ]);

      // 3. Scoring with Trust Modifier
      let finalScore = scoringEngine.calculateScore(textResult.score, imageResult.score);
      finalScore += trustModifier;
      finalScore = Math.max(0, Math.min(100, finalScore));

      const status = scoringEngine.determineStatus(finalScore);

      // 4. Update DB
      await this.updateStatus(vlog, status, finalScore, {
        textAnalysis: textResult,
        imageAnalysis: imageResult,
        userTrustLevel: userTrust,
        modelVersion: this.MODERATION_VERSION,
      });

      // 5. Post-Moderation Actions
      metricsService.recordDecision(status, Date.now() - start);
      if (status !== 'PENDING' && vlog.author) {
        await trustScoreService.updateTrustScore(vlog.author._id, status);
      }
    } catch (error) {
      logger.error('Moderation logic failed, marking REVIEW_REQUIRED', error);
      await this.updateStatus(vlog, 'FLAGGED', 50, {
        error: error.message,
        reason: 'Automated moderation failed, manual review needed',
      });
      metricsService.recordDecision('FLAGGED', Date.now() - start);
    }
  }

  async moderateImages(images) {
    if (!images || images.length === 0) return { score: 0 };

    // Process first 3 images to save cost
    const samples = images.slice(0, 3);

    // Normalize input: Ensure we pass only URL strings to the provider
    // MongoDB stores images as objects { url, publicId, ... }
    const validUrls = samples
      .map((img) => (typeof img === 'string' ? img : img.url)) // Handle both string and object formats
      .filter((url) => typeof url === 'string' && url.length > 0); // Filter invalid

    if (validUrls.length === 0) return { score: 0, details: [] };

    // Use the provider directly here, the breaker wraps this entire function
    const scores = await Promise.all(
      validUrls.map((url) => this.imageProvider.analyzeImage(url)),
    );

    const maxScore = Math.max(...scores.map((s) => s.score));
    return { score: maxScore, details: scores };
  }

  // eslint-disable-next-line class-methods-use-this
  async updateStatus(vlog, status, score, details) {
    const updatedVlog = vlog; // Avoid param reassignment lint
    updatedVlog.status = status;

    // ENFORCEMENT: Only approved content becomes public
    updatedVlog.isPublic = (status === 'APPROVED');

    updatedVlog.moderation = {
      score,
      details,
      version: 'v2.0.0-enterprise',
      reviewedAt: new Date(),
    };
    await updatedVlog.save();
    logger.info(`Moderation complete for ${updatedVlog._id}. Status: ${status}, Score: ${score}, Public: ${updatedVlog.isPublic}`);
  }
}

module.exports = new ModerationService();
