'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { rootDir } = require('./ci-common.cjs');

for (const filename of [
  'dist/index.html',
  'dist-electron/main.js',
  'dist-electron/preload.js',
  'dist-electron/browserAnnotationPreload.js',
  'dist-electron/agentBrowserCredentialPreload.js',
  'dist-electron/manualCredentialCapturePreload.js',
  'SKILLs/web-search/dist/server/index.js',
  'SKILLs/technology-news-search/scripts/vendor/rss-parser.bundle.js',
]) {
  const location = path.join(rootDir, filename);
  if (!fs.existsSync(location) || !fs.statSync(location).isFile() || fs.statSync(location).size === 0) {
    throw new Error(`Compiled output is missing or empty: ${filename}`);
  }
}
console.log('[ci-verify-output] Renderer, Electron preloads, and bundled skill output are present.');
