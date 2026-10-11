import { app } from 'electron';

import { HtmlSharePublicRoute } from '../../shared/htmlShare/constants';
import { PRODUCT_SERVICES } from '../../shared/product';
import type { SqliteStore } from '../sqliteStore';
import { resolveDevelopmentServerBaseUrl } from './developmentServerBaseUrl';

let cachedTestMode: boolean | null = null;
let loggedDevelopmentServerBaseUrl: string | null = null;

/**
 * Read testMode from store and cache it.
 * Call once at startup and again whenever app_config changes.
 */
export function refreshEndpointsTestMode(store: SqliteStore): void {
  const appConfig = store.get<any>('app_config');
  cachedTestMode = appConfig?.app?.testMode === true;
}

/**
 * Whether the app is in test mode.
 * Uses cached value after init; falls back to !app.isPackaged before init.
 */
export const isTestModeEnabled = (): boolean => {
  return cachedTestMode ?? !app.isPackaged;
};

/**
 * Server API base URL — switches based on testMode.
 * Used for auth exchange/refresh, models, proxy, etc.
 */
export const getServerApiBaseUrl = (): string => {
  const defaultBaseUrl = PRODUCT_SERVICES.apiBaseUrl;
  const serverBaseUrl = resolveDevelopmentServerBaseUrl({
    defaultBaseUrl,
    developmentOverride: process.env.API_CONSOLE_SERVER_BASE_URL,
    isDev: process.env.NODE_ENV === 'development',
    isPackaged: app.isPackaged,
  });
  if (serverBaseUrl !== defaultBaseUrl
      && loggedDevelopmentServerBaseUrl !== serverBaseUrl) {
    console.warn(
      `[Endpoints] routing all Lobster server traffic to development origin ${serverBaseUrl}`,
    );
    loggedDevelopmentServerBaseUrl = serverBaseUrl;
  }
  return serverBaseUrl;
};

export const getHtmlSharePublicBaseUrl = (): string => {
  return `${getServerApiBaseUrl()}${HtmlSharePublicRoute.Root}`;
};

export const getUpdateCheckUrl = (): string => PRODUCT_SERVICES.updateUrl;

export const getManualUpdateCheckUrl = (): string => PRODUCT_SERVICES.manualUpdateUrl;

export const getFallbackDownloadUrl = (): string => PRODUCT_SERVICES.downloadUrl;

export const getSkillStoreUrl = (): string => PRODUCT_SERVICES.skillStoreUrl;

// Portal 页面
const getPortalBase = (): string => PRODUCT_SERVICES.portalBaseUrl;

export const getPortalTasksUrl = (): string => `${getPortalBase()}/profile/detail?tab=tasks`;

export const getKitStoreUrl = (): string => PRODUCT_SERVICES.kitStoreUrl;
