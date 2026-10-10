import fs from 'fs';
import os from 'os';
import path from 'path';
import * as tar from 'tar';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import {
  hasBundledRuntimeEntry,
  INSTALLER_RESOURCES_MARKER,
  INSTALLER_RESOURCES_TAR,
  recoverInstallerResourcesFromTar,
} from './installerResourceRecovery';

describe('installerResourceRecovery', () => {
  let workDir: string;
  let resourcesDir: string;

  const tarPath = () => path.join(resourcesDir, INSTALLER_RESOURCES_TAR);
  const markerPath = () => path.join(resourcesDir, INSTALLER_RESOURCES_MARKER);
  const entryPath = () => path.join(resourcesDir, 'cfmind', 'gateway-bundle.mjs');
  const bundleAssetPath = () => path.join(resourcesDir, 'cfmind', 'web-tree-sitter.wasm');

  const createInstallerTar = async (options: { includeGit?: boolean; missingGit?: string } = {}): Promise<void> => {
    const stagingDir = path.join(workDir, 'staging');
    fs.mkdirSync(path.join(stagingDir, 'cfmind'), { recursive: true });
    fs.mkdirSync(path.join(stagingDir, 'python-win'), { recursive: true });
    fs.writeFileSync(path.join(stagingDir, 'cfmind', 'gateway-bundle.mjs'), 'export const ok = true;\n');
    fs.writeFileSync(path.join(stagingDir, 'cfmind', 'web-tree-sitter.wasm'), 'fake-wasm');
    fs.writeFileSync(path.join(stagingDir, 'python-win', 'python.exe'), 'fake-binary');
    const roots = ['cfmind', 'python-win'];
    if (options.includeGit) {
      roots.push('mingit');
      for (const relative of ['usr/bin/bash.exe', 'cmd/git.exe']) {
        const file = path.join(stagingDir, 'mingit', relative);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, 'fake-git-binary');
      }
      for (const relative of ['dev/shm', 'dev/mqueue']) {
        fs.mkdirSync(path.join(stagingDir, 'mingit', relative), { recursive: true });
      }
      if (options.missingGit) fs.rmSync(path.join(stagingDir, 'mingit', options.missingGit), { recursive: true });
    }
    await tar.create({ file: tarPath(), cwd: stagingDir }, roots);
  };

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'installer-recovery-'));
    resourcesDir = path.join(workDir, 'resources');
    // The installer pre-creates cfmind as an empty directory before extraction
    // starts, so a broken install has the directory but no entry file.
    fs.mkdirSync(path.join(resourcesDir, 'cfmind'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  test('recovers the runtime from a leftover installer tar and cleans up', async () => {
    await createInstallerTar();
    expect(hasBundledRuntimeEntry(resourcesDir)).toBe(false);

    const progressCalls: number[] = [];
    const result = await recoverInstallerResourcesFromTar(resourcesDir, 'test', (progress) => {
      progressCalls.push(progress.bytes);
    });

    expect(result.attempted).toBe(true);
    expect(result.success).toBe(true);
    expect(result.entries).toBeGreaterThan(0);
    expect(hasBundledRuntimeEntry(resourcesDir)).toBe(true);
    expect(fs.existsSync(entryPath())).toBe(true);
    expect(fs.existsSync(bundleAssetPath())).toBe(true);
    expect(fs.existsSync(path.join(resourcesDir, 'python-win', 'python.exe'))).toBe(true);
    // Legacy archives without PortableGit remain recoverable.
    expect(fs.existsSync(path.join(resourcesDir, 'mingit'))).toBe(false);
    // Mirrors the installer success path: marker stamped, archive removed.
    expect(fs.existsSync(markerPath())).toBe(true);
    expect(fs.existsSync(tarPath())).toBe(false);
    // Initial progress callback fires so callers can surface an installing state.
    expect(progressCalls[0]).toBe(0);
  });

  test('is a no-op when the runtime entry is already present and no archive remains', async () => {
    fs.writeFileSync(entryPath(), 'export const ok = true;\n');
    fs.writeFileSync(bundleAssetPath(), 'fake-wasm');

    const result = await recoverInstallerResourcesFromTar(resourcesDir, 'test');

    expect(result.attempted).toBe(false);
    expect(result.success).toBe(true);
    expect(fs.existsSync(tarPath())).toBe(false);
  });

  test('finishes a retained archive when OpenClaw was extracted before PortableGit', async () => {
    await createInstallerTar({ includeGit: true });
    fs.writeFileSync(entryPath(), 'export const ok = true;\n');
    fs.writeFileSync(bundleAssetPath(), 'fake-wasm');
    expect(hasBundledRuntimeEntry(resourcesDir)).toBe(true);
    expect(fs.existsSync(path.join(resourcesDir, 'mingit'))).toBe(false);

    const result = await recoverInstallerResourcesFromTar(resourcesDir, 'interrupted-git-extraction');

    expect(result.attempted).toBe(true);
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(resourcesDir, 'mingit/usr/bin/bash.exe'))).toBe(true);
    expect(fs.existsSync(path.join(resourcesDir, 'mingit/cmd/git.exe'))).toBe(true);
    for (const relative of ['dev/shm', 'dev/mqueue']) {
      expect(fs.statSync(path.join(resourcesDir, 'mingit', relative)).isDirectory()).toBe(true);
    }
    expect(fs.existsSync(markerPath())).toBe(true);
    expect(fs.existsSync(tarPath())).toBe(false);
  });

  test.each(['usr/bin/bash.exe', 'cmd/git.exe', 'dev/shm', 'dev/mqueue'])('keeps a retained archive with incomplete PortableGit missing %s', async missingGit => {
    await createInstallerTar({ includeGit: true, missingGit });
    fs.writeFileSync(entryPath(), 'export const ok = true;\n');
    fs.writeFileSync(bundleAssetPath(), 'fake-wasm');

    const result = await recoverInstallerResourcesFromTar(resourcesDir, 'incomplete-git-archive');

    expect(result.attempted).toBe(true);
    expect(result.success).toBe(false);
    expect(result.error).toContain('PortableGit');
    expect(fs.existsSync(tarPath())).toBe(true);
    expect(fs.existsSync(markerPath())).toBe(false);
  });

  test('recovers when the gateway bundle exists without its required root asset', async () => {
    await createInstallerTar();
    fs.writeFileSync(entryPath(), 'export const incomplete = true;\n');
    expect(hasBundledRuntimeEntry(resourcesDir)).toBe(false);

    const result = await recoverInstallerResourcesFromTar(resourcesDir, 'test');

    expect(result.attempted).toBe(true);
    expect(result.success).toBe(true);
    expect(hasBundledRuntimeEntry(resourcesDir)).toBe(true);
    expect(fs.readFileSync(bundleAssetPath(), 'utf8')).toBe('fake-wasm');
  });

  test('reports failure when no tar is left to recover from', async () => {
    const result = await recoverInstallerResourcesFromTar(resourcesDir, 'test');

    expect(result.attempted).toBe(false);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  test('keeps the tar when extraction fails so it can be retried', async () => {
    fs.writeFileSync(tarPath(), 'this is not a tar archive');

    const result = await recoverInstallerResourcesFromTar(resourcesDir, 'test');

    expect(result.attempted).toBe(true);
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(fs.existsSync(tarPath())).toBe(true);
    expect(fs.existsSync(markerPath())).toBe(false);
  });

  test('keeps the tar when the archive does not contain the runtime entry', async () => {
    const stagingDir = path.join(workDir, 'staging');
    fs.mkdirSync(path.join(stagingDir, 'SKILLs'), { recursive: true });
    fs.writeFileSync(path.join(stagingDir, 'SKILLs', 'readme.txt'), 'no runtime here');
    await tar.create({ file: tarPath(), cwd: stagingDir }, ['SKILLs']);

    const result = await recoverInstallerResourcesFromTar(resourcesDir, 'test');

    expect(result.attempted).toBe(true);
    expect(result.success).toBe(false);
    expect(result.error).toContain('still missing');
    expect(fs.existsSync(tarPath())).toBe(true);
  });

  test('concurrent callers share a single in-flight recovery', async () => {
    await createInstallerTar();

    const first = recoverInstallerResourcesFromTar(resourcesDir, 'test-a');
    const second = recoverInstallerResourcesFromTar(resourcesDir, 'test-b');

    expect(second).toBe(first);
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.success).toBe(true);
    expect(secondResult).toBe(firstResult);
  });
});
