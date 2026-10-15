import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, test, vi } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd() } }));
import { resolveDocumentRuntimeRoot } from './documentRuntime';
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

test.each([
  ['darwin', 'arm64', 'mac-arm64', 'bin/python3'],
  ['darwin', 'x64', 'mac-x64', 'bin/python3'],
  ['win32', 'x64', 'win-x64', 'python.exe'],
  ['linux', 'x64', 'linux-x64', 'bin/python3'],
] as const)('resolves %s %s runtime for development and installed apps', (platform, arch, target, executable) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'starpath-document-runtime-'));
  roots.push(root);
  for (const packaged of [false, true]) {
    const runtime = packaged ? path.join(root, 'document-runtime') : path.join(root, 'resources', 'document-runtime', target);
    fs.mkdirSync(path.dirname(path.join(runtime, executable)), { recursive: true });
    fs.writeFileSync(path.join(runtime, executable), 'fixture');
    fs.writeFileSync(path.join(runtime, 'starpath-runtime.json'), JSON.stringify({ target }));
    const options = { packaged, platform, arch, appPath: root, resourcesPath: root };
    expect(resolveDocumentRuntimeRoot(options)).toBe(runtime);
    expect(resolveDocumentRuntimeRoot({ ...options, arch: 'wrong' })).toBeNull();
    fs.rmSync(path.join(runtime, executable));
    expect(resolveDocumentRuntimeRoot(options)).toBeNull();
  }
});
