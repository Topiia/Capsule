/* eslint-disable no-param-reassign */
// Recursively removes MongoDB operators and dangerous keys
// Protects against NoSQL injection and prototype pollution.
// Depth guard prevents pathological nested payload attacks.

// Depth guard stops recursion after 10 levels
// but still removes dangerous keys at current level
// Prevents deep nesting injection bypass attempts.
const sanitize = (obj, depth = 0) => {
  if (depth > 10) {
    if (typeof obj === 'object' && obj !== null && !(obj instanceof Date) && !(obj instanceof Buffer)) {
      Object.keys(obj).forEach((key) => {
        if (
          key.startsWith('$')
          || key.includes('.')
          || key === '__proto__'
          || key === 'constructor'
          || key === 'prototype'
        ) {
          delete obj[key];
        }
      });
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    obj.forEach((val) => {
      if (typeof val === 'object' && val !== null) {
        sanitize(val, depth + 1);
      }
    });
    return obj;
  }

  // Only sanitize plain objects (ignore Date, Buffer, etc.)
  if (typeof obj === 'object' && obj !== null && !(obj instanceof Date) && !(obj instanceof Buffer)) {
    Object.keys(obj).forEach((key) => {
      if (
        key.startsWith('$')
        || key.includes('.')
        || key === '__proto__'
        || key === 'constructor'
        || key === 'prototype'
      ) {
        delete obj[key];
      } else {
        sanitize(obj[key], depth + 1);
      }
    });
    return obj;
  }
  return obj;
};

const mongoSanitize = () => (req, res, next) => {
  if (req.body) sanitize(req.body);
  if (req.query) sanitize(req.query);
  if (req.params) sanitize(req.params);

  next();
};

module.exports = mongoSanitize;
