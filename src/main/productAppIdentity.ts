import { PRODUCT } from '../shared/product';

interface AppIdentity {
  setName(name: string): void;
  once(event: 'ready', listener: () => void): unknown;
}

/** Call before ready: Electron captures this name for macOS/Linux encryption. */
export function configureProductAppIdentity(app: AppIdentity, platform: NodeJS.Platform): void {
  const startupName = platform === 'darwin' || platform === 'linux' ? PRODUCT.storageName : PRODUCT.name;
  app.setName(startupName);
  if (startupName !== PRODUCT.name) {
    // OS crypt is configured before ready; UI can then use the current brand.
    app.once('ready', () => app.setName(PRODUCT.name));
  }
}
