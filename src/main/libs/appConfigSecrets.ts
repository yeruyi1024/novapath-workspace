export interface SecretStorage {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend?(): string;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

const SECRET_FORMAT = 'starpath.safeStorage.v1';
type SecretEnvelope = { format: typeof SECRET_FORMAT; ciphertext: string };
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isEnvelope = (value: unknown): value is SecretEnvelope =>
  isRecord(value) && value.format === SECRET_FORMAT && typeof value.ciphertext === 'string';

/** Only model credentials are transformed. Callers continue to receive normal config. */
export class AppConfigSecrets {
  constructor(private readonly storage?: SecretStorage) {}

  isAvailable(): boolean {
    return Boolean(this.storage?.isEncryptionAvailable())
      && this.storage?.getSelectedStorageBackend?.() !== 'basic_text';
  }

  private requireStorage(): SecretStorage {
    if (!this.isAvailable() || !this.storage) {
      throw new Error('System credential storage is unavailable. Unlock the system keychain/keyring before saving API keys.');
    }
    return this.storage;
  }

  private transform(value: unknown, decode: boolean): unknown {
    if (!isRecord(value)) return value;
    const result = { ...value };
    const transformSecret = (secret: unknown): unknown => {
      if (decode) {
        if (!isEnvelope(secret)) return secret;
        try {
          return this.requireStorage().decryptString(Buffer.from(secret.ciphertext, 'base64'));
        } catch {
          // Never replace an unreadable key with an empty/default config.
          throw new Error('Stored API keys could not be unlocked. Restore access to the original system keychain/keyring.');
        }
      }
      if (isEnvelope(secret)) return secret;
      if (typeof secret !== 'string' || !secret) return secret;
      const storage = this.requireStorage();
      try {
        const ciphertext = storage.encryptString(secret);
        if (storage.decryptString(ciphertext) !== secret) throw new Error('Roundtrip failed');
        return { format: SECRET_FORMAT, ciphertext: ciphertext.toString('base64') };
      } catch {
        throw new Error('System credential storage is unavailable. API keys were not saved.');
      }
    };
    if (isRecord(result.api)) result.api = { ...result.api, key: transformSecret(result.api.key) };
    if (isRecord(result.providers)) {
      result.providers = Object.fromEntries(Object.entries(result.providers).map(([id, provider]) => [
        id, isRecord(provider) ? { ...provider, apiKey: transformSecret(provider.apiKey) } : provider,
      ]));
    }
    return result;
  }

  encode(value: unknown): unknown { return this.transform(value, false); }
  decode(value: unknown): unknown { return this.transform(value, true); }
}
