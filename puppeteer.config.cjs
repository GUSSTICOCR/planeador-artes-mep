const {join} = require('path');

/**
 * @type {import('puppeteer').Configuration}
 */
module.exports = {
  // Changes the cache location for Puppeteer to the project directory.
  // This ensures Render does not delete Chrome between the build and runtime phases.
  cacheDirectory: join(__dirname, 'puppeteer_browsers'),
};
