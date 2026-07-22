const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Changes the cache location for Puppeteer to a local folder
  // so Render doesn't lose the Chrome binary.
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
