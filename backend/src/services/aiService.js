const natural = require('natural');
const { stopwords } = require('natural');

// Common vlogging-related tags
const COMMON_TAGS = [
  'vlog', 'daily', 'life', 'adventure', 'travel', 'food', 'tech',
  'lifestyle', 'fitness', 'music', 'art', 'photography', 'diy',
  'tutorial', 'review', 'challenge', 'comedy', 'gaming', 'sports',
  'health', 'education', 'business', 'entertainment', 'fashion',
  'beauty', 'cooking', 'nature', 'city', 'culture', 'experience',
];

// Category-specific tags
const CATEGORY_TAGS = {
  technology: ['tech', 'gadget', 'software', 'hardware', 'innovation', 'digital', 'AI', 'coding', 'programming'],
  travel: ['travel', 'adventure', 'explore', 'journey', 'destination', 'culture', 'vacation', 'trip', 'wanderlust'],
  lifestyle: ['lifestyle', 'daily', 'routine', 'habits', 'wellness', 'mindfulness', 'productivity', 'selfcare'],
  food: ['food', 'cooking', 'recipe', 'kitchen', 'culinary', 'delicious', 'meal', 'restaurant', 'taste'],
  fashion: ['fashion', 'style', 'outfit', 'clothing', 'trend', 'design', 'wardrobe', 'accessories'],
  fitness: ['fitness', 'workout', 'exercise', 'health', 'gym', 'training', 'strength', 'cardio', 'yoga'],
  music: ['music', 'song', 'melody', 'performance', 'concert', 'instrument', 'band', 'artist', 'rhythm'],
  art: ['art', 'creative', 'painting', 'drawing', 'design', 'artist', 'gallery', 'masterpiece', 'inspiration'],
  business: ['business', 'entrepreneur', 'startup', 'marketing', 'success', 'leadership', 'strategy', 'growth'],
  education: ['education', 'learning', 'tutorial', 'knowledge', 'study', 'lesson', 'teaching', 'skill'],
  entertainment: ['entertainment', 'fun', 'show', 'performance', 'comedy', 'drama', 'movie', 'celebrity'],
  gaming: ['gaming', 'game', 'playthrough', 'stream', 'esports', 'console', 'pc', 'multiplayer'],
  sports: ['sports', 'athlete', 'competition', 'training', 'game', 'championship', 'fitness', 'exercise'],
  health: ['health', 'wellness', 'medical', 'nutrition', 'mentalhealth', 'selfcare', 'healing', 'recovery'],
  science: ['science', 'research', 'discovery', 'experiment', 'laboratory', 'technology', 'innovation'],
  photography: ['photography', 'photo', 'camera', 'shoot', 'portrait', 'landscape', 'editing', 'visual'],
  diy: ['diy', 'craft', 'handmade', 'project', 'creative', 'build', 'make', 'tutorial'],
  other: ['vlog', 'video', 'content', 'creator', 'youtube', 'social', 'media'],
};

/**
 * Generate tags from text description using NLP
 * @param {string} description - The vlog description
 * @param {string} category - The vlog category
 * @param {number} maxTags - Maximum number of tags to generate
 * @returns {Promise<string[]>} Array of generated tags
 */
