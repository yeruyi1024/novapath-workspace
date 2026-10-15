import { PRODUCT_SERVICES } from '../../shared/product';
/**
 * 集中管理所有业务 API 端点。
 * 后续新增的业务接口也应在此文件中配置。
 */
import { configService } from './config';

export const isTestModeEnabled = () => {
  return configService.getConfig().app?.testMode === true;
};

// 自动更新
export const getUpdateCheckUrl = () => PRODUCT_SERVICES.updateUrl;

// 手动检查更新
export const getManualUpdateCheckUrl = () => PRODUCT_SERVICES.manualUpdateUrl;

export const getFallbackDownloadUrl = () => PRODUCT_SERVICES.downloadUrl;

// Skill 商店
export const getSkillStoreUrl = () => PRODUCT_SERVICES.skillStoreUrl;

// Kit 商店
export const getKitStoreUrl = () => PRODUCT_SERVICES.kitStoreUrl;

// 登录地址
export const getLoginOvermindUrl = () => PRODUCT_SERVICES.loginConfigUrl;

// Portal 页面
const getPortalBase = () => PRODUCT_SERVICES.portalBaseUrl;

export const PortalPricingKeyfrom = {
  HtmlShare: 'html_share',
  SiteDeployment: 'site_deployment',
} as const;

export type PortalPricingKeyfrom =
  (typeof PortalPricingKeyfrom)[keyof typeof PortalPricingKeyfrom];

export interface PortalPricingUrlOptions {
  traceId?: string;
  offerToken?: string;
  tab?: 'subscription' | 'boost';
}

export const getPortalLoginUrl = () => `${getPortalBase()}/login`;
export const getPortalPricingUrl = (
  keyfrom?: PortalPricingKeyfrom,
  options: PortalPricingUrlOptions = {},
) => {
  const query = new URLSearchParams();
  if (keyfrom) query.set('keyfrom', keyfrom);
  if (options.traceId) query.set('trace_id', options.traceId);
  if (options.offerToken) query.set('offerToken', options.offerToken);
  if (options.tab) query.set('tab', options.tab);
  const queryString = query.toString();
  const suffix = queryString ? `?${queryString}` : '';
  return `${getPortalBase()}/pricing${suffix}`;
};
const PENNY_BANNER_TARGET = 'penny';
export const getPortalSubscriptionTrialUrl = (campaignCode?: string, options: { checkout?: boolean } = {}) => {
  const query = new URLSearchParams({ tab: 'subscription', banner: PENNY_BANNER_TARGET });
  if (campaignCode) query.set('trialCampaign', campaignCode);
  if (options.checkout) query.set('trialCheckout', '1');
  return `${getPortalBase()}/pricing?${query}`;
};

// Sidebar banners have no campaign type field. Preserve configured destinations and
// attribution, adding the slide target only to Portal links for the penny offer.
export const getClientBannerTargetUrl = (linkUrl: string, description: string): string => {
  const describesTrial = /(?:^|[^\d])0\.01(?:[^\d]|$)/.test(description);
  if (!linkUrl) return describesTrial ? getPortalSubscriptionTrialUrl() : getPortalInvitationUrl();
  try {
    const url = new URL(linkUrl);
    if (![new URL(getPortalBase()).origin].includes(url.origin)) return linkUrl;
    const hashRoute = url.hash.startsWith('#/');
    const route = new URL(hashRoute ? url.hash.slice(1) : url.pathname + url.search, url.origin);
    const isPricing = hashRoute
      ? ['/', '/pricing'].includes(route.pathname)
      : ['/', '/pricing', '/portal', '/portal/'].includes(route.pathname);
    if (!isPricing || !(describesTrial || route.searchParams.has('trialCampaign') || route.searchParams.get('banner') === PENNY_BANNER_TARGET)) return linkUrl;
    route.searchParams.set('banner', PENNY_BANNER_TARGET);
    route.searchParams.set('tab', 'subscription');
    if (hashRoute) url.hash = route.pathname + route.search;
    else url.search = route.search;
    return url.toString();
  } catch {
    return linkUrl;
  }
};

export const getPortalProfileUrl = () => `${getPortalBase()}/profile`;
export const getPortalCreditsDetailUrl = () => `${getPortalBase()}/profile/detail`;
export const getPortalRechargeUrl = () => `${getPortalBase()}/`;
export const getPortalInvitationUrl = () => `${getPortalBase()}/invitation`;
export const getPortalCreditsResetActivityUrl = (campaignCode?: string) => (
  `${getPortalBase()}/profile?activity=credits_reset${campaignCode ? `&campaignCode=${encodeURIComponent(campaignCode)}` : ''}`
);

export const getEnterpriseMemberProfileUrl = (enterpriseId: number) => (
  `${getPortalBase()}/enterprise/profile/${encodeURIComponent(String(enterpriseId))}`
);

const getEnterpriseConsoleBaseUrl = (enterpriseId: number) => (
  `${getPortalBase()}/enterprise/console/${encodeURIComponent(String(enterpriseId))}`
);

export const getEnterpriseOverviewUrl = (enterpriseId: number) => (
  `${getEnterpriseConsoleBaseUrl(enterpriseId)}/overview`
);

export const getEnterpriseUsageUrl = (enterpriseId: number) => (
  `${getEnterpriseConsoleBaseUrl(enterpriseId)}/usage`
);

export const getEnterpriseBillingUrl = (enterpriseId: number) => (
  `${getEnterpriseConsoleBaseUrl(enterpriseId)}/billing`
);

export const getEnterpriseRechargeUrl = (enterpriseId: number) => (
  `${getEnterpriseConsoleBaseUrl(enterpriseId)}/recharge`
);
