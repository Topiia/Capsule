/* eslint-disable max-len */
const fs = require('fs');
const path = require('path');

const dirs = [
  path.join(__dirname, '..', 'tests', 'unit'),
  path.join(__dirname, '..', 'tests', 'integration'),
];

// Regex to replace all variations of relative imports that climbed out of src/__tests__
// Old: require('../models...') -> New: require('../../src/models...')
// Old: jest.mock('../models...') -> New: jest.mock('../../src/models...')

dirs.forEach((dir) => {
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
    files.forEach((file) => {
      const filePath = path.join(dir, file);
      let content = fs.readFileSync(filePath, 'utf8');

      // Replace all '../' with '../../src/' in require() and jest.mock() and string requires
      content = content.replace(/require\(['"]\.\.\//g, "require('../../src/");
      content = content.replace(/jest\.mock\(['"]\.\.\//g, "jest.mock('../../src/");
      content = content.replace(/from\s+['"]\.\.\//g, "from '../../src/");

      // Also if there were any '../../src/' already (from the script fix I attempted?), this regex might duplicate them if we aren't careful.
      // E.g., require('../../src/...'). Let's revert double placements if they happen.
      content = content.replace(/\.\.\/\.\.\/src\/\.\.\/src\//g, '../../src/');
      // Wait, let's just use positive lookahead to avoid replacing if it already has src?
      // Not worth it, I know I haven't done it yet globally.

      // Wait, what if the import was `../../src/queues/emailQueue` in authController.email.test.js?
      // authController.email.test.js had: `jest.mock('../../src/queues/emailQueue')` (it already had absolute-ish relative path).
      // We should replace `../../src/` with `../../src/` (no op), but the regex above only matches `../`.
      // Let's replace only exactly `../` that are followed by `models`, `config`, `middleware`, `controllers`, `services`, `utils`, `routes`, `queues`, `app`, `server`.

      const parts = ['models', 'config', 'middleware', 'controllers', 'services', 'utils', 'routes', 'queues', 'app', 'server'];
      parts.forEach((part) => {
        const regex1 = new RegExp(`require\\(['"]\\.\\.\\/${part}`, 'g');
        content = content.replace(regex1, `require('../../src/${part}`);

        const regex2 = new RegExp(`jest\\.mock\\(['"]\\.\\.\\/${part}`, 'g');
        content = content.replace(regex2, `jest.mock('../../src/${part}`);

        const regex3 = new RegExp(`from\\s+['"]\\.\\.\\/${part}`, 'g');
        content = content.replace(regex3, `from '../../src/${part}`);
      });

      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Fixed imports in', path.join(path.basename(dir), file));
    });
  }
});
