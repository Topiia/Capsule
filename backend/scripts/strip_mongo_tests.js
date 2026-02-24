/* eslint-disable max-len */
const fs = require('fs');
const path = require('path');

const integrationDir = path.join(__dirname, '..', 'tests', 'integration');
const files = fs.readdirSync(integrationDir).filter((f) => f.endsWith('.js'));

const connectionRegex = /\/\/ Connect to test database[\s\S]*?if\s*\(mongoose\.connection\.readyState === 0\) \{[\s\S]*?await mongoose\.connect\([^)]+\);[\s\S]*?\}/g;
const closeRegex = /await mongoose\.connection\.close\(\);/g;

files.forEach((file) => {
  const filePath = path.join(integrationDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Remove the connection block
  content = content.replace(connectionRegex, '');

  // Remove the close connection line
  content = content.replace(closeRegex, '');

  // Also remove the manual database mock since our new integration.setup.js needs the REAL database,
  // NOT a jest mock!
  content = content.replace(/jest\.mock\(['"]\.\.\/config\/database['"](?:,\s*\(\)\s*=>\s*jest\.fn\(\))?\);/g, '');
  content = content.replace(/jest\.mock\(['"]\.\.\/\.\.\/src\/config\/database['"](?:,\s*\(\)\s*=>\s*jest\.fn\(\))?\);/g, '');

  // Handle paths that might be ../../config/database
  content = content.replace(/jest\.mock\(['"]\.\.\/\.\.\/config\/database['"](?:,\s*\(\)\s*=>\s*jest\.fn\(\))?\);/g, '');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Processed', file);
});
