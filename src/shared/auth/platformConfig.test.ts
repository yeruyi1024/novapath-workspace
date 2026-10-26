import { describe, expect, test } from 'vitest';

import { lockPlatformConfig, PLATFORM_MODEL_BASE_URL } from './platformConfig';

describe('fixed platform model routing', () => {
  test('preserves old credentials without sending them to the new platform', () => {
    const old = { enabled: true, apiKey: 'legacy-key', baseUrl: 'https://other.example/v1', models: [{ id: 'old', name: 'Old' }] };
    const input = { providers: { custom_0: old }, api: { key: 'legacy-key', baseUrl: old.baseUrl },
      model: { defaultModel: 'old', defaultModelProvider: 'custom_0' } };
    const result = lockPlatformConfig(input);
    expect(result.platformProviderId).toBe('custom_1');
    expect(result.providers.custom_0).toEqual({ ...old, enabled: false });
    expect(result.providers[result.platformProviderId]).toMatchObject({ apiKey: '', baseUrl: PLATFORM_MODEL_BASE_URL, enabled: false, models: [] });
    expect(result.api).toEqual({ key: '', baseUrl: PLATFORM_MODEL_BASE_URL });
    expect(result.model).toMatchObject({ defaultModel: '', defaultModelProvider: undefined });
    expect(old.enabled).toBe(true);
  });

  test('adopts an existing company gateway slot and retains its selected model', () => {
    const provider = { enabled: true, apiKey: ' platform-key ', baseUrl: PLATFORM_MODEL_BASE_URL + '/',
      models: [{ id: 'first', name: 'First' }, { id: 'second', name: 'Second' }] };
    const result = lockPlatformConfig({ providers: { custom_4: provider }, model: { defaultModel: 'second' } });
    expect(result.platformProviderId).toBe('custom_4');
    expect(result.providers.custom_4).toMatchObject({ enabled: true, apiKey: 'platform-key', apiFormat: 'openai', authType: 'apikey' });
    expect(result.model).toMatchObject({ defaultModel: 'second', defaultModelProvider: 'custom_4' });
    expect(lockPlatformConfig(result)).toEqual(result);
  });

  test('clamps every managed config write and disables alternate routes including OAuth', () => {
    const result = lockPlatformConfig({ platformProviderId: 'custom_0',
      providers: { custom_0: { enabled: true, apiKey: 'platform-key', baseUrl: PLATFORM_MODEL_BASE_URL, apiFormat: 'anthropic' as const,
        codingPlanEnabled: true, oauthBaseUrl: 'https://oauth.example', oauthAccessToken: 'old-token', models: [{ id: 'model', name: 'Model' }] },
      openai: { enabled: true, apiKey: 'legacy-key', baseUrl: 'https://other.example' } },
      api: { key: 'wrong-key', baseUrl: 'https://other.example' }, model: { defaultModel: 'missing' } });
    expect(result.api).toEqual({ key: 'platform-key', baseUrl: PLATFORM_MODEL_BASE_URL });
    expect(result.providers.custom_0).toMatchObject({ baseUrl: PLATFORM_MODEL_BASE_URL, apiFormat: 'openai',
      authType: 'apikey', codingPlanEnabled: false, oauthBaseUrl: undefined, oauthAccessToken: undefined });
    expect(result.providers.openai.enabled).toBe(false);
    expect(result.model.defaultModel).toBe('model');
  });

  test('empty credentials never expose catalog defaults or reactivate another provider', () => {
    const result = lockPlatformConfig({ platformProviderId: 'custom_0', providers: {
      custom_0: { enabled: true, apiKey: '', baseUrl: '', models: [{ id: 'cached', name: 'Cached' }] },
    }, model: { defaultModel: 'cached' } });
    expect(result.providers.custom_0.enabled).toBe(false);
    expect(result.model).toMatchObject({ availableModels: [], defaultModel: '' });
    expect(result.api).toEqual({ key: '', baseUrl: PLATFORM_MODEL_BASE_URL });
  });
});


test('an explicitly selected online slot cannot carry its key into local MaaS', () => {
  const online = { enabled: true, apiKey: 'online-only-key', baseUrl: 'https://gateway.ai.shilijia.xyz/v1', models: [{ id: 'online-model', name: 'Online' }] };
  const result = lockPlatformConfig({ platformProviderId: 'custom_0', providers: { custom_0: online }, model: { defaultModel: 'online-model' } });
  expect(result.platformProviderId).toBe('custom_1');
  expect(result.providers.custom_0).toEqual({ ...online, enabled: false });
  expect(result.providers.custom_1).toMatchObject({ apiKey: '', enabled: false, baseUrl: PLATFORM_MODEL_BASE_URL });
  expect(result.api.key).toBe('');
  expect(result.model.defaultModel).toBe('');
});

test('switching local databases preserves the old key and selects only the new environment', () => {
  const old = { enabled: true, apiKey: 'old-local-only', baseUrl: 'http://127.0.0.1:3000/v1', models: [{ id: 'old-model', name: 'Old' }] };
  const current = { enabled: false, apiKey: 'pc-image-only', baseUrl: PLATFORM_MODEL_BASE_URL, models: [{ id: 'deepseek-flash', name: 'DeepSeek' }] };
  const result = lockPlatformConfig({ platformProviderId: 'custom_0', providers: { custom_0: old, custom_1: current }, model: { defaultModel: 'old-model' } });
  expect(result.platformProviderId).toBe('custom_1');
  expect(result.providers.custom_0).toEqual({ ...old, enabled: false });
  expect(result.api).toEqual({ key: 'pc-image-only', baseUrl: 'http://127.0.0.1:3303/v1' });
  expect(result.model.defaultModel).toBe('deepseek-flash');
});
