'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { test } = require('node:test');
const { minimatch } = require('minimatch');
const config = require('../electron-builder-config.cjs');
const manifest = require('../../src/shared/asr/local-runtime.json');
const { verifyPreparedRuntime } = require('../setup-local-asr-runtime.cjs');

test('each desktop package includes the engine and licenses, excluding the large model', () => {
  for (const platform of ['mac', 'win', 'linux']) {
    const resource = config[platform].extraResources.find(entry => entry.to === 'asr-runtime');
    assert.ok(resource);
    assert.equal(resource.from, `resources/asr-runtime/${platform}-\${arch}`);
    const selected = file => resource.filter.reduce((included, pattern) => pattern.startsWith('!')
      ? included && !minimatch(file, pattern.slice(1)) : included || minimatch(file, pattern), false);
    assert.equal(selected(platform === 'win' ? 'whisper-cli.exe' : 'whisper-cli'), true);
    assert.equal(selected('manifest.json'), true);
    assert.equal(selected('licenses/Whisper-model-LICENSE.txt'), true);
    assert.equal(selected('model.bin'), false);
  }
});

test('engine-only preparation verifies its binary without requiring or downloading a model', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'starpath-asr-package-'));
  try {
    const binary = Buffer.from('engine fixture');
    await fs.writeFile(path.join(directory, 'whisper-cli'), binary);
    await fs.mkdir(path.join(directory, 'licenses'));
    for (const file of ['whisper.cpp-LICENSE.txt', 'Whisper-model-LICENSE.txt', 'miniaudio-LICENSE.txt']) {
      await fs.writeFile(path.join(directory, 'licenses', file), 'license fixture');
    }
    await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ target: 'mac-arm64',
      engineVersion: manifest.engineVersion, modelSha256: manifest.model.sha256,
      executableSha256: crypto.createHash('sha256').update(binary).digest('hex') }));
    assert.equal(await verifyPreparedRuntime(directory, 'mac-arm64', { includeModel: false }), true);
    assert.equal(await verifyPreparedRuntime(directory, 'mac-arm64', { includeModel: true }), false);
    await fs.writeFile(path.join(directory, 'whisper-cli'), 'modified engine');
    assert.equal(await verifyPreparedRuntime(directory, 'mac-arm64', { includeModel: false }), false);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
