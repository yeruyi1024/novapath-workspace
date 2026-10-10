'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { readJson, rootDir, setOutput, targetFromEnv } = require('./ci-common.cjs');

targetFromEnv(true);
if (process.versions.node !== '24.15.0') throw new Error(`Expected Node 24.15.0, got ${process.versions.node}.`);
function output(command, args, cwd = rootDir) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
  if (result.error || result.status !== 0) throw result.error || new Error(`${command} failed: ${result.stderr}`);
  return result.stdout.trim();
}
if (output('npm', ['--version']) !== '11.17.0') throw new Error('npm must be 11.17.0.');
if (output('pnpm', ['--version']) !== '12.1.0') throw new Error('pnpm must be 12.1.0.');
if (process.argv.includes('--openclaw')) {
  const source = process.env.OPENCLAW_SRC || path.resolve(rootDir, '..', 'openclaw');
  const manager = readJson(path.join(source, 'package.json')).packageManager || '';
  if (!/^pnpm@12\.1\.0(?:\+|$)/.test(manager)) throw new Error(`Unreviewed OpenClaw packageManager: ${manager}`);
  if (output('pnpm', ['--version'], source) !== '12.1.0') throw new Error('OpenClaw did not use the pinned pnpm.');
  setOutput('store', output('pnpm', ['store', 'path'], source));
}
console.log(`[ci-toolchain] Node ${process.versions.node}, npm 11.17.0, pnpm 12.1.0 on ${process.platform}/${process.arch}.`);
