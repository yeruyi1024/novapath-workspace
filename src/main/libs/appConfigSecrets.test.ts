import crypto from 'node:crypto';

import { expect, test } from 'vitest';

import { AppConfigSecrets, type SecretStorage } from './appConfigSecrets';

export const testSecretStorage: SecretStorage = {
  isEncryptionAvailable: () => true,
  getSelectedStorageBackend: () => 'test-keychain',
  encryptString(value) {
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.alloc(32, 1), Buffer.alloc(12, 2));
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return Buffer.concat([cipher.getAuthTag(), encrypted]);
  },
  decryptString(value) {
    const cipher = crypto.createDecipheriv('aes-256-gcm', Buffer.alloc(32, 1), Buffer.alloc(12, 2));
    cipher.setAuthTag(value.subarray(0, 16));
    return Buffer.concat([cipher.update(value.subarray(16)), cipher.final()]).toString('utf8');
  },
};

test('protects active and disabled provider keys without mutating caller config', () => {
  const secrets = new AppConfigSecrets(testSecretStorage);
  const config = { api: { key: 'active-secret', baseUrl: 'https://example.test/v1' },
    providers: { primary: { apiKey: 'active-secret' }, old: { apiKey: 'old-secret', enabled: false } },
    sqliteAutoBackupEnabled: true, theme: 'dark' };
  const encoded = secrets.encode(config);
  expect(JSON.stringify(encoded)).not.toContain('active-secret');
  expect(JSON.stringify(encoded)).not.toContain('old-secret');
  expect(secrets.decode(encoded)).toEqual(config);
  expect(config.api.key).toBe('active-secret');
  expect(secrets.encode(encoded)).toEqual(encoded);
});

test('refuses plaintext fallback when Linux has only basic_text or keyring is locked', () => {
  for (const storage of [undefined, { ...testSecretStorage, isEncryptionAvailable: () => false },
    { ...testSecretStorage, getSelectedStorageBackend: () => 'basic_text' }]) {
    const secrets = new AppConfigSecrets(storage);
    expect(() => secrets.encode({ api: { key: 'sensitive' } })).toThrow('System credential storage');
    expect(secrets.encode({ api: { key: '' }, theme: 'light' })).toEqual({ api: { key: '' }, theme: 'light' });
  }
});

test('unreadable ciphertext fails explicitly instead of losing configured keys', () => {
  const encoded = new AppConfigSecrets(testSecretStorage).encode({ providers: { platform: { apiKey: 'secret' } } });
  expect(() => new AppConfigSecrets().decode(encoded)).toThrow('could not be unlocked');
  expect(() => new AppConfigSecrets({ ...testSecretStorage, decryptString: () => { throw new Error('secret payload'); } })
    .decode(encoded)).toThrow('could not be unlocked');
});
