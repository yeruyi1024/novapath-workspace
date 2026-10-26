import type { MaasPlan } from '../../../shared/auth/maasSubscriptions';
import { MaasSubscriptionStatus } from '../../../shared/auth/maasSubscriptions';

export const PlatformAccountTab = { Profile: 'profile', Subscriptions: 'subscriptions' } as const;
export type PlatformAccountTab = typeof PlatformAccountTab[keyof typeof PlatformAccountTab];

export const PlatformPlanPeriod = { All: 'all', Month: 'month', Year: 'year' } as const;
export type PlatformPlanPeriod = typeof PlatformPlanPeriod[keyof typeof PlatformPlanPeriod];

export function filterPlansByPeriod(plans: MaasPlan[], period: PlatformPlanPeriod): MaasPlan[] {
  return period === PlatformPlanPeriod.All ? plans : plans.filter(plan => plan.durationUnit === period);
}

export function accountInitial(name: string): string {
  return Array.from(name.trim())[0]?.toLocaleUpperCase() || 'S';
}

export function subscriptionStatusKey(status: string): string {
  return Object.values(MaasSubscriptionStatus).some(value => value === status)
    ? `maasSubscription_${status}` : 'maasSubscription_unknown';
}

export function formatPlanPrice(plan: Pick<MaasPlan, 'price' | 'currency'>, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency', currency: plan.currency, currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: Number.isInteger(plan.price) ? 0 : 2,
    }).format(plan.price);
  } catch {
    return `${plan.price.toLocaleString(locale)} ${plan.currency}`.trim();
  }
}

export function formatPlanDuration(plan: MaasPlan, locale: string, t: (key: string) => string): string {
  if (plan.durationUnit === 'custom') return `${plan.customSeconds.toLocaleString(locale)} ${t('maasDuration_seconds')}`;
  if (!['year', 'month', 'day', 'hour'].includes(plan.durationUnit)) return t('maasDuration_unspecified');
  return `${plan.durationValue} ${t(`maasDuration_${plan.durationUnit}`)}`;
}

export const PlatformAccountSection = { Profile: "profile", Usage: "usage", Subscriptions: "subscriptions" } as const;
export type PlatformAccountSection = typeof PlatformAccountSection[keyof typeof PlatformAccountSection];

export const AccountWorkspaceView = { Main: 'account' } as const;
