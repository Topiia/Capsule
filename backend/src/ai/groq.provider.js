const Groq = require('groq-sdk');
const AIProviderInterface = require('./ai.provider.interface');
const logger = require('../config/logger');
const { moderationCircuit, safeCall } = require('../config/circuitBreaker');
const { handleFallback } = require('../config/fallbackPolicy');

class GroqProvider extends AIProviderInterface {
  constructor() {
    super();
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }

  async analyzeText(text) {
    if (!text || text.trim().length === 0) {
      return {
        score: 0, flagged: false, categories: {}, provider: 'groq',
      };
    }

    const systemPrompt = `You are a strict content moderation AI. Analyze the following text for hate speech, violence, harassment, self-harm, sexual content, and scam/fraud.

Return a JSON object ONLY:
{
  "score": number (0-100, where 100 is most dangerous),
  "flagged": boolean (true if score > 60),
  "categories": {
    "hate": boolean,
    "violence": boolean,
    "harassment": boolean,
    "self_harm": boolean,
    "sexual": boolean,
    "scam": boolean
  },
  "reason": "Brief explanation of the flag"
}`;

    try {
      const responseContent = await safeCall(
        moderationCircuit,
        async () => {
          const completion = await this.groq.chat.completions.create({
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: text },
            ],
            model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
            temperature: 0,
            response_format: { type: 'json_object' },
          });
          return completion.choices[0]?.message?.content;
        },
        () => {
          // The circuit is open. Enforce Fallback Policy immediately.
          // Since moderation policy is 'reject', handleFallback throws an Error
          handleFallback('moderation');
        },
      );

      if (!responseContent) throw new Error('Empty response from Groq');

      const result = JSON.parse(responseContent);

      return {
        score: result.score || 0,
        flagged: result.flagged || false,
        categories: result.categories || {},
        reason: result.reason || 'No specific reason',
        provider: 'groq-llama3',
      };
    } catch (error) {
      logger.error('Groq Analysis Failed:', error);
      throw error;
    }
  }

  // Text-only provider
  // eslint-disable-next-line class-methods-use-this
  async analyzeImage() {
    return { score: 0, flagged: false, labels: [] };
  }
}

module.exports = GroqProvider;
