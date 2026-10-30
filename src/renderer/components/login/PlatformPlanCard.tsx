import { CalendarDaysIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { useId } from 'react';

import { formatMaasPoints, formatMaasQuota, type MaasBillingDisplay,maasQuotaToPoints } from '../../../shared/auth/maasBilling';
import type { MaasPlan, MaasSubscription } from '../../../shared/auth/maasSubscriptions';
import { MaasSubscriptionStatus } from '../../../shared/auth/maasSubscriptions';
import { i18nService } from '../../services/i18n';
import { formatPlanDuration, formatPlanMonthlyEquivalent, formatPlanPrice, formatPlanPriceLabel, formatPlanReset, formatSubscriptionDate, isSubscriptionActive, planPurchasePeriod, PlatformPlanPeriod, PlatformPlanReset, subscriptionStatusKey } from './platformAccountPresentation';

export function formatSubscriptionQuota(amount: number, display: MaasBillingDisplay | undefined, locale: string): string {
  const points = maasQuotaToPoints(amount, display);
  if (points !== null) return `${formatMaasPoints(points, locale)} ${i18nService.t('authCreditsUnit')}`;
  return display ? formatMaasQuota(amount, display, locale) : amount.toLocaleString(locale) + ' ' + i18nService.t('maasRawQuotaUnit');
}

interface PlanProps {
  plan: MaasPlan; subscribed: boolean; locale: string; display?: MaasBillingDisplay;
  onBuy?: () => void; disabledReason?: string;
  purchaseCount?: number;
}
export function PlatformPlanCard({ plan, subscribed, locale, display, onBuy, disabledReason, purchaseCount = 0 }: PlanProps) {
  const t = (key: string) => i18nService.t(key);
  const hintId = useId();
  const annual = planPurchasePeriod(plan) === PlatformPlanPeriod.Year;
  const monthlyAnnual = annual && plan.resetPeriod === PlatformPlanReset.Monthly;
  const hasReset = [PlatformPlanReset.Daily, PlatformPlanReset.Weekly, PlatformPlanReset.Monthly, PlatformPlanReset.Custom].some(value => value === plan.resetPeriod);
  const disabledLabel = disabledReason === 'maasPurchase_error_balance' ? 'maasBuyBalanceLow'
    : disabledReason === 'maasPurchase_error_limit' ? disabledReason
      : disabledReason === 'maasPurchase_error_pending' ? 'maasBuyPending'
        : disabledReason === 'maasPurchase_error_currency' ? 'maasBuyCurrency' : 'maasBuyUnavailable';
  return <article className="platform-plan-card" data-subscribed={subscribed || undefined}>
    <div className="platform-plan-card-heading"><h3>{plan.title || t('maasPlanNumber') + ' ' + plan.id}</h3>
      {subscribed && <span className="platform-account-status"><CheckCircleIcon aria-hidden="true" className="h-3.5 w-3.5" />{t('maasCurrentPlan')}</span>}
    </div>
    <p className="platform-plan-description">{plan.subtitle || t('accountPlanMetadataOnly')}</p>
    <div className="platform-plan-pricing">
      {annual && <p className="platform-plan-equivalent-label">{t('accountAnnualEquivalent')} · {t('accountApproximate')}</p>}
      <p className="platform-plan-price"><span>{annual ? formatPlanMonthlyEquivalent(plan, locale, display) : formatPlanPrice(plan, locale, display)}</span><span className="platform-plan-currency">{t('accountPerMonth')}</span></p>
      <p className="platform-plan-actual-price" data-actual-price={plan.price}>{t(annual ? 'accountAnnualPayment' : 'accountMonthlyPayment').replace('{amount}', formatPlanPriceLabel(plan, locale, display))}</p>
    </div>
    <dl className="platform-plan-allowance"><div><dt>{t(monthlyAnnual ? 'accountMonthlyAllowance' : plan.resetPeriod === PlatformPlanReset.Never ? 'accountQuotaForValidity' : 'maasPlanCycleQuota')}</dt><dd>{plan.totalAmount === 0 ? t('maasUnlimitedQuota') : formatSubscriptionQuota(plan.totalAmount, display, locale)}</dd></div>
      <div><dt>{t('accountPlanValidFor')}</dt><dd>{formatPlanDuration(plan, locale, t)}</dd></div>
      <div><dt>{t('maasPlanReset')}</dt><dd>{formatPlanReset(plan, locale, t)}</dd></div>
      {Boolean(plan.maxPurchasePerUser) && <div><dt>{t('maasPerAccountLimit')}</dt><dd>{plan.maxPurchasePerUser} · {t('maasPurchasedCount')} {purchaseCount}</dd></div>}</dl>
    {hasReset && <p className="platform-plan-reset-warning" role="note">{t(monthlyAnnual ? 'accountAnnualResetHint' : 'accountPlanResetConflict')}</p>}
    <div className="platform-plan-purchase"><div className="platform-plan-state">
      <button type="button" disabled={!onBuy || Boolean(disabledReason)} className="platform-subscribe-button" aria-describedby={hintId} onClick={onBuy}>
        {t(disabledReason ? disabledLabel : (subscribed ? 'accountSubscribeAgain' : 'accountSubscribe'))}
      </button>
      <p id={hintId} className="platform-plan-hint">{t(disabledReason === 'maasPurchase_error_limit' ? 'maasPurchaseLimitHint' : disabledReason || 'maasPurchaseAvailableHint')}</p>
    </div></div>
  </article>;
}

export function PlatformSubscriptionCard({ subscription: sub, plan, locale, display, now = Date.now() }: {
  subscription: MaasSubscription; plan?: MaasPlan; locale: string; display?: MaasBillingDisplay; now?: number;
}) {
  const t = (key: string) => i18nService.t(key);
  const active = isSubscriptionActive(sub, now);
  const elapsed = sub.endTime > 0 && sub.endTime * 1000 <= now;
  const status = sub.status === MaasSubscriptionStatus.Active && elapsed ? MaasSubscriptionStatus.Expired : sub.status;
  const remaining = Math.max(0, sub.amountTotal - sub.amountUsed);
  const unlimited = sub.amountTotal === 0;
  const expiring = active && sub.endTime * 1000 - now <= 72 * 3600_000;
  const quota = (amount: number) => formatSubscriptionQuota(amount, display, locale);
  return <article className="platform-subscription-card" data-active={active || undefined}>
    <div className="platform-subscription-heading"><span className="platform-account-feature-icon"><CalendarDaysIcon aria-hidden="true" className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1"><h4 className="break-words text-sm font-medium">{plan?.title || t('maasPlanNumber') + ' ' + sub.planId + ' · ' + t('maasUnknownPlanName')}</h4><p className="platform-record-id">{plan ? `${formatPlanDuration(plan, locale, t)} · ${formatPlanReset(plan, locale, t)}` : t('maasUnknownPlanName')}</p></div>
      <span className={'platform-account-status ' + (active ? '' : 'platform-account-status-neutral')}>{active && <CheckCircleIcon aria-hidden="true" className="h-3.5 w-3.5" />}{t(sub.status === MaasSubscriptionStatus.Active && !active && !elapsed ? 'maasSubscription_unknown' : subscriptionStatusKey(status))}</span>
    </div>
    <div className="platform-quota-overview"><span>{t('maasSubscriptionRemaining')}</span><strong>{unlimited ? t('maasUnlimitedQuota') : quota(remaining)}</strong></div>
    {!unlimited && <div className="platform-quota-track" role="progressbar" aria-label={t('maasQuotaUsed')} aria-valuenow={Math.min(100, Math.round(sub.amountUsed / sub.amountTotal * 100))} aria-valuemin={0} aria-valuemax={100}><span style={{ width: Math.min(100, sub.amountUsed / sub.amountTotal * 100) + '%' }} /></div>}
    <dl className="platform-quota-details"><div><dt>{t('maasQuotaUsed')}</dt><dd>{quota(sub.amountUsed)}</dd></div><div><dt>{t('maasQuotaTotal')}</dt><dd>{unlimited ? t('maasUnlimitedQuota') : quota(sub.amountTotal)}</dd></div></dl>
    {active && !unlimited && remaining === 0 && <p className="platform-subscription-attention">{t('maasQuotaExhausted')}</p>}
    {expiring && <p className="platform-subscription-attention">{t(sub.endTime * 1000 - now <= 24 * 3600_000 ? 'maasSubscriptionDay' : 'maasSubscriptionSoon')}</p>}
    <dl className="platform-subscription-dates">
      {sub.nextResetTime > 0 && <div><dt>{t('maasSubscriptionNextReset')}</dt><dd>{formatSubscriptionDate(sub.nextResetTime, locale, t)}{active && sub.nextResetTime * 1000 <= now && <span className="block text-secondary">{t('maasResetPending')}</span>}</dd></div>}
      <div><dt>{t('maasSubscriptionEnd')}</dt><dd>{formatSubscriptionDate(sub.endTime, locale, t)}</dd></div>
    </dl>
    <details className="platform-subscription-more"><summary>{t('accountSubscriptionDetails')}</summary>
      <dl><div><dt>{t('maasSubscriptionStart')}</dt><dd>{formatSubscriptionDate(sub.startTime, locale, t)}</dd></div>
        {sub.nextResetTime <= 0 && <div><dt>{t('maasSubscriptionNextReset')}</dt><dd>{t('maasNoNextReset')}</dd></div>}
      </dl>
    </details>
  </article>;
}
