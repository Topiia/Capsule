/* eslint-disable import/no-extraneous-dependencies */
const { MongoMemoryServer } = require('mongodb-memory-server');
const fs = require('fs');
const path = require('path');
const os = require('os');

module.exports = async function globalSetup() {
  // Start the dynamically allocated memory server
  const instance = await MongoMemoryServer.create();
  const uri = instance.getUri();

  // Store the reference on globalThis so teardown can access it
  globalThis.__MONGOINSTANCE = instance;

  // Write the URI to a temporary file for the test processes to read
  const uriPath = path.join(os.tmpdir(), 'jest-mongo-uri.json');
  fs.writeFileSync(uriPath, JSON.stringify({ uri }));

  console.log(`\n[Test Architecture] Started mongodb-memory-server globally at ${uri}`);
};
