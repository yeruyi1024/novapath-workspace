'use strict';

const { setOutput, targets } = require('./ci-common.cjs');
const selection = process.env.CI_BUILD_PLATFORM || 'all';
const allowed = ['all', 'macos', 'mac-arm64', 'mac-x64', 'windows', 'linux'];
if (!allowed.includes(selection)) throw new Error(`Unknown platform selection: ${selection}`);
const selected = targets.filter(entry => selection === 'all'
  || selection === entry.target
  || (selection === 'macos' && entry.platform === 'darwin')
  || (selection === 'windows' && entry.platform === 'win32')
  || (selection === 'linux' && entry.platform === 'linux'));
if (!selected.length) throw new Error('At least one platform must be selected.');
setOutput('matrix', JSON.stringify({ include: selected.map(({ target, os, arch }) => ({ target, os, arch })) }));
setOutput('targets', JSON.stringify(selected.map(entry => entry.target)));
