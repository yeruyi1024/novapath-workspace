import { PLATFORM_MODEL_BASE_URL } from '../../shared/auth/platformConfig';
import { ApiFormat, ProviderAuthType } from '../../shared/providers';
import type { AppConfig } from '../config';
import { CoworkSessionStatusValue } from '../types/cowork';
import { buildPlatformConfigUpdate, PlatformError, PlatformErrorCode, type PlatformFetch, type PlatformProviderConfig, resolvePlatformProviderId, syncPlatformModels } from './starpathPlatform';

export interface ManagedKeySyncDeps {
  fetchManagedKey: (accountId: number) => Promise<{ success: boolean; managedKey?: { accountId: number; key: string } }>;
  getConfig: () => AppConfig;
  updateConfig: (update: Partial<AppConfig>) => Promise<void>;
  fetchApi: PlatformFetch;
  /** False once the session that started this sync is gone (sign-out, account switch, re-login, unmount). */
  isCurrent?: () => boolean;
  /** Recheck permissions even when the platform reuses the same key. */
  refreshModels?: boolean;
  /** Rechecked immediately before config writes, including work that was queued. */
  canWriteConfig?: () => boolean;
}

/** A refresh fingerprint only; never a token-group override or a model request parameter. */
export function managedModelSyncContext(origin: string, accountId: number | undefined, group: string | undefined): string {
  return JSON.stringify([origin, accountId, group?.trim() || 'default']);
}

export function hasActivePlatformConversation(activity: {
  isStreaming: boolean;
  currentSession: { status: string } | null;
  sessions: readonly { status: string }[];
}): boolean {
  return activity.isStreaming || activity.currentSession?.status === CoworkSessionStatusValue.Running
    || activity.sessions.some(session => session.status === CoworkSessionStatusValue.Running);
}

const emptyProvider = (): PlatformProviderConfig => ({
  enabled: false, apiKey: '', baseUrl: PLATFORM_MODEL_BASE_URL, apiFormat: ApiFormat.OpenAI,
  authType: ProviderAuthType.ApiKey, models: [],
});

// Every write goes through one queue. Slow work (key and model requests) runs outside it, and each queued
// step re-checks its session and re-reads the config right before writing, so a late response can neither
// resurrect a signed-out key nor overwrite what a newer sync or the user saved meanwhile.
let writeQueue: Promise<unknown> = Promise.resolve();
function enqueueWrite<T>(step: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(step, step);
  writeQueue = run.catch(() => undefined);
  return run;
}

const isManagedProviderReady = (provider: PlatformProviderConfig | undefined, key: string) =>
  Boolean(provider) && provider!.apiKey.trim() === key && provider!.enabled && (provider!.models?.length ?? 0) > 0;

/** The platform issues and owns this key; users never choose or paste it. */
export async function syncManagedPlatformKey(accountId: number, deps: ManagedKeySyncDeps): Promise<boolean> {
  const canSync = () => (deps.isCurrent?.() ?? true) && (deps.canWriteConfig?.() ?? true);
  if (!canSync()) return false;
  const result = await deps.fetchManagedKey(accountId);
  const key = result.success && result.managedKey?.accountId === accountId ? result.managedKey.key.trim() : '';
  if (!key || !canSync()) return false;
  // Decide "already synced" behind the write queue: a sign-out clear that is still writing must land first,
  // otherwise a same-account re-login would see the old key, skip, and then have its key cleared.
  const previousModels = await enqueueWrite(async () => {
    if (!canSync()) return null;
    const snapshot = deps.getConfig();
    const providers = snapshot.providers ?? {};
    const provider = providers[resolvePlatformProviderId(providers, snapshot.platformProviderId)];
    return !deps.refreshModels && isManagedProviderReady(provider, key) ? null : provider?.models ?? [];
  });
  if (!previousModels || !canSync()) return false;
  let models: NonNullable<PlatformProviderConfig['models']>;
  try {
    models = await syncPlatformModels(deps.fetchApi, PLATFORM_MODEL_BASE_URL, key, previousModels);
  } catch (error) {
    // A valid empty catalog means access was removed. Transport/format failures
    // keep the saved config intact so a later account refresh can retry.
    if (!deps.refreshModels || !(error instanceof PlatformError) || error.code !== PlatformErrorCode.EmptyCatalog) throw error;
    models = [];
  }
  return enqueueWrite(async () => {
    if (!canSync()) return false;
    const config = deps.getConfig();
    const providers = { ...(config.providers ?? {}) } as NonNullable<AppConfig['providers']>;
    const id = resolvePlatformProviderId(providers, config.platformProviderId);
    const current = providers[id] ?? emptyProvider();
    if (!deps.refreshModels && isManagedProviderReady(current, key)) return false;
    providers[id] = { ...current, apiKey: key, enabled: models.length > 0, models };
    const update = buildPlatformConfigUpdate(providers, id, config.model?.defaultModel ?? '', config.model);
    // A successful permission check with no changes must not reconfigure the runtime.
    if (Object.entries(update).every(([field, value]) => JSON.stringify(config[field as keyof AppConfig]) === JSON.stringify(value))) return true;
    await deps.updateConfig(update);
    return true;
  });
}

/** Sign-out and account switches must not leave the previous account's key routing requests. */
export function clearManagedPlatformKey(deps: Pick<ManagedKeySyncDeps, 'getConfig' | 'updateConfig'>): Promise<boolean> {
  return enqueueWrite(async () => {
    const config = deps.getConfig();
    const id = resolvePlatformProviderId(config.providers ?? {}, config.platformProviderId);
    const current = config.providers?.[id];
    if (!current || !current.apiKey.trim()) return false;
    await deps.updateConfig({
      providers: { ...config.providers, [id]: { ...current, apiKey: '', enabled: false } },
      api: { ...config.api, key: '' },
    });
    return true;
  });
}
