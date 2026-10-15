import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, test } from 'vitest';

import { createRendererSnapshot } from './rendererSnapshot';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));
function source() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'renderer-snapshot-test-'));
  roots.push(root);
  const dist = path.join(root, 'dist');
  fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'index.html'), '<script src="./assets/editor-old.js"></script>');
  fs.writeFileSync(path.join(dist, 'assets/editor-old.js'), 'old editor');
  return { root, dist };
}

test('keeps lazy chunks available after dist is replaced by a new build', () => {
  const { root, dist } = source();
  const snapshot = createRendererSnapshot(dist, root);
  fs.rmSync(dist, { recursive: true });
  fs.mkdirSync(dist);
  fs.writeFileSync(path.join(dist, 'index.html'), 'new build');
  expect(fs.readFileSync(snapshot.entry, 'utf8')).toContain('editor-old.js');
  expect(fs.readFileSync(path.join(path.dirname(snapshot.entry), 'assets/editor-old.js'), 'utf8')).toBe('old editor');
  snapshot.dispose();
  expect(fs.existsSync(snapshot.entry)).toBe(false);
});

test('cleans an incomplete snapshot when its entry is missing', () => {
  const { root, dist } = source();
  fs.unlinkSync(path.join(dist, 'index.html'));
  expect(() => createRendererSnapshot(dist, root)).toThrow();
  expect(fs.readdirSync(root)).toEqual(['dist']);
});