exports.generateTags = async (description, category = 'other', maxTags = 8) => {
  try {
    if (!description || typeof description !== 'string') {
      return [];
    }

    // Convert to lowercase and clean the text
    const cleanText = description.toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    // Tokenize the text
    const tokenizer = new natural.WordTokenizer();
    const tokens = tokenizer.tokenize(cleanText);

    // Remove stopwords and short words
    const filteredTokens = tokens.filter((token) => token.length > 2
      && !stopwords.includes(token)
      && !/^[\d]+$/.test(token), // Remove pure numbers
    );

    // Count word frequency
    const wordFreq = {};
    filteredTokens.forEach((token) => {
      wordFreq[token] = (wordFreq[token] || 0) + 1;
    });

    // Sort by frequency and get top words
    const sortedWords = Object.entries(wordFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15)
      .map(([word]) => word);

    // Get category-specific tags
    const categorySpecificTags = CATEGORY_TAGS[category] || CATEGORY_TAGS.other;

    // Filter relevant category tags based on content
    const relevantCategoryTags = categorySpecificTags.filter((tag) => cleanText.includes(tag) || sortedWords.some((word) => tag.includes(word)));

    // Combine and deduplicate tags
    const allPotentialTags = [
      ...relevantCategoryTags,
      ...sortedWords.filter((word) => !relevantCategoryTags.includes(word)
        && COMMON_TAGS.some((commonTag) => word.includes(commonTag) || commonTag.includes(word))),
      ...COMMON_TAGS.filter((tag) => cleanText.includes(tag)),
    ];

    // Remove duplicates and limit to maxTags
    const uniqueTags = [...new Set(allPotentialTags)]
      .slice(0, maxTags)
      .filter((tag) => tag.length >= 3); // Ensure minimum length

    return uniqueTags;
  } catch (error) {
    console.error('Error generating tags:', error);
    return [];
  }
};

/**
 * Suggest categories based on description and tags
 * @param {string} description - The vlog description
 * @param {string[]} tags - Existing tags
 * @returns {Promise<string[]>} Array of suggested categories
 */
exports.suggestCategories = async (description, tags = []) => {
  try {
    const cleanText = (`${description} ${tags.join(' ')}`).toLowerCase();
    const categoryScores = {};

    // Score each category based on keyword matches
    Object.entries(CATEGORY_TAGS).forEach(([category, keywords]) => {
      let score = 0;
      keywords.forEach((keyword) => {
        if (cleanText.includes(keyword)) {
          score += 1;
        }
      });
      if (score > 0) {
        categoryScores[category] = score;
      }
    });

    // Sort by score and return top categories
    const suggestedCategories = Object.entries(categoryScores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([category]) => category);

    return suggestedCategories;
  } catch (error) {
    console.error('Error suggesting categories:', error);
    return [];
  }
};

/**
 * Analyze sentiment of the description
 * @param {string} description - The vlog description
 * @returns {Promise<string>} Sentiment (positive, negative, neutral)
 */
exports.analyzeSentiment = async (description) => {
  try {
    const analyzer = new natural.SentimentAnalyzer(
      'English',
      natural.PorterStemmer,
      'afinn',
    );

    const tokens = natural.WordTokenizer().tokenize(description.toLowerCase());
    const sentimentScore = analyzer.getSentiment(tokens);

    if (sentimentScore > 0.1) {
      return 'positive';
    } if (sentimentScore < -0.1) {
      return 'negative';
    }
    return 'neutral';
  } catch (error) {
    console.error('Error analyzing sentiment:', error);
    return 'neutral';
  }
};

/**
 * Extract key phrases from description
 * @param {string} description - The vlog description
 * @param {number} maxPhrases - Maximum number of phrases to extract
 * @returns {Promise<string[]>} Array of key phrases
 */
exports.extractKeyPhrases = async (description, maxPhrases = 5) => {
  try {
    // Simple N-gram extraction (bigrams and trigrams)
    const sentences = description.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const phrases = [];

    sentences.forEach((sentence) => {
      const words = sentence.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter((word) => word.length > 2 && !stopwords.includes(word));

      // Extract bigrams and trigrams
      for (let i = 0; i < words.length - 1; i++) {
        if (i < words.length - 2) {
          const trigram = words.slice(i, i + 3).join(' ');
          if (trigram.length > 8) phrases.push(trigram);
        }
        const bigram = words.slice(i, i + 2).join(' ');
        if (bigram.length > 5) phrases.push(bigram);
      }
    });

    // Count phrase frequency and return top phrases
    const phraseFreq = {};
    phrases.forEach((phrase) => {
      phraseFreq[phrase] = (phraseFreq[phrase] || 0) + 1;
    });

    return Object.entries(phraseFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, maxPhrases)
      .map(([phrase]) => phrase);
  } catch (error) {
    console.error('Error extracting key phrases:', error);
    return [];
  }
};
