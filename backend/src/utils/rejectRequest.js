/**
 * Standard rejection response for all degraded mode load shedding.
 */
function rejectRequest(res) {
  return res.status(503).json({
    error: 'Service temporarily unavailable',
    mode: 'degraded',
  });
}

module.exports = { rejectRequest };
