import { PRODUCT } from '../product';
import { ApiFormat, ProviderAuthType,type ProviderConfig } from '../providers';
import { DEFAULT_MAAS_ORIGIN } from './maas';

export const PLATFORM_MODEL_BASE_URL = DEFAULT_MAAS_ORIGIN + '/v1';

interface PlatformAppConfig {
  providers?: Record<string, ProviderConfig>;
  platformProviderId?: string;
  api?: { key: string; baseUrl: string };
  model?: {
    defaultModel: string;
    defaultModelProvider?: string;
    availableModels?: ProviderConfig['models'];
  };
}

/** Apply at startup and every write, before the runtime can consume routing. */
export function lockPlatformConfig<T extends PlatformAppConfig>(config: T): T & Required<PlatformAppConfig> {
  const providers = config.providers ?? {};
  let id = config.platformProviderId;
  if (!id || !/^custom_\d+$/.test(id) || !providers[id]
    || providers[id].baseUrl?.replace(/\/+$/, '') !== PLATFORM_MODEL_BASE_URL) {
    id = Object.keys(providers).find(key => /^custom_\d+$/.test(key)
      && providers[key].baseUrl?.replace(/\/+$/, '') === PLATFORM_MODEL_BASE_URL);
  }
  if (!id) {
    let index = 0;
    while (providers[`custom_${index}`]) index += 1;
    id = `custom_${index}`;
  }
  const provider = providers[id];
  const apiKey = provider?.apiKey?.trim() ?? '';
  const models = provider?.models ?? [];
  const enabled = Boolean(apiKey && models.length);
  const selected = models.find(model => model.id === config.model?.defaultModel) ?? models[0];
  return {
    ...config,
    platformProviderId: id,
    providers: {
      ...Object.fromEntries(Object.entries(providers).map(([key, value]) => [key, { ...value, enabled: false }])),
      [id]: { ...provider, displayName: PRODUCT.name, baseUrl: PLATFORM_MODEL_BASE_URL,
        apiKey, models, enabled, apiFormat: ApiFormat.OpenAI, authType: ProviderAuthType.ApiKey,
        codingPlanEnabled: false, oauthAccessToken: undefined, oauthBaseUrl: undefined,
        oauthRefreshToken: undefined, oauthTokenExpiresAt: undefined },
    },
    api: { ...config.api, key: enabled ? apiKey : '', baseUrl: PLATFORM_MODEL_BASE_URL },
    model: { ...config.model, availableModels: enabled ? models : [],
      defaultModel: enabled ? selected.id : '', defaultModelProvider: enabled ? id : undefined },
  };
}
