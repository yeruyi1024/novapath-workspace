import { PLATFORM_MODEL_BASE_URL } from '../../shared/auth/platformConfig';
import { PRODUCT } from '../../shared/product';
import { ApiFormat, ProviderAuthType } from '../../shared/providers';
import type { AppConfig } from '../config';
import { i18nService } from './i18n';

// Retain the existing runtime IDs so saved sessions and model references migrate intact.
const PLATFORM_PROVIDER_ID_PATTERN = /^custom_[0-9]+$/;
export type PlatformProviderId = `custom_${number}`;
export type PlatformProvidersConfig = NonNullable<AppConfig['providers']>;
export type PlatformProviderConfig = PlatformProvidersConfig[string];
type Model = NonNullable<PlatformProviderConfig['models']>[number];

export const CONNECTIVITY_TEST_TOKEN_BUDGET = 64;

const usesMaxCompletionTokens = (modelId: string): boolean => {
  const model = modelId.toLowerCase().split('/').pop() ?? '';
  return ['gpt-5', 'o1', 'o3', 'o4'].some(prefix => model.startsWith(prefix));
};

export const PlatformErrorCode = {
  InvalidUrl: 'invalid_url',
  MissingKey: 'missing_key',
  RequestFailed: 'request_failed',
  InvalidCatalog: 'invalid_catalog',
  EmptyCatalog: 'empty_catalog',
  InvalidCompletion: 'invalid_completion',
} as const;

export class PlatformError extends Error {
  constructor(public readonly code: typeof PlatformErrorCode[keyof typeof PlatformErrorCode], public readonly status?: number) {
    super(code);
  }
}

const errorKeys: Record<typeof PlatformErrorCode[keyof typeof PlatformErrorCode], string> = {
  [PlatformErrorCode.InvalidUrl]: 'starpathInvalidUrl',
  [PlatformErrorCode.MissingKey]: 'apiKeyRequired',
  [PlatformErrorCode.RequestFailed]: 'starpathRequestFailed',
  [PlatformErrorCode.InvalidCatalog]: 'starpathInvalidCatalog',
  [PlatformErrorCode.EmptyCatalog]: 'starpathEmptyCatalog',
  [PlatformErrorCode.InvalidCompletion]: 'starpathInvalidCompletion',
};

export function getPlatformErrorMessage(error: unknown): string {
  const message = i18nService.t(error instanceof PlatformError ? errorKeys[error.code] : 'starpathRequestFailed');
  return message + (error instanceof PlatformError && error.status ? ` (${error.status})` : '');
}

export type PlatformFetch = (options: {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}) => Promise<{ ok: boolean; status: number; data?: unknown }>;

/** Keep an existing managed connection, or allocate a genuinely unused slot. */
export function resolvePlatformProviderId(providers: PlatformProvidersConfig, configuredId?: string): PlatformProviderId {
  if (configuredId && PLATFORM_PROVIDER_ID_PATTERN.test(configuredId) && providers[configuredId]) {
    return configuredId as PlatformProviderId;
  }
  let index = 0;
  while (providers[`custom_${index}`]) index += 1;
  return `custom_${index}`;
}

/** A saved platform connection replaces active routing, while retaining old records for migration. */
export function buildPlatformConfigUpdate(
  providers: PlatformProvidersConfig,
  configuredId: string | undefined,
  defaultModel: string,
  previousModel: AppConfig['model'],
): Partial<AppConfig> {
  if (!configuredId || !PLATFORM_PROVIDER_ID_PATTERN.test(configuredId) || !providers[configuredId]) {
    return {};
  }
  const provider = providers[configuredId];
  const apiKey = provider.apiKey.trim();
  const baseUrl = PLATFORM_MODEL_BASE_URL;
  const models = provider.models ?? [];
  if (provider.enabled && !apiKey) throw new PlatformError(PlatformErrorCode.MissingKey);
  if (provider.enabled && !models.length) throw new PlatformError(PlatformErrorCode.EmptyCatalog);
  const selectedModel = models.find(model => model.id === defaultModel) ?? models[0];
  return {
    platformProviderId: configuredId,
    providers: Object.fromEntries(Object.entries(providers).map(([id, config]) => [id, id === configuredId ? {
      ...config,
      displayName: PRODUCT.name,
      apiKey,
      baseUrl,
      apiFormat: ApiFormat.OpenAI,
      authType: ProviderAuthType.ApiKey,
    } : { ...config, enabled: false }])),
    api: { key: provider.enabled ? apiKey : '', baseUrl },
    model: {
      ...previousModel,
      availableModels: provider.enabled ? models : [],
      defaultModel: provider.enabled ? selectedModel.id : '',
      defaultModelProvider: provider.enabled ? configuredId : undefined,
    },
  };
}

