import type { MaasBillingDisplay } from '../../../shared/auth/maasBilling';
import type { MaasPlan, MaasSubscription } from '../../../shared/auth/maasSubscriptions';
import { MaasSubscriptionStatus } from '../../../shared/auth/maasSubscriptions';

export const PlatformAccountTab = { Profile: 'profile', Usage: 'usage', Subscriptions: 'subscriptions' } as const;
export type PlatformAccountTab = typeof PlatformAccountTab[keyof typeof PlatformAccountTab];
export const PlatformAccountSection = { Profile: PlatformAccountTab.Profile, Usage: PlatformAccountTab.Usage, Subscriptions: PlatformAccountTab.Subscriptions } as const;
export type PlatformAccountSection = typeof PlatformAccountSection[keyof typeof PlatformAccountSection];
export const AccountWorkspaceView = { Main: 'account' } as const;
export const PlatformPlanReset = { Never: 'never', Daily: 'daily', Weekly: 'weekly', Monthly: 'monthly', Custom: 'custom' } as const;

export const PlatformPlanPeriod = { All: 'all', Month: 'month', Year: 'year' } as const;
export type PlatformPlanPeriod = typeof PlatformPlanPeriod[keyof typeof PlatformPlanPeriod];

export function filterPlansByPeriod(plans: MaasPlan[], period: PlatformPlanPeriod): MaasPlan[] {
  return period === PlatformPlanPeriod.All ? plans : plans.filter(plan => planPurchasePeriod(plan) === period);
}

export function accountInitial(name: string): string {
  return Array.from(name.trim())[0]?.toLocaleUpperCase() || 'S';
}

export function subscriptionStatusKey(status: string): string {
  return Object.values(MaasSubscriptionStatus).some(value => value === status)
    ? `maasSubscription_${status}` : 'maasSubscription_unknown';
}

/** Wallet purchases settle in system USD. Convert only that source currency for display.
 * A future native CNY quote is already local money and must not be converted again.
 * TOKENS is an allowance display mode, never a payment price unit.
 */
function displayedPlanPrice(plan: Pick<MaasPlan, 'price' | 'currency'>, display?: MaasBillingDisplay) {
  if (plan.currency.toUpperCase() !== 'USD' || !display || display.type === 'TOKENS' || display.type === 'USD') return plan;
  return { price: plan.price * display.exchangeRate, currency: display.type === 'CNY' ? 'CNY' : '', symbol: display.symbol };
}

export function formatPlanPrice(plan: Pick<MaasPlan, 'price' | 'currency'>, locale: string, display?: MaasBillingDisplay): string {
  const quote = displayedPlanPrice(plan, display);
  if ('symbol' in quote && !quote.currency) return `${quote.symbol} ${quote.price.toLocaleString(locale, { maximumFractionDigits: 6 })}`;
  plan = quote;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency', currency: plan.currency, currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: Number.isInteger(plan.price) ? 0 : 2,
      // price_amount is decimal(10,6): show a quoted price exactly, never round it to the
      // currency default (which would hide 29.123456 or turn 0.000001 into zero).
      maximumFractionDigits: 6,
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

export function isSubscriptionActive(sub: MaasSubscription, now = Date.now()): boolean {
  return sub.status === MaasSubscriptionStatus.Active && sub.endTime * 1000 > now
    && Number.isFinite(new Date(sub.endTime * 1000).getTime());
}

export function formatSubscriptionDate(seconds: number, locale: string, t: (key: string) => string): string {
  const date = new Date(seconds * 1000);
  return seconds > 0 && Number.isFinite(date.getTime())
    ? date.toLocaleString(locale, { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    : t('maasNotSpecified');
}

export function formatPlanReset(plan: MaasPlan, locale: string, t: (key: string) => string): string {
  if (plan.resetPeriod === 'custom') return plan.resetSeconds.toLocaleString(locale) + ' ' + t('maasDuration_seconds');
  return t(['never', 'daily', 'weekly', 'monthly'].includes(plan.resetPeriod) ? 'maasReset_' + plan.resetPeriod : 'maasDuration_unspecified');
}

/** Only explicit one-month or one-year terms are offered in the period selector. */
export function planPurchasePeriod(plan: Pick<MaasPlan, 'durationUnit' | 'durationValue'>): 'month' | 'year' | null {
  if (plan.durationUnit === PlatformPlanPeriod.Month && plan.durationValue === 1) return PlatformPlanPeriod.Month;
  if ((plan.durationUnit === PlatformPlanPeriod.Year && plan.durationValue === 1) || (plan.durationUnit === PlatformPlanPeriod.Month && plan.durationValue === 12)) return PlatformPlanPeriod.Year;
  return null;
}

/** Display only. The original plan price remains the amount used by purchase confirmation. */
export function formatPlanMonthlyEquivalent(plan: Pick<MaasPlan, 'price' | 'currency'>, locale: string, display?: MaasBillingDisplay): string {
  const quote = displayedPlanPrice(plan, display);
  const amount = quote.price / 12;
  if ('symbol' in quote && !quote.currency) return `${quote.symbol} ${amount.toLocaleString(locale, { maximumFractionDigits: 2 })}`;
  plan = quote;
  try {
    const digits = new Intl.NumberFormat(locale, { style: 'currency', currency: plan.currency }).resolvedOptions().maximumFractionDigits;
    return new Intl.NumberFormat(locale, { style: 'currency', currency: plan.currency, currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: Number.isInteger(amount) ? 0 : digits, maximumFractionDigits: digits }).format(amount);
  } catch {
    return `${amount.toLocaleString(locale, { maximumFractionDigits: 2 })} ${plan.currency}`.trim();
  }
}

/** Include the displayed currency code on the actual charge, never the source USD label. */
export function formatPlanPriceLabel(plan: Pick<MaasPlan, 'price' | 'currency'>, locale: string, display?: MaasBillingDisplay): string {
  const currency = displayedPlanPrice(plan, display).currency.toUpperCase();
  return `${formatPlanPrice(plan, locale, display)}${currency ? ` ${currency}` : ''}`;
}
