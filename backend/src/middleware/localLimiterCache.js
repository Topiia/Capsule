// Lightweight in-memory request counter (Map with TTL logic)
const localCache = new Map();

// Periodic cleanup to remove expired entries and prevent memory leaks
setInterval(() => {
  const now = Date.now();
  localCache.forEach((value, key) => {
    if (now > value.resetTime) {
      localCache.delete(key);
    }
  });
}, 60000).unref();

/**
 * Checks if the request should bypass Redis rate limiting.
 * Allows small bursts (up to 5 requests per second) locally, or bypasses
 * if edge-aware rate limiting headers from an upstream proxy are present.
 *
 * @param {Object} req - Express request object
 * @param {string} key - The rate limit key
 * @returns {boolean} True if the Redis call should be skipped
 */
const shouldBypassRedis = (req, key) => {
  // Edge-aware limiter bypass
  if (req.headers['cf-ray'] || req.headers['x-ratelimit-remaining']) {
    return true;
  }

  const now = Date.now();
  let entry = localCache.get(key);

  if (!entry || now > entry.resetTime) {
    // New 1-second window
    entry = { count: 0, resetTime: now + 1000 };
    localCache.set(key, entry);
  }

  // Token bucket logic: first 5 requests per second get a local pass
  if (entry.count < 5) {
    entry.count += 1;
    return true; // Bypass Redis
  }

  // Excess requests must check the Redis limiter
  return false;
};

module.exports = {
  shouldBypassRedis,
};
