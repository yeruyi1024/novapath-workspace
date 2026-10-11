import path from 'node:path';

import { PRODUCT } from '../shared/product';

/** Public names can change without moving the user's projects or database. */
export function getProductDataPaths(appDataPath: string) {
  return {
    userDataPath: path.join(appDataPath, PRODUCT.dataDirectory),
    rollbackRootPath: path.join(appDataPath, `${PRODUCT.dataDirectory}-migration-rollbacks`),
  };
}
