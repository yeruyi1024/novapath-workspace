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
      providers: { custom_0: { enabled: true, apiKey: 'platform-key', baseUrl: 'https://other.example', apiFormat: 'anthropic' as const,
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
