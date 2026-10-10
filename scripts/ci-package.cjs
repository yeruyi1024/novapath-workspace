'use strict';

const path = require('node:path');
const { rootDir, run, targetFromEnv } = require('./ci-common.cjs');

const target = targetFromEnv(true);
// Previous gates compile the app/skills and construct the native runtime.
// Calling the official builder once retains all resource and installer hooks.
const builder = path.join(rootDir, 'node_modules', 'electron-builder', 'cli.js');
const platformFlag = { darwin: '--mac', win32: '--win', linux: '--linux' }[target.platform];
run(process.execPath, [builder, platformFlag, `--${target.arch}`, '--config',
  'scripts/electron-builder-config.cjs', '--publish', 'never'], {
  env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
});
