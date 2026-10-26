import { describe, expect, test, vi } from 'vitest';

import { PLATFORM_MODEL_BASE_URL } from '../../shared/auth/platformConfig';
import { type AppConfig, defaultConfig } from '../config';
import { clearManagedPlatformKey, hasActivePlatformConversation, managedModelSyncContext, syncManagedPlatformKey } from './managedPlatformKey';

const modelsResponse = { ok: true, status: 200, data: { data: [{ id: 'platform-model' }] } };

function createDeps(overrides: { key?: { accountId: number; key: string } | null; config?: Partial<AppConfig> } = {}) {
  let config = { ...defaultConfig, ...overrides.config } as AppConfig;
  const updateConfig = vi.fn(async (update: Partial<AppConfig>) => { config = { ...config, ...update } as AppConfig; });
  const fetchApi = vi.fn().mockResolvedValue(modelsResponse);
  const key = overrides.key === undefined ? { accountId: 7, key: 'managed-key-7' } : overrides.key;
  const fetchManagedKey = vi.fn().mockResolvedValue(key ? { success: true, managedKey: key } : { success: false });
  return { deps: { fetchManagedKey, getConfig: () => config, updateConfig, fetchApi }, updateConfig, fetchApi, fetchManagedKey, read: () => config };
}

describe('managed platform key', () => {
  test('writes the platform-issued key and discovers models with it', async () => {
    const { deps, updateConfig, fetchApi, read } = createDeps();
    await expect(syncManagedPlatformKey(7, deps)).resolves.toBe(true);
    expect(fetchApi).toHaveBeenCalledWith(expect.objectContaining({
      url: expect.stringContaining(PLATFORM_MODEL_BASE_URL),
      headers: expect.objectContaining({ Authorization: 'Bearer managed-key-7' }),
    }));
    expect(updateConfig).toHaveBeenCalledTimes(1);
    const id = read().platformProviderId!;
    expect(read().providers?.[id]).toMatchObject({ apiKey: 'managed-key-7', enabled: true, baseUrl: PLATFORM_MODEL_BASE_URL });
    expect(read().api.key).toBe('managed-key-7');
  });

  test('rejects a key issued for a different account', async () => {
    const { deps, updateConfig } = createDeps({ key: { accountId: 8, key: 'someone-elses-key' } });
    await expect(syncManagedPlatformKey(7, deps)).resolves.toBe(false);
    expect(updateConfig).not.toHaveBeenCalled();
  });

  test('keeps existing routing untouched when the platform cannot issue a key', async () => {
    const { deps, updateConfig } = createDeps({ key: null });
    await expect(syncManagedPlatformKey(7, deps)).resolves.toBe(false);
    expect(updateConfig).not.toHaveBeenCalled();
  });

  test('does not rewrite config or rediscover models when nothing changed', async () => {
    const { deps, updateConfig, fetchApi } = createDeps();
    await syncManagedPlatformKey(7, deps);
    updateConfig.mockClear();
    fetchApi.mockClear();
    await expect(syncManagedPlatformKey(7, deps)).resolves.toBe(false);
    expect(updateConfig).not.toHaveBeenCalled();
    expect(fetchApi).not.toHaveBeenCalled();
  });

  describe('following account permissions', () => {
    test('refresh context separates platform, account and group, with a default fallback', () => {
      const current = managedModelSyncContext('http://localhost', 7, 'default');
      expect(managedModelSyncContext('http://localhost', 7, undefined)).toBe(current);
      expect(managedModelSyncContext('http://localhost', 7, '  ')).toBe(current);
      expect(managedModelSyncContext('http://localhost', 7, 'pro')).not.toBe(current);
      expect(managedModelSyncContext('http://localhost', 8, 'default')).not.toBe(current);
      expect(managedModelSyncContext('http://other.local', 7, 'default')).not.toBe(current);
    });

    test('defers for streaming, current execution and background execution', () => {
      const idle = { isStreaming: false, currentSession: null, sessions: [] };
      expect(hasActivePlatformConversation(idle)).toBe(false);
      expect(hasActivePlatformConversation({ ...idle, isStreaming: true })).toBe(true);
      expect(hasActivePlatformConversation({ ...idle, currentSession: { status: 'running' } })).toBe(true);
      expect(hasActivePlatformConversation({ ...idle, sessions: [{ status: 'completed' }, { status: 'running' }] })).toBe(true);
      expect(hasActivePlatformConversation({ ...idle, sessions: [{ status: 'completed' }] })).toBe(false);
    });

    test('a reused key discovers new group models without sending a group override', async () => {
      const base = createDeps();
      await syncManagedPlatformKey(7, base.deps);
      base.fetchApi.mockResolvedValueOnce({ ok: true, status: 200, data: { data: [{ id: 'new-group-model' }] } });
      await expect(syncManagedPlatformKey(7, { ...base.deps, refreshModels: true })).resolves.toBe(true);
      expect(base.read().api.key).toBe('managed-key-7');
      expect(base.read().model.defaultModel).toBe('new-group-model');
      expect(base.read().model.availableModels.map(model => model.id)).toEqual(['new-group-model']);
      expect(base.fetchApi.mock.lastCall?.[0]).toEqual({
        url: `${PLATFORM_MODEL_BASE_URL}/models`, method: 'GET', headers: { Authorization: 'Bearer managed-key-7' },
      });
    });

    test('preserves a selected model that is still allowed and other preferences', async () => {
      const base = createDeps();
      await syncManagedPlatformKey(7, base.deps);
      await base.deps.updateConfig({ theme: 'dark' });
      base.fetchApi.mockResolvedValueOnce({ ok: true, status: 200, data: { data: [{ id: 'another-model' }, { id: 'platform-model' }] } });
      await syncManagedPlatformKey(7, { ...base.deps, refreshModels: true });
      expect(base.read().model.defaultModel).toBe('platform-model');
      expect(base.read().theme).toBe('dark');
    });

    test('a successful unchanged catalog does not reconfigure the runtime', async () => {
      const base = createDeps();
      await syncManagedPlatformKey(7, base.deps);
      base.updateConfig.mockClear();
      await expect(syncManagedPlatformKey(7, { ...base.deps, refreshModels: true })).resolves.toBe(true);
      expect(base.fetchApi).toHaveBeenCalledTimes(2);
      expect(base.updateConfig).not.toHaveBeenCalled();
    });

    test('a valid empty catalog disables stale models while retaining the issued key', async () => {
      const base = createDeps();
      await syncManagedPlatformKey(7, base.deps);
      base.fetchApi.mockResolvedValueOnce({ ok: true, status: 200, data: { data: [] } });
      await expect(syncManagedPlatformKey(7, { ...base.deps, refreshModels: true })).resolves.toBe(true);
      expect(base.read().providers?.[base.read().platformProviderId!]).toMatchObject({ apiKey: 'managed-key-7', enabled: false, models: [] });
      expect(base.read().model.availableModels).toEqual([]);
      expect(base.read().model.defaultModel).toBe('');
      await expect(syncManagedPlatformKey(7, { ...base.deps, refreshModels: true })).resolves.toBe(true);
      expect(base.read().api.key).toBe('managed-key-7');
    });

    test.each([
      { ok: false, status: 503, data: null },
      { ok: true, status: 200, data: { data: [{}] } },
    ])('a failed catalog refresh keeps the key, model and config for retry ($status)', async response => {
      const base = createDeps();
      await syncManagedPlatformKey(7, base.deps);
      const saved = base.read();
      base.updateConfig.mockClear();
      base.fetchApi.mockResolvedValueOnce(response);
      await expect(syncManagedPlatformKey(7, { ...base.deps, refreshModels: true })).rejects.toThrow();
      expect(base.read()).toBe(saved);
      expect(base.updateConfig).not.toHaveBeenCalled();
      await expect(syncManagedPlatformKey(7, { ...base.deps, refreshModels: true })).resolves.toBe(true);
    });

    test('busy conversations defer discovery before making requests', async () => {
      const base = createDeps();
      await expect(syncManagedPlatformKey(7, { ...base.deps, refreshModels: true, canWriteConfig: () => false })).resolves.toBe(false);
      expect(base.fetchManagedKey).not.toHaveBeenCalled();
      expect(base.fetchApi).not.toHaveBeenCalled();
      expect(base.updateConfig).not.toHaveBeenCalled();
    });

    test('a conversation starting during discovery prevents writes until an idle retry', async () => {
      const base = createDeps();
      await syncManagedPlatformKey(7, base.deps);
      let busy = false;
      let release!: (response: typeof modelsResponse) => void;
      base.fetchApi.mockReturnValueOnce(new Promise<typeof modelsResponse>(resolve => { release = resolve; }));
      base.updateConfig.mockClear();
      const pending = syncManagedPlatformKey(7, { ...base.deps, refreshModels: true, canWriteConfig: () => !busy });
      await vi.waitFor(() => expect(base.fetchApi).toHaveBeenCalledTimes(2));
      busy = true;
      release({ ok: true, status: 200, data: { data: [{ id: 'new-group-model' }] } });
      await expect(pending).resolves.toBe(false);
      expect(base.updateConfig).not.toHaveBeenCalled();
      expect(base.read().model.defaultModel).toBe('platform-model');
      busy = false;
      base.fetchApi.mockResolvedValueOnce({ ok: true, status: 200, data: { data: [{ id: 'new-group-model' }] } });
      await expect(syncManagedPlatformKey(7, { ...base.deps, refreshModels: true, canWriteConfig: () => !busy })).resolves.toBe(true);
      expect(base.read().model.defaultModel).toBe('new-group-model');
    });

    test('a slow response from the previous group cannot overwrite the latest group on the same key', async () => {
      const base = createDeps();
      await syncManagedPlatformKey(7, base.deps);
      let current = true;
      let release!: (response: typeof modelsResponse) => void;
      base.fetchApi.mockReturnValueOnce(new Promise<typeof modelsResponse>(resolve => { release = resolve; }));
      const oldGroup = syncManagedPlatformKey(7, { ...base.deps, refreshModels: true, isCurrent: () => current });
      await vi.waitFor(() => expect(base.fetchApi).toHaveBeenCalledTimes(2));
      current = false;
      base.fetchApi.mockResolvedValueOnce({ ok: true, status: 200, data: { data: [{ id: 'latest-group-model' }] } });
      await syncManagedPlatformKey(7, { ...base.deps, refreshModels: true });
      release(modelsResponse);
      await expect(oldGroup).resolves.toBe(false);
      expect(base.read().model.defaultModel).toBe('latest-group-model');
      expect(base.read().api.key).toBe('managed-key-7');
    });
  });

  test('replaces the previous account key when the account changes', async () => {
    const first = createDeps();
    await syncManagedPlatformKey(7, first.deps);
    const switched = { ...first.deps, fetchManagedKey: vi.fn().mockResolvedValue({ success: true, managedKey: { accountId: 9, key: 'managed-key-9' } }) };
    await expect(syncManagedPlatformKey(9, switched)).resolves.toBe(true);
    const id = first.read().platformProviderId!;
    expect(first.read().providers?.[id].apiKey).toBe('managed-key-9');
  });

  test('sign-out disables platform routing and removes the key', async () => {
    const { deps, read } = createDeps();
    await syncManagedPlatformKey(7, deps);
    await expect(clearManagedPlatformKey(deps)).resolves.toBe(true);
    const id = read().platformProviderId!;
    expect(read().providers?.[id]).toMatchObject({ apiKey: '', enabled: false });
    expect(read().api.key).toBe('');
    await expect(clearManagedPlatformKey(deps)).resolves.toBe(false);
  });

  describe('late responses', () => {
    const deferred = <T,>() => {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>(r => { resolve = r; });
      return { promise, resolve };
    };
    const keyOf = (read: () => AppConfig) => read().providers?.[read().platformProviderId!]?.apiKey ?? '';

    test('sign-out while models load keeps the late response from restoring the key', async () => {
      const base = createDeps();
      await syncManagedPlatformKey(7, base.deps);
      const models = deferred<typeof modelsResponse>();
      const session = { current: true };
      base.fetchApi.mockReturnValueOnce(models.promise);
      base.deps.fetchManagedKey.mockResolvedValue({ success: true, managedKey: { accountId: 7, key: 'rotated-key-7' } });
      const pending = syncManagedPlatformKey(7, { ...base.deps, isCurrent: () => session.current });
      await vi.waitFor(() => expect(base.fetchApi).toHaveBeenCalledTimes(2));
      session.current = false; // cleanup of the signed-in run
      await clearManagedPlatformKey(base.deps);
      models.resolve(modelsResponse);
      await expect(pending).resolves.toBe(false);
      expect(keyOf(base.read)).toBe('');
      expect(base.read().providers?.[base.read().platformProviderId!].enabled).toBe(false);
    });

    test('a slow account A cannot overwrite the key B already saved', async () => {
      const base = createDeps();
      const slowModels = deferred<typeof modelsResponse>();
      let aActive = true;
      base.fetchApi.mockReturnValueOnce(slowModels.promise);
      const a = syncManagedPlatformKey(7, { ...base.deps, isCurrent: () => aActive });
      await vi.waitFor(() => expect(base.fetchApi).toHaveBeenCalledTimes(1));
      aActive = false;
      const b = { ...base.deps, fetchManagedKey: vi.fn().mockResolvedValue({ success: true, managedKey: { accountId: 9, key: 'managed-key-9' } }) };
      await expect(syncManagedPlatformKey(9, b)).resolves.toBe(true);
      slowModels.resolve(modelsResponse);
      await expect(a).resolves.toBe(false);
      expect(keyOf(base.read)).toBe('managed-key-9');
      expect(base.read().api.key).toBe('managed-key-9');
    });

    test('a slow key response after re-login or unmount writes nothing', async () => {
      const base = createDeps();
      const slowKey = deferred<{ success: boolean; managedKey: { accountId: number; key: string } }>();
      let active = true;
      base.deps.fetchManagedKey.mockReturnValueOnce(slowKey.promise);
      const pending = syncManagedPlatformKey(7, { ...base.deps, isCurrent: () => active });
      active = false;
      slowKey.resolve({ success: true, managedKey: { accountId: 7, key: 'managed-key-7' } });
      await expect(pending).resolves.toBe(false);
      expect(base.fetchApi).not.toHaveBeenCalled();
      expect(base.updateConfig).not.toHaveBeenCalled();
    });

    test('the session ending while the config write is queued behind another write skips it', async () => {
      const base = createDeps();
      const release = deferred<void>();
      const originalUpdate = base.updateConfig.getMockImplementation()!;
      base.updateConfig.mockImplementationOnce(async update => { await release.promise; await originalUpdate(update); });
      const first = syncManagedPlatformKey(7, base.deps);
      await vi.waitFor(() => expect(base.updateConfig).toHaveBeenCalledTimes(1));
      let active = true;
      const secondKey = vi.fn().mockResolvedValue({ success: true, managedKey: { accountId: 9, key: 'managed-key-9' } });
      const second = syncManagedPlatformKey(9, { ...base.deps, isCurrent: () => active, fetchManagedKey: secondKey });
      await vi.waitFor(() => expect(secondKey).toHaveBeenCalledTimes(1));
      active = false;
      release.resolve();
      await expect(first).resolves.toBe(true);
      await expect(second).resolves.toBe(false);
      expect(keyOf(base.read)).toBe('managed-key-7');
      expect(base.fetchApi).toHaveBeenCalledTimes(1);
      expect(base.updateConfig).toHaveBeenCalledTimes(1);
    });

    test('same-account re-login while the sign-out clear is still writing keeps the new key', async () => {
      const base = createDeps();
      await syncManagedPlatformKey(7, base.deps);
      const release = deferred<void>();
      const originalUpdate = base.updateConfig.getMockImplementation()!;
      base.updateConfig.mockImplementationOnce(async update => { await release.promise; await originalUpdate(update); });
      const clearing = clearManagedPlatformKey(base.deps);
      await vi.waitFor(() => expect(base.updateConfig).toHaveBeenCalledTimes(2));
      base.fetchApi.mockClear();
      const relogin = syncManagedPlatformKey(7, { ...base.deps, isCurrent: () => true });
      await vi.waitFor(() => expect(base.fetchManagedKey).toHaveBeenCalledTimes(2));
      release.resolve();
      await expect(clearing).resolves.toBe(true);
      await expect(relogin).resolves.toBe(true);
      expect(keyOf(base.read)).toBe('managed-key-7');
      expect(base.read().providers?.[base.read().platformProviderId!].enabled).toBe(true);
      expect(base.fetchApi).toHaveBeenCalledTimes(1);
    });

    test('a temporary key or network failure never clears the saved key', async () => {
      const base = createDeps();
      await syncManagedPlatformKey(7, base.deps);
      base.deps.fetchManagedKey.mockRejectedValueOnce(new Error('offline'));
      await expect(syncManagedPlatformKey(7, base.deps)).rejects.toThrow('offline');
      expect(keyOf(base.read)).toBe('managed-key-7');
    });

    test('model data is applied to the latest config rather than the pre-request snapshot', async () => {
      const base = createDeps();
      const slowModels = deferred<typeof modelsResponse>();
      base.fetchApi.mockReturnValueOnce(slowModels.promise);
      const pending = syncManagedPlatformKey(7, base.deps);
      await vi.waitFor(() => expect(base.fetchApi).toHaveBeenCalledTimes(1));
      await base.deps.updateConfig({ theme: 'dark' } as Partial<AppConfig>);
      slowModels.resolve(modelsResponse);
      await expect(pending).resolves.toBe(true);
      expect((base.read() as AppConfig & { theme?: string }).theme).toBe('dark');
      expect(keyOf(base.read)).toBe('managed-key-7');
    });
  });
});
