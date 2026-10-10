'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const rootDir = path.resolve(__dirname, '..');
const targets = [
  { target: 'mac-arm64', os: 'macos-15', arch: 'arm64', platform: 'darwin', formats: ['.dmg'] },
  { target: 'mac-x64', os: 'macos-15-intel', arch: 'x64', platform: 'darwin', formats: ['.dmg'] },
  { target: 'win-x64', os: 'windows-2025', arch: 'x64', platform: 'win32', formats: ['.exe'] },
  { target: 'linux-x64', os: 'ubuntu-24.04', arch: 'x64', platform: 'linux', formats: ['.AppImage', '.deb'] },
];

function run(command, args, options = {}) {
  console.log(`[ci] ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd: rootDir, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (exit=${result.status}, signal=${result.signal}).`);
  return result;
}

function npm(args, options = {}) {
  return run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    shell: process.platform === 'win32', ...options,
  });
}

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function targetFromEnv(requireHost = false) {
  const target = targets.find(entry => entry.target === process.env.CI_BUILD_TARGET);
  if (!target) throw new Error(`Unsupported CI_BUILD_TARGET: ${process.env.CI_BUILD_TARGET || '(unset)'}`);
  if (requireHost && (target.platform !== process.platform || target.arch !== process.arch)) {
    throw new Error(`Target ${target.target} requires ${target.platform}/${target.arch}; host is ${process.platform}/${process.arch}.`);
  }
  return target;
}

function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  else console.log(`${name}=${value}`);
}

async function hashFile(filename) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

module.exports = { hashFile, npm, readJson, rootDir, run, setOutput, targetFromEnv, targets };
