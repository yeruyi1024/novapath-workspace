import path from 'node:path';

import { expect, test } from 'vitest';

import { PRODUCT } from '../shared/product';
import { APP_NAME, APP_USER_MODEL_ID, DB_FILENAME } from './appConstants';
import { getProductDataPaths } from './productDataPath';

test('StarPath rebranding preserves the existing data and database identity', () => {
  expect(APP_NAME).toBe(PRODUCT.name);
  expect(APP_USER_MODEL_ID).toBe(PRODUCT.appId);
  const appData = path.join('profile', 'app-data');
  const dataPaths = getProductDataPaths(appData);
  expect(path.dirname(dataPaths.userDataPath)).toBe(appData);
  expect(path.basename(dataPaths.userDataPath)).toBe('API Console');
  expect(path.basename(dataPaths.rollbackRootPath)).toBe('API Console-migration-rollbacks');
  expect(DB_FILENAME).toBe('lobsterai.sqlite');
  expect(PRODUCT.dataDirectory).not.toBe(APP_NAME);
});

test('a future public rename leaves both data paths unchanged', () => {
  const originalName = PRODUCT.name;
  const before = getProductDataPaths(path.join('profile', 'app-data'));
  try {
    PRODUCT.name = 'Future brand';
    expect(getProductDataPaths(path.join('profile', 'app-data'))).toEqual(before);
  } finally {
    PRODUCT.name = originalName;
  }
});
