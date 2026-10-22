import { describe, expect, test, vi } from 'vitest';

import { PLATFORM_MODEL_BASE_URL } from '../../shared/auth/platformConfig';
import { defaultConfig } from '../config';
import { buildPlatformConfigUpdate, CONNECTIVITY_TEST_TOKEN_BUDGET, normalizePlatformBaseUrl, parsePlatformModels, PlatformErrorCode, type PlatformProvidersConfig as ProvidersConfig, preparePlatformConfigUpdate, resolvePlatformProviderId, syncPlatformModels, testPlatformConnection } from './starpathPlatform';

describe('StarPath gateway configuration', () => {
  test.each([
    ['https://gateway.example', 'https://gateway.example/v1'],
    [' https://gateway.example/v1/ ', 'https://gateway.example/v1'],
    ['https://gateway.example/proxy', 'https://gateway.example/proxy/v1'],
    ['https://gateway.example/proxy/v1/models', 'https://gateway.example/proxy/v1'],
    ['http://127.0.0.1:9876/v1/chat/completions', 'http://127.0.0.1:9876/v1'],
    ['https://gateway.example/v1/responses', 'https://gateway.example/v1'],
  ])('normalizes %s consistently for discovery and conversation', (input, expected) => {
    expect(normalizePlatformBaseUrl(input)).toBe(expected);
  });

  test.each(['file:///secret', 'ftp://gateway.example', 'https://key@gateway.example', 'https://gateway.example?key=secret', 'https://gateway.example/#secret', 'not a URL'])('rejects unsafe or invalid URL %s', value => {
    expect(() => normalizePlatformBaseUrl(value)).toThrow(PlatformErrorCode.InvalidUrl);
  });

  test('preserves managed provider identity and does not overwrite unrelated connections', () => {
    const config = { enabled: false, apiKey: '', baseUrl: '', models: [] };
    const providers: ProvidersConfig = { custom_0: config, custom_2: config };
    expect(resolvePlatformProviderId(providers, 'custom_2')).toBe('custom_2');
    expect(resolvePlatformProviderId(providers)).toBe('custom_1');
    expect(resolvePlatformProviderId(providers, 'custom_9')).toBe('custom_1');
    expect(resolvePlatformProviderId(providers, 'openai')).toBe('custom_1');
    const full = Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`custom_${index}`, config]));
    expect(resolvePlatformProviderId(full)).toBe('custom_30');
    expect(resolvePlatformProviderId({ ...full, custom_30: config }, 'custom_30')).toBe('custom_30');
  });

  test('activates only the platform gateway and retains legacy credentials and model records', () => {
    const legacy = { enabled: true, apiKey: 'legacy-key', baseUrl: 'https://legacy.example', models: [{ id: 'legacy-model', name: 'Legacy' }] };
    const gateway = { enabled: true, apiKey: ' platform-key ', baseUrl: 'https://gateway.example/', models: [{ id: 'platform-model', name: 'Platform' }] };
    const providers = { openai: legacy, custom_3: gateway };
    const update = buildPlatformConfigUpdate(providers, 'custom_3', 'legacy-model', defaultConfig.model);
    expect(update.providers?.openai).toEqual({ ...legacy, enabled: false });
    expect(update.providers?.custom_3).toMatchObject({ enabled: true, apiKey: 'platform-key', baseUrl: PLATFORM_MODEL_BASE_URL, apiFormat: 'openai', authType: 'apikey' });
    expect(update.api).toEqual({ key: 'platform-key', baseUrl: PLATFORM_MODEL_BASE_URL });
    expect(update.model).toMatchObject({ defaultModel: 'platform-model', defaultModelProvider: 'custom_3', availableModels: gateway.models });
    expect(providers).toEqual({ openai: legacy, custom_3: gateway });
    expect(legacy.enabled).toBe(true);
  });

  test('disabling the platform never falls back to an unrelated provider', () => {
    const update = buildPlatformConfigUpdate({
      openai: { enabled: true, apiKey: 'legacy-key', baseUrl: 'https://legacy.example' },
      custom_1: { enabled: false, apiKey: '', baseUrl: '', models: [] },
    }, 'custom_1', 'old-model', defaultConfig.model);
    expect(update.providers?.openai.enabled).toBe(false);
    expect(update.api).toEqual({ key: '', baseUrl: PLATFORM_MODEL_BASE_URL });
    expect(update.model).toMatchObject({ defaultModel: '', defaultModelProvider: undefined, availableModels: [] });
  });

  test('does not migrate a connection until a valid platform identity is configured', () => {
    const providers = { openai: { enabled: true, apiKey: 'key', baseUrl: 'https://legacy.example' } };
    expect(buildPlatformConfigUpdate(providers, undefined, 'model', defaultConfig.model)).toEqual({});
    expect(buildPlatformConfigUpdate(providers, 'openai', 'model', defaultConfig.model)).toEqual({});
    expect(buildPlatformConfigUpdate(providers, 'custom_3', 'model', defaultConfig.model)).toEqual({});
  });

  test.each([
    [{ enabled: true, apiKey: '', baseUrl: 'https://gateway.example', models: [{ id: 'model', name: 'Model' }] }, PlatformErrorCode.MissingKey],
    [{ enabled: true, apiKey: 'key', baseUrl: 'https://gateway.example', models: [] }, PlatformErrorCode.EmptyCatalog],
  ])('rejects incomplete enabled connections before changing stored routing', (provider, error) => {
    expect(() => buildPlatformConfigUpdate({ custom_0: provider }, 'custom_0', 'model', defaultConfig.model)).toThrow(error);
  });

  test('ignores attempted gateway edits when saving managed routing', () => {
    const update = buildPlatformConfigUpdate({ custom_0: { enabled: true, apiKey: 'key', baseUrl: 'https://other.example', models: [{ id: 'model', name: 'Model' }] } }, 'custom_0', 'model', defaultConfig.model);
    expect(update.api?.baseUrl).toBe(PLATFORM_MODEL_BASE_URL);
    expect(update.providers?.custom_0.baseUrl).toBe(PLATFORM_MODEL_BASE_URL);
  });

  test('saving only a key discovers models from the fixed platform and chooses an available model', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, data: { data: [{ id: 'new-model' }] } });
    const providers = { custom_0: { enabled: false, apiKey: ' platform-key ', baseUrl: 'https://other.example', models: [] } };
    const update = await preparePlatformConfigUpdate(providers, 'custom_0', 'old-model', defaultConfig, fetch);
    expect(fetch.mock.calls[0][0].url).toBe(PLATFORM_MODEL_BASE_URL + '/models');
    expect(update.api).toEqual({ key: 'platform-key', baseUrl: PLATFORM_MODEL_BASE_URL });
    expect(update.model?.defaultModel).toBe('new-model');
    expect(update.providers?.custom_0.enabled).toBe(true);
    expect(providers.custom_0.models).toEqual([]);
  });

  test('a rejected key cannot replace saved credentials; clearing requires no remote request', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, data: { message: 'bad key' } });
    const providers = { custom_0: { enabled: true, apiKey: 'bad-key', baseUrl: PLATFORM_MODEL_BASE_URL, models: [] } };
    await expect(preparePlatformConfigUpdate(providers, 'custom_0', '', defaultConfig, fetch)).rejects.toMatchObject({ code: PlatformErrorCode.RequestFailed, status: 401 });
    fetch.mockClear();
    const cleared = await preparePlatformConfigUpdate({ custom_0: { ...providers.custom_0, apiKey: '' } }, 'custom_0', '', defaultConfig, fetch);
    expect(fetch).not.toHaveBeenCalled();
    expect(cleared.api?.key).toBe('');
    expect(cleared.providers?.custom_0.enabled).toBe(false);
  });

  test('saving on the key page revalidates an unchanged key; unrelated settings need no model request', async () => {
    const provider = { enabled: true, apiKey: 'platform-key', baseUrl: PLATFORM_MODEL_BASE_URL, models: [{ id: 'cached', name: 'Cached' }] };
    const previous = { ...defaultConfig, providers: { custom_0: provider } };
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, data: {} });
    await preparePlatformConfigUpdate(previous.providers, 'custom_0', 'cached', previous, fetch);
    expect(fetch).not.toHaveBeenCalled();
    await expect(preparePlatformConfigUpdate(previous.providers, 'custom_0', 'cached', previous, fetch, true)).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('deduplicates discovery while preserving existing model capabilities and custom parameters', () => {
    const existing = { id: 'vision-model', name: 'Vision', supportsImage: true, contextWindow: 128000, customParams: { temperature: 0.5 } };
    const result = parsePlatformModels({ data: [{ id: 'vision-model' }, { id: 'vision-model' }, { id: 'new-model' }] }, [existing]);
    expect(result).toEqual([existing, { id: 'new-model', name: 'new-model', supportsImage: false }]);
    expect(result[0]).not.toBe(existing);
  });

  test('rejects malformed or empty catalogs before replacing a user configuration', () => {
    expect(() => parsePlatformModels({ data: [] })).toThrow(PlatformErrorCode.EmptyCatalog);
    expect(() => parsePlatformModels({ models: [] })).toThrow(PlatformErrorCode.InvalidCatalog);
    expect(() => parsePlatformModels({ data: [{ id: 'valid' }, { id: 1 }] })).toThrow(PlatformErrorCode.InvalidCatalog);
  });

  test('applies observed capabilities only with the explicit matching discovery origin', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, data: { data: [
      { id: 'deepseek-flash' }, { id: 'image-model', supportsThinking: true }, { id: 'deepseek-other' },
    ] } });
    const models = await syncPlatformModels(fetch, 'http://127.0.0.1:3303/v1', 'test-key', []);
    expect(models[0]).toEqual({ id: 'deepseek-flash', name: 'deepseek-flash', supportsImage: false, supportsThinking: true });
    expect(models[1]).not.toHaveProperty('supportsThinking');
    expect(models[2]).not.toHaveProperty('supportsThinking');
    expect((await syncPlatformModels(fetch, 'http://127.0.0.1:3313/v1', 'test-key', []))[0]).not.toHaveProperty('supportsThinking');
    expect(parsePlatformModels({ data: [{ id: 'deepseek-flash' }] })[0]).not.toHaveProperty('supportsThinking');
  });

  test('repairs cached platform discovery on save while preserving manual opt-out', async () => {
    const loadForOrigin = async (baseUrl: string) => {
      vi.resetModules();
      vi.doMock('../../shared/auth/platformConfig', async (importOriginal) => ({
        ...await importOriginal<typeof import('../../shared/auth/platformConfig')>(),
        PLATFORM_MODEL_BASE_URL: baseUrl,
      }));
      return import('./starpathPlatform');
    };
    try {
      const baseUrl = 'http://127.0.0.1:3303/v1';
      const { buildPlatformConfigUpdate: saveConfirmed } = await loadForOrigin(baseUrl);
      const saved = { enabled: true, apiKey: 'test-key', baseUrl,
        models: [{ id: 'deepseek-flash', name: 'Saved alias', supportsImage: false }] };
      const update = saveConfirmed({ custom_0: saved }, 'custom_0', 'deepseek-flash', defaultConfig.model);
      expect(update.providers?.custom_0.models?.[0]).toMatchObject({ name: 'Saved alias', supportsThinking: true });
      expect(update.model?.availableModels).toEqual(update.providers?.custom_0.models);
      const manual = { ...saved, models: [{ ...saved.models[0], supportsThinking: false, customParams: { temperature: 0.2 } }] };
      const manualUpdate = saveConfirmed({ custom_0: manual }, 'custom_0', 'deepseek-flash', defaultConfig.model);
      expect(manualUpdate.providers?.custom_0.models).toEqual(manual.models);
      expect(manualUpdate.model?.availableModels).toEqual(manual.models);
      expect(saved.models[0]).not.toHaveProperty('supportsThinking');

      const { buildPlatformConfigUpdate: saveUnknown } = await loadForOrigin('https://unconfirmed.example/v1');
      const unknownUpdate = saveUnknown({ custom_0: saved }, 'custom_0', 'deepseek-flash', defaultConfig.model);
      expect(unknownUpdate.providers?.custom_0.models).toEqual(saved.models);
      expect(unknownUpdate.model?.availableModels).toEqual(saved.models);
    } finally {
      vi.doUnmock('../../shared/auth/platformConfig');
      vi.resetModules();
    }
  });

  test('discovers models through the IPC transport with credentials confined to the authorization header', async () => {
    const fetchApi = vi.fn().mockResolvedValue({ ok: true, status: 200, data: { data: [{ id: 'chat-model' }] } });
    const result = await syncPlatformModels(fetchApi, 'https://gateway.example', ' secret-key ', []);
    expect(result[0].id).toBe('chat-model');
    expect(fetchApi).toHaveBeenCalledWith({
      url: 'https://gateway.example/v1/models', method: 'GET', headers: { Authorization: 'Bearer secret-key' },
    });
  });

  test('does not send a request when credentials are missing', async () => {
    const fetchApi = vi.fn();
    await expect(syncPlatformModels(fetchApi, 'https://gateway.example', ' ', [])).rejects.toMatchObject({ code: PlatformErrorCode.MissingKey });
    expect(fetchApi).not.toHaveBeenCalled();
  });

  test('reports HTTP status without exposing a remote body containing credentials', async () => {
    const fetchApi = vi.fn().mockResolvedValue({ ok: false, status: 401, data: { error: { message: 'secret-key' } } });
    await expect(syncPlatformModels(fetchApi, 'https://gateway.example', 'secret-key', [])).rejects.toMatchObject({ code: PlatformErrorCode.RequestFailed, status: 401, message: PlatformErrorCode.RequestFailed });
  });

  test('tests the selected model with a real bounded chat request', async () => {
    const fetchApi = vi.fn().mockResolvedValue({ ok: true, status: 200, data: { choices: [{ message: { content: 'Hi' } }] } });
    await testPlatformConnection(fetchApi, 'https://gateway.example/v1', 'key', 'selected-model');
    const request = fetchApi.mock.calls[0][0];
    expect(request.url).toBe('https://gateway.example/v1/chat/completions');
    expect(request.method).toBe('POST');
    expect(JSON.parse(request.body)).toMatchObject({ model: 'selected-model', stream: false, max_tokens: CONNECTIVITY_TEST_TOKEN_BUDGET });
  });

  test('uses the supported token parameter when testing an OpenAI reasoning model through the gateway', async () => {
    const fetchApi = vi.fn().mockResolvedValue({ ok: true, status: 200, data: { choices: [{ message: { content: 'Hi' } }] } });
    await testPlatformConnection(fetchApi, 'https://gateway.example', 'key', 'openai/gpt-5');
    const body = JSON.parse(fetchApi.mock.calls[0][0].body);
    expect(body.max_completion_tokens).toBe(CONNECTIVITY_TEST_TOKEN_BUDGET);
    expect(body.max_tokens).toBeUndefined();
  });

  test('does not treat a successful HTML page as a model connection', async () => {
    const fetchApi = vi.fn().mockResolvedValue({ ok: true, status: 200, data: '<html>login</html>' });
    await expect(testPlatformConnection(fetchApi, 'https://gateway.example', 'key', 'model')).rejects.toMatchObject({ code: PlatformErrorCode.InvalidCompletion });
  });
});
