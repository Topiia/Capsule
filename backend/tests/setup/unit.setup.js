const http = require('http');
const https = require('https');

// Prevent all network calls in unit tests
const throwNetworkError = () => {
  throw new Error('Network call attempted in unit test. This is strictly forbidden.');
};

// Override standard Node http/https modules
http.request = throwNetworkError;
http.get = throwNetworkError;
https.request = throwNetworkError;
https.get = throwNetworkError;

// Override fetch if it exists globally (Node 18+)
if (typeof global.fetch !== 'undefined') {
  global.fetch = throwNetworkError;
}

// Override axios safely (often used by clients, though usually stubbed directly)
// We only need to guard against native drivers hitting the wire, but let's be exhaustive.
