const fs = require('fs');
const path = require('path');
const os = require('os');

module.exports = async function globalTeardown() {
  const instance = globalThis.__MONGOINSTANCE;

  if (instance) {
    await instance.stop();
    console.log('\n[Test Architecture] Stopped mongodb-memory-server globally');
  }

  // Clean up the temporary file
  const uriPath = path.join(os.tmpdir(), 'jest-mongo-uri.json');
  if (fs.existsSync(uriPath)) {
    fs.unlinkSync(uriPath);
  }
};
