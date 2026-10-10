'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { readJson, rootDir, run } = require('./ci-common.cjs');

function git(args) {
  const result = spawnSync('git', args, { cwd: rootDir, encoding: 'utf8' });
  if (result.status !== 0) return null;
  return result.stdout;
}
const event = process.env.GITHUB_EVENT_PATH ? readJson(process.env.GITHUB_EVENT_PATH) : {};
const before = event.pull_request?.base?.sha || event.before;
let base = before && /^[a-f0-9]{40}$/.test(before) && !/^0+$/.test(before) ? before : 'HEAD~1';
if (git(['rev-parse', '--verify', base]) === null) {
  if (base !== 'HEAD~1') throw new Error(`Cannot resolve lint base ${base}; checkout must fetch full history.`);
  console.log('[ci-lint] Initial import without a parent; no changed-file baseline. Full legacy lint is not a gate.');
  process.exit(0);
}
if (event.pull_request) base = git(['merge-base', base, 'HEAD']).trim();
const output = git(['diff', '--name-only', '-z', '--diff-filter=ACMR', base, 'HEAD', '--', '*.ts', '*.tsx']);
if (output === null) throw new Error('Cannot determine changed TypeScript files.');
const files = output.split('\0').filter(filename => filename && fs.existsSync(path.join(rootDir, filename)));
for (let index = 0; index < files.length; index += 100) {
  run(process.execPath, [path.join(rootDir, 'node_modules', 'eslint', 'bin', 'eslint.js'),
    '--ext', 'ts,tsx', '--report-unused-disable-directives', '--max-warnings', '0', '--no-warn-ignored', '--',
    ...files.slice(index, index + 100)]);
}
console.log(`[ci-lint] Checked ${files.length} changed TypeScript file(s).`);
