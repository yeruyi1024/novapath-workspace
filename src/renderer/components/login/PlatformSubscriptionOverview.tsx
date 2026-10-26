import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { useId } from 'react';

import { type MaasSubscription,type MaasSubscriptions, MaasSubscriptionStatus } from '../../../shared/auth/maasSubscriptions';
import { i18nService } from '../../services/i18n';
import { formatSubscriptionDate, isSubscriptionActive, subscriptionStatusKey } from './platformAccountPresentation';
import PlatformSubscriptionSyncHint from './PlatformSubscriptionSyncHint';

export default function PlatformSubscriptionOverview({ data, locale, now, onViewUsage }: {
  data: MaasSubscriptions; locale: string; now: number; onViewUsage?: () => void;
}) {
  const t = (key: string) => i18nService.t(key);
  const id = useId();
  const current = data.subscriptions.filter(item => isSubscriptionActive(item, now));
  const other = data.subscriptions.filter(item => !isSubscriptionActive(item, now));
  const row = (sub: MaasSubscription) => {
    const plan = data.plans.find(item => item.id === sub.planId);
    const active = isSubscriptionActive(sub, now);
    let status = sub.status;
    if (status === MaasSubscriptionStatus.Active && sub.endTime > 0 && sub.endTime * 1000 <= now) status = MaasSubscriptionStatus.Expired;
    if (status === MaasSubscriptionStatus.Active && !active) status = 'unknown';
    return <div key={sub.id} className="platform-subscription-overview-row">
      <div><h3>{plan?.title || `${t('maasPlanNumber')} ${sub.planId}`}</h3><p>{t('maasSubscriptionEnd')} · {formatSubscriptionDate(sub.endTime, locale, t)}</p></div>
      <span className="platform-subscription-state" data-active={active || undefined}>{t(subscriptionStatusKey(status))}</span>
    </div>;
  };
  return <section className="platform-subscription-overview" aria-labelledby={id}>
    <div className="platform-account-section-heading"><div><h2 id={id}>{t('accountCurrentSubscriptions')}</h2><p>{t('accountCurrentSubscriptionHint')}</p></div>
      {onViewUsage && <button type="button" className="platform-account-text-button" onClick={onViewUsage}>{t('accountViewUsage')}</button>}
    </div>
    <PlatformSubscriptionSyncHint data={data} section="subscriptions" locale={locale} />
    {current.length ? <div className="platform-subscription-overview-list">{current.map(row)}</div> : <p className="platform-usage-empty">{t(data.errors?.subscriptions ? 'maasSubscriptionsUnavailable' : 'accountNoCurrentSubscription')}</p>}
    {other.length > 0 && <details className="platform-usage-history"><summary>{t('accountOtherSubscriptions')} <span>{other.length}</span><ChevronDownIcon aria-hidden="true" /></summary><div className="platform-subscription-overview-list">{other.map(row)}</div></details>}
  </section>;
}
