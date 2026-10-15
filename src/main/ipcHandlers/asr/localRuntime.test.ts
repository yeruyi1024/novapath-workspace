import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import manifest from '../../../shared/asr/local-runtime.json';
import { createLocalAsrRuntimeResolver, localAsrDirectory, LocalAsrModelUnavailable } from './localRuntime';

describe('embedded speech engine paths', () => {
  test('resolves all platforms outside asar and supports spaces', () => {
    const paths = { packaged: false, resourcesPath: '/bundle path', appPath: '/app path', userDataPath: '/user path', platform: 'darwin', arch: 'arm64' };
    expect(localAsrDirectory(paths)).toBe(path.join(paths.appPath, 'resources/asr-runtime/mac-arm64'));
    expect(localAsrDirectory({ ...paths, platform: 'win32', arch: 'x64' })).toBe(path.join(paths.appPath, 'resources/asr-runtime/win-x64'));
    expect(localAsrDirectory({ ...paths, platform: 'linux', arch: 'x64' })).toBe(path.join(paths.appPath, 'resources/asr-runtime/linux-x64'));
    expect(localAsrDirectory({ ...paths, packaged: true })).toBe(path.join(paths.resourcesPath, 'asr-runtime'));
    expect(localAsrDirectory({ ...paths, arch: 'unknown' })).toBeNull();
  });
  test('distinguishes missing engine, absent/truncated model, and wrong target metadata', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'starpath-asr-path-'));
    try {
      const paths = { packaged: true, resourcesPath: directory, appPath: directory, userDataPath: directory, platform: 'darwin', arch: 'arm64' };
      const resolve = createLocalAsrRuntimeResolver(paths);
      expect(await resolve()).toBeNull();
      const runtime = path.join(directory, 'asr-runtime');
      await fs.mkdir(runtime);
      await fs.writeFile(path.join(runtime, 'whisper-cli'), 'engine fixture');
      const metadata = { target: 'mac-arm64', engineVersion: manifest.engineVersion, modelSha256: manifest.model.sha256 };
      await fs.writeFile(path.join(runtime, 'manifest.json'), JSON.stringify(metadata));
      await expect(resolve()).rejects.toBeInstanceOf(LocalAsrModelUnavailable);
      await fs.writeFile(path.join(runtime, 'model.bin'), 'truncated');
      await expect(resolve()).rejects.toBeInstanceOf(LocalAsrModelUnavailable);
      await fs.writeFile(path.join(runtime, 'manifest.json'), JSON.stringify({ ...metadata, target: 'win-x64' }));
      expect(await resolve()).toBeNull();
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  });
});