export function normalizePlatformBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new PlatformError(PlatformErrorCode.InvalidUrl);
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new PlatformError(PlatformErrorCode.InvalidUrl);
  }
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/(?:models|chat\/completions|responses)$/, '') || '/v1';
  if (!/\/v\d+$/.test(url.pathname)) url.pathname += '/v1';
  return url.toString().replace(/\/+$/, '');
}

export function parsePlatformModels(data: unknown, previous: Model[] = []): Model[] {
  if (!data || typeof data !== 'object' || !('data' in data) || !Array.isArray(data.data)) {
    throw new PlatformError(PlatformErrorCode.InvalidCatalog);
  }
  const models: Model[] = [];
  const seen = new Set<string>();
  for (const item of data.data) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.trim()) {
      throw new PlatformError(PlatformErrorCode.InvalidCatalog);
    }
    const id = item.id.trim();
    if (seen.has(id)) continue;
    seen.add(id);
    const existing = previous.find(model => model.id === id);
    // Discovery does not invent vision/tool support that the gateway never advertised.
    models.push(existing ? { ...existing, id } : { id, name: id, supportsImage: false });
  }
  if (models.length === 0) throw new PlatformError(PlatformErrorCode.EmptyCatalog);
  return models;
}

async function requestPlatform(fetchApi: PlatformFetch, baseUrl: string, apiKey: string, suffix: string, body?: string): Promise<unknown> {
  const normalizedUrl = normalizePlatformBaseUrl(baseUrl);
  if (!apiKey.trim()) throw new PlatformError(PlatformErrorCode.MissingKey);
  let response: Awaited<ReturnType<PlatformFetch>>;
  try {
    response = await fetchApi({
      url: `${normalizedUrl}/${suffix}`,
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${apiKey.trim()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body } : {}),
    });
  } catch {
    // Never surface remote error bodies or transport errors that may echo credentials.
    throw new PlatformError(PlatformErrorCode.RequestFailed);
  }
  if (!response.ok) throw new PlatformError(PlatformErrorCode.RequestFailed, response.status);
  return response.data;
}

export async function syncPlatformModels(fetchApi: PlatformFetch, baseUrl: string, apiKey: string, previous: Model[]): Promise<Model[]> {
  return parsePlatformModels(await requestPlatform(fetchApi, baseUrl, apiKey, 'models'), previous);
}

/** Saving a key is the only setup step: discover models before committing routing. */
export async function preparePlatformConfigUpdate(
  providers: PlatformProvidersConfig,
  id: string,
  defaultModel: string,
  previous: AppConfig,
  fetchApi: PlatformFetch,
  refreshModels = false,
): Promise<Partial<AppConfig>> {
  const provider = providers[id];
  if (!provider) throw new PlatformError(PlatformErrorCode.MissingKey);
  const apiKey = provider.apiKey.trim();
  let models = provider.models ?? [];
  const saved = previous.providers?.[id];
  if (apiKey && (refreshModels || saved?.apiKey.trim() !== apiKey || saved.baseUrl !== PLATFORM_MODEL_BASE_URL || !models.length)) {
    models = await syncPlatformModels(fetchApi, PLATFORM_MODEL_BASE_URL, apiKey, models);
  }
  return buildPlatformConfigUpdate({ ...providers, [id]: { ...provider, apiKey, models,
    baseUrl: PLATFORM_MODEL_BASE_URL, enabled: Boolean(apiKey) } }, id, defaultModel, previous.model);
}

export async function testPlatformConnection(fetchApi: PlatformFetch, baseUrl: string, apiKey: string, model: string): Promise<void> {
  const data = await requestPlatform(fetchApi, baseUrl, apiKey, 'chat/completions', JSON.stringify({
    model,
    messages: [{ role: 'user', content: 'Hi' }],
    [usesMaxCompletionTokens(model) ? 'max_completion_tokens' : 'max_tokens']: CONNECTIVITY_TEST_TOKEN_BUDGET,
    stream: false,
  }));
  if (!data || typeof data !== 'object' || !('choices' in data) || !Array.isArray(data.choices)
    || !data.choices[0]?.message || typeof data.choices[0].message !== 'object') {
    throw new PlatformError(PlatformErrorCode.InvalidCompletion);
  }
}
