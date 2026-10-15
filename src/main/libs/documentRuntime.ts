import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

const platformId = (platform: NodeJS.Platform): string | undefined =>
  ({ darwin: 'mac', win32: 'win', linux: 'linux' } as Partial<Record<NodeJS.Platform, string>>)[platform];

export function resolveDocumentRuntimeRoot(options: {
  packaged: boolean; resourcesPath: string; appPath: string;
  platform?: NodeJS.Platform; arch?: string;
}): string | null {
  const platform = options.platform ?? process.platform;
  const relativePython = platform === 'win32' ? 'python.exe' : 'bin/python3';
  const root = options.packaged ? path.join(options.resourcesPath, 'document-runtime')
    : path.join(options.appPath, 'resources', 'document-runtime', `${platformId(platform)}-${options.arch ?? process.arch}`);
  try {
    const metadata = JSON.parse(fs.readFileSync(path.join(root, 'starpath-runtime.json'), 'utf8')) as { target?: string };
    if (metadata.target !== `${platformId(platform)}-${options.arch ?? process.arch}`) return null;
    return fs.existsSync(path.join(root, relativePython)) ? root : null;
  } catch { return null; }
}

export function appendDocumentRuntimeToEnv(env: Record<string, string | undefined>): Record<string, string | undefined> {
  const root = resolveDocumentRuntimeRoot({ packaged: app.isPackaged, resourcesPath: process.resourcesPath, appPath: app.getAppPath() });
  if (!root) return env;
  const bin = process.platform === 'win32' ? root : path.join(root, 'bin');
  env.PATH = [bin, ...(process.platform === 'win32' ? [path.join(root, 'Scripts')] : []), env.PATH || env.Path || ''].filter(Boolean).join(path.delimiter);
  env.STARPATH_PYTHON = path.join(bin, process.platform === 'win32' ? 'python.exe' : 'python3');
  // Prevent a host Python/venv from changing bundled library discovery.
  env.PYTHONHOME = '';
  env.PYTHONPATH = '';
  env.PYTHONNOUSERSITE = '1';
  return env;
}
