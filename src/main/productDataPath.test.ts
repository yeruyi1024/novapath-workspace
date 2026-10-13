import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, test } from 'vitest';

import { PRODUCT } from '../shared/product';
import { DB_FILENAME } from './appConstants';
import { getProductDataPaths, resolveProductDataPaths } from './productDataPath';

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'starpath-profile-selection-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });
const createProfile = (name: string, bytes: string) => {
  const directory = path.join(root, name);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, DB_FILENAME), bytes);
  return directory;
};

test('fresh installs keep the current profile without creating directories during selection', () => {
  expect(resolveProductDataPaths(root, fs.existsSync)).toEqual(getProductDataPaths(root));
  expect(fs.readdirSync(root)).toEqual([]);
});

test('upgrades reuse an existing upstream database and rollback root without moving files', () => {
  const legacy = createProfile('LobsterAI', 'legacy-fixture-bytes');
  const result = resolveProductDataPaths(root, fs.existsSync);
  expect(result).toEqual({ userDataPath: legacy, rollbackRootPath: path.join(root, 'LobsterAI-migration-rollbacks') });
  expect(fs.readFileSync(path.join(legacy, DB_FILENAME), 'utf8')).toBe('legacy-fixture-bytes');
  expect(fs.existsSync(getProductDataPaths(root).userDataPath)).toBe(false);
  expect(resolveProductDataPaths(root, fs.existsSync)).toEqual(result);
});

test('both existing profiles keep current data and leave legacy bytes untouched', () => {
  const legacy = createProfile('LobsterAI', 'legacy-fixture-bytes');
  const current = createProfile(PRODUCT.dataDirectory, 'current-fixture-bytes');
  expect(resolveProductDataPaths(root, fs.existsSync)).toEqual(getProductDataPaths(root));
  expect(fs.readFileSync(path.join(legacy, DB_FILENAME), 'utf8')).toBe('legacy-fixture-bytes');
  expect(fs.readFileSync(path.join(current, DB_FILENAME), 'utf8')).toBe('current-fixture-bytes');
});

test('an empty preferred directory does not hide a usable legacy profile', () => {
  fs.mkdirSync(getProductDataPaths(root).userDataPath);
  const legacy = createProfile('LobsterAI', 'legacy-fixture-bytes');
  expect(resolveProductDataPaths(root, fs.existsSync).userDataPath).toBe(legacy);
});

test('changing the public brand does not alter profile selection', () => {
  const legacy = createProfile('LobsterAI', 'legacy-fixture-bytes');
  const original = PRODUCT.name;
  try {
    PRODUCT.name = 'Future public name';
    expect(resolveProductDataPaths(root, fs.existsSync).userDataPath).toBe(legacy);
  } finally { PRODUCT.name = original; }
});

test('a legacy directory without its database does not cause a silent profile switch', () => {
  fs.mkdirSync(path.join(root, 'LobsterAI'));
  expect(resolveProductDataPaths(root, fs.existsSync)).toEqual(getProductDataPaths(root));
});
