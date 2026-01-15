const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const xss = require('xss');

/**
 * SECURITY: HTML/XSS Sanitization Utilities
 *
 * Prevents stored XSS attacks by sanitizing user-generated HTML content
 * before storing in database or rendering in UI.
 */

// Create DOMPurify instance with jsdom window
const { window } = new JSDOM('');
const DOMPurify = createDOMPurify(window);

/**
 * Sanitize HTML content using DOMPurify
 * Allows only safe HTML tags and attributes
 *
 * @param {string} dirty - Unsanitized HTML string
 * @returns {string} - Sanitized HTML string
 */
exports.sanitizeHTML = (dirty) => {
  if (!dirty || typeof dirty !== 'string') {
    return '';
  }

  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre'],
    ALLOWED_ATTR: ['href', 'title', 'target'],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
  });
};

/**
 * Sanitize HTML content using xss library (alternative/additional protection)
 * Uses whitelist approach with custom options
 *
 * @param {string} dirty - Unsanitized HTML string
 * @returns {string} - Sanitized HTML string
 */
exports.sanitizeWithXSS = (dirty) => {
  if (!dirty || typeof dirty !== 'string') {
    return '';
  }

  return xss(dirty, {
    whiteList: {
      a: ['href', 'title', 'target'],
      b: [],
      i: [],
      em: [],
      strong: [],
      p: [],
      br: [],
      ul: [],
      ol: [],
      li: [],
      blockquote: [],
      code: [],
      pre: [],
    },
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style'],
  });
};

/**
 * Strip all HTML tags - for plain text fields
 * Use when HTML is not allowed at all
 *
 * @param {string} dirty - String potentially containing HTML
 * @returns {string} - Plain text with all HTML removed
 */
exports.stripHTML = (dirty) => {
  if (!dirty || typeof dirty !== 'string') {
    return '';
  }

  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [],
    KEEP_CONTENT: true,
  });
};

/**
 * Sanitize object recursively
 * Sanitizes all string values in an object
 *
 * @param {object} obj - Object to sanitize
 * @param {function} sanitizer - Sanitization function (default: stripHTML)
 * @returns {object} - Sanitized object
 */
exports.sanitizeObject = (obj, sanitizer = exports.stripHTML) => {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => exports.sanitizeObject(item, sanitizer));
  }

  const sanitized = {};
  Object.entries(obj).forEach(([key, value]) => {
    if (typeof value === 'string') {
      sanitized[key] = sanitizer(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = exports.sanitizeObject(value, sanitizer);
    } else {
      sanitized[key] = value;
    }
  });

  return sanitized;
};

/**
 * Sanitize vlog content specifically
 * Allows more HTML in description, strips HTML from title
 *
 * @param {object} vlogData - Vlog data object
 * @returns {object} - Sanitized vlog data
 */
exports.sanitizeVlogContent = (vlogData) => {
  if (!vlogData) return vlogData;

  return {
    ...vlogData,
    title: exports.stripHTML(vlogData.title),
    description: exports.sanitizeHTML(vlogData.description),
    tags: Array.isArray(vlogData.tags)
      ? vlogData.tags.map((tag) => exports.stripHTML(tag))
      : vlogData.tags,
    images: Array.isArray(vlogData.images)
      ? vlogData.images.map((img) => ({
        ...img,
        caption: img.caption ? exports.stripHTML(img.caption) : '',
      }))
      : vlogData.images,
  };
};

/**
 * Sanitize user profile data
 * Strips HTML from username, sanitizes bio
 *
 * @param {object} userData - User data object
 * @returns {object} - Sanitized user data
 */
exports.sanitizeUserProfile = (userData) => {
  if (!userData) return userData;

  return {
    ...userData,
    username: userData.username ? exports.stripHTML(userData.username) : userData.username,
    bio: userData.bio ? exports.sanitizeHTML(userData.bio) : userData.bio,
  };
};

/**
 * Sanitize comment content
 * Allows minimal HTML in comments
 *
 * @param {string} commentText - Comment text
 * @returns {string} - Sanitized comment text
 */
exports.sanitizeComment = (commentText) => {
  if (!commentText || typeof commentText !== 'string') {
    return '';
  }

  return DOMPurify.sanitize(commentText, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a'],
    ALLOWED_ATTR: ['href'],
    ALLOWED_URI_REGEXP: /^https?:\/\//i,
  });
};

module.exports = exports;
