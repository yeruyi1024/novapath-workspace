import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, test } from 'vitest';

import { cpRecursiveSync } from './fsCompat';

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-copy-times-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

test('preserves source/build ordering when compiled output is copied before source in a Chinese path', () => {
  const source = path.join(root, '随包 技能');
  const target = path.join(root, '用户 技能');
  for (const [file, date] of [
    ['server/index.ts', new Date('2026-10-01T00:00:00Z')],
    ['dist/server/index.js', new Date('2026-10-02T00:00:00Z')],
  ] as const) {
    fs.mkdirSync(path.dirname(path.join(source, file)), { recursive: true });
    fs.writeFileSync(path.join(source, file), file);
    fs.utimesSync(path.join(source, file), date, date);
  }

  cpRecursiveSync(source, target, { preserveTimestamps: true });

  const originalBuild = fs.statSync(path.join(source, 'dist/server/index.js'));
  const copiedBuild = fs.statSync(path.join(target, 'dist/server/index.js'));
  expect(copiedBuild.mtimeMs).toBe(originalBuild.mtimeMs);
  expect(fs.statSync(path.join(target, 'server/index.ts')).mtimeMs).toBeLessThan(copiedBuild.mtimeMs);
  expect(fs.readFileSync(path.join(target, 'dist/server/index.js'), 'utf8')).toBe('dist/server/index.js');
});

test('preserving timestamps does not change existing files without force', () => {
  const source = path.join(root, 'source');
  const target = path.join(root, 'target');
  fs.writeFileSync(source, 'bundled');
  fs.writeFileSync(target, 'user changes');
  const date = new Date('2026-09-01T00:00:00Z');
  fs.utimesSync(target, date, date);

  cpRecursiveSync(source, target, { preserveTimestamps: true });

  expect(fs.readFileSync(target, 'utf8')).toBe('user changes');
  expect(fs.statSync(target).mtimeMs).toBe(date.getTime());
});
