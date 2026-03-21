const FALLBACK_POLICY = {
  email: 'sync',
  moderation: 'reject',
  deletion: 'retry-later',
};

/**
 * Enforces strict fallback policy. Controllers must NOT decide fallback behavior.
 * @param {string} type - 'email', 'moderation', or 'deletion'
 * @returns {string} The fallback action to take, or throws if rejected.
 */
function handleFallback(type) {
  const policy = FALLBACK_POLICY[type];

  if (policy === 'reject') {
    throw new Error('Service temporarily unavailable');
  }

  if (policy === 'sync') {
    return 'SYNC';
  }

  if (policy === 'retry-later') {
    return 'RETRY';
  }

  throw new Error(`Unknown fallback policy type: ${type}`);
}

module.exports = {
  FALLBACK_POLICY,
  handleFallback,
};
