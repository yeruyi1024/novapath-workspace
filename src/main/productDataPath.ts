import path from 'node:path';

import { PRODUCT } from '../shared/product';
import { DB_FILENAME } from './appConstants';

/** Public names can change without moving the user's projects or database. */
export function getProductDataPaths(appDataPath: string) {
  return {
    userDataPath: path.join(appDataPath, PRODUCT.dataDirectory),
    rollbackRootPath: path.join(appDataPath, `${PRODUCT.dataDirectory}-migration-rollbacks`),
  };
}

/** Reuse the original profile in place; never merge or relocate user data. */
export function resolveProductDataPaths(appDataPath: string, hasFile: (file: string) => boolean) {
  const preferred = getProductDataPaths(appDataPath);
  if (hasFile(path.join(preferred.userDataPath, DB_FILENAME))) return preferred;
  const legacyRoot = path.join(appDataPath, 'LobsterAI');
  if (hasFile(path.join(legacyRoot, DB_FILENAME))) {
    return { userDataPath: legacyRoot, rollbackRootPath: path.join(appDataPath, 'LobsterAI-migration-rollbacks') };
  }
  return preferred;
}
