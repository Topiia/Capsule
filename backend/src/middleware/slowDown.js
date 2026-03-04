const slowDown = require('express-slow-down');
const logger = require('../config/logger');
const { slowdownTriggeredTotal } = require('../monitoring/metrics');

const rawSlowDown = slowDown({
  windowMs: 60 * 1000, // 60 seconds
  delayAfter: 150, // allow 150 requests per 60 seconds, then...
  delayMs: () => 100, // begin adding 100ms of delay per request above 150:
});

const readSlowDown = (req, res, next) => rawSlowDown(req, res, () => {
  if (req.slowDown && req.slowDown.current > req.slowDown.limit) {
    logger.warn('Progressive slowdown triggered', {
      event: 'slowDownTriggered',
      ip: req.ip,
      url: req.originalUrl,
    });
    slowdownTriggeredTotal.inc({ url: req.originalUrl, ip: req.ip });
  }
  return next();
});

module.exports = {
  readSlowDown,
};
