'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { npm, rootDir, run } = require('./ci-common.cjs');

// Prepare package-bearing skills before beforePack, which then reuses these
// directories instead of running an unlocked install during resource packing.
const skillRoot = path.join(rootDir, 'SKILLs');
for (const entry of fs.readdirSync(skillRoot, { withFileTypes: true })) {
  const directory = path.join(skillRoot, entry.name);
  if (!entry.isDirectory() || !fs.existsSync(path.join(directory, 'package.json'))) continue;
  if (!fs.existsSync(path.join(directory, 'package-lock.json'))) {
    throw new Error(`Missing committed skill lock: SKILLs/${entry.name}/package-lock.json`);
  }
  npm(['ci', '--no-audit', '--no-fund'], { cwd: directory });
}
// Compilation mirrors upstream build:skills, after locked installs above.
run(process.execPath, [path.join(rootDir, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'SKILLs/web-search/tsconfig.json']);
run(process.execPath, ['scripts/build-skill-tech-news.js']);
for (const filename of ['.connection', '.server.log', '.server.pid']) {
  fs.rmSync(path.join(skillRoot, 'web-search', filename), { force: true });
}
