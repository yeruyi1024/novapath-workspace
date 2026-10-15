import { CalendarDaysIcon, CheckCircleIcon, CheckIcon, ClockIcon } from '@heroicons/react/24/outline';
import { useId } from 'react';

import type { MaasPlan, MaasSubscription } from '../../../shared/auth/maasSubscriptions';
import { MaasSubscriptionStatus } from '../../../shared/auth/maasSubscriptions';
import { i18nService } from '../../services/i18n';
import { formatPlanDuration, formatPlanPrice, subscriptionStatusKey } from './platformAccountPresentation';
import { getPlanPromotion } from './platformPlanPromotion';

export function PlatformPlanCard({ plan, subscribed, locale }: { plan: MaasPlan; subscribed: boolean; locale: string }) {
  const t = (key: string) => i18nService.t(key);
  const hintId = useId();
  const { recommended, highlights } = getPlanPromotion(plan.id, i18nService.getLanguage());
  return <article className="platform-plan-card" data-subscribed={subscribed || undefined} data-recommended={(recommended && !subscribed) || undefined}>
    <div className="platform-plan-card-heading"><h3>{plan.title || `${t('maasPlanNumber')} ${plan.id}`}</h3>
      {subscribed && <span className="platform-account-status"><CheckCircleIcon aria-hidden="true" className="h-3.5 w-3.5" />{t('maasCurrentPlan')}</span>}
      {recommended && !subscribed && <span className="platform-plan-badge">{t('maasPlanRecommended')}</span>}
    </div>
    <p className="platform-plan-description">{plan.subtitle || t('maasPlanDescriptionPending')}</p>
    {highlights.length > 0 && <ul className="platform-plan-highlights">
      {highlights.map(item => <li key={item}><CheckIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />{item}</li>)}
    </ul>}
    <div className="platform-plan-purchase">
      <p className="platform-plan-price"><span>{formatPlanPrice(plan, locale)}</span>
        {/^[a-z]{3}$/i.test(plan.currency) && <span className="platform-plan-currency">{plan.currency.toUpperCase()}</span>}
        <span className="platform-plan-currency">/ {formatPlanDuration(plan, locale, t)}</span></p>
      <div className="platform-plan-state" data-current={subscribed || undefined}>
        <button type="button" disabled className={`platform-subscribe-button ${subscribed ? 'platform-subscribe-button-current' : ''}`} aria-describedby={hintId}>
          {subscribed ? <CheckCircleIcon aria-hidden="true" className="h-4 w-4 shrink-0" /> : <ClockIcon aria-hidden="true" className="h-4 w-4 shrink-0" />}
          {t(subscribed ? 'maasCurrentPlan' : 'maasSubscribeSoon')}
        </button>
        <p id={hintId} className="platform-plan-hint">{t(subscribed ? 'maasCurrentPlanHint' : 'maasPurchaseComingSoon')}</p>
      </div>
    </div>
  </article>;
}

export function PlatformSubscriptionCard({ subscription, plan, locale }: { subscription: MaasSubscription; plan?: MaasPlan; locale: string }) {
  const t = (key: string) => i18nService.t(key);
  const date = (seconds: number) => seconds ? new Date(seconds * 1000).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' }) : t('maasNotSpecified');
  const active = subscription.status === MaasSubscriptionStatus.Active;
  return <article className="platform-subscription-card" data-active={active || undefined}>
    <div className="platform-subscription-heading"><span className="platform-account-feature-icon"><CalendarDaysIcon aria-hidden="true" className="h-5 w-5" /></span>
      <h4 className="min-w-0 flex-1 break-words text-sm font-medium">{plan?.title || `${t('maasPlanNumber')} ${subscription.planId}`}</h4>
      <span className={`platform-account-status ${active ? '' : 'platform-account-status-neutral'}`}>{active && <CheckCircleIcon aria-hidden="true" className="h-3.5 w-3.5" />}{t(subscriptionStatusKey(subscription.status))}</span>
    </div>
    <dl className="platform-subscription-dates"><div><dt>{t('maasSubscriptionStart')}</dt><dd>{date(subscription.startTime)}</dd></div><div><dt>{t('maasSubscriptionEnd')}</dt><dd>{date(subscription.endTime)}</dd></div></dl>
  </article>;
}
