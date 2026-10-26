import { ChevronDownIcon, WalletIcon } from '@heroicons/react/24/outline';
import { useId } from 'react';

import { formatMaasQuota } from '../../../shared/auth/maasBilling';
import type { MaasSubscription } from '../../../shared/auth/maasSubscriptions';
import { i18nService } from '../../services/i18n';
import type { MaasSubscriptionsState } from '../../services/maasSubscriptions';
import { isSubscriptionActive } from './platformAccountPresentation';
import { PlatformSubscriptionCard } from './PlatformPlanCard';
import PlatformSubscriptionSyncHint from './PlatformSubscriptionSyncHint';

export default function PlatformUsage({ state, locale, now, onViewSubscriptions }: {
  state: MaasSubscriptionsState; locale: string; now: number; onViewSubscriptions?: () => void;
}) {
  const t = (key: string) => i18nService.t(key);
  const id = useId();
  const data = state.data;
  const wallet = data?.wallet;
  const current = data?.subscriptions.filter(item => isSubscriptionActive(item, now)) ?? [];
  const other = data?.subscriptions.filter(item => !isSubscriptionActive(item, now)) ?? [];
  const card = (subscription: MaasSubscription) => <PlatformSubscriptionCard key={subscription.id} subscription={subscription}
    plan={data?.plans.find(plan => plan.id === subscription.planId)} locale={locale} display={wallet?.display} now={now} />;
  return <div className="platform-usage">
    <div className="platform-usage-overview">
    <section aria-labelledby={id + '-allowance'}>
      <div className="platform-account-section-heading"><div><h2 id={id + '-allowance'}>{t('accountSubscriptionQuotaTitle')}</h2></div>
        {onViewSubscriptions && <button type="button" className="platform-account-text-button" onClick={onViewSubscriptions}>{t('accountViewSubscriptions')}</button>}
      </div>
      {state.loading && !data && <p role="status" className="platform-usage-empty">{t('accountLoading')}</p>}
      {data && !current.length && <p className="platform-usage-empty">{t(data.errors?.subscriptions ? 'maasSubscriptionsUnavailable' : 'accountNoCurrentSubscription')}</p>}
      {current.length > 0 && <div className="platform-subscription-list">{current.map(card)}</div>}
      {current.length > 0 && <PlatformSubscriptionSyncHint data={data} section="subscriptions" locale={locale} />}
      {other.length > 0 && <details className="platform-usage-history"><summary>{t('accountOtherSubscriptions')} <span>{other.length}</span><ChevronDownIcon aria-hidden="true" /></summary><div className="platform-subscription-list">{other.map(card)}</div></details>}
    </section>
    <section className="platform-usage-wallet" aria-labelledby={id + '-wallet'}>
      <div className="platform-account-section-heading"><h2 id={id + '-wallet'}><WalletIcon aria-hidden="true" />{t('accountWalletTitle')}</h2></div>
      <div className="platform-usage-wallet-values">
        <div><p>{t('maasWalletBalanceLabel')}</p><strong>{wallet ? formatMaasQuota(wallet.quota, wallet.display, locale) : '—'}</strong><small>{t('maasWalletSeparate')}</small></div>
        <div><p>{t('accountWalletTotalUsage')}</p><strong>{wallet ? formatMaasQuota(wallet.usedQuota, wallet.display, locale) : '—'}</strong><small>{t('accountWalletUsageHint')}</small></div>
      </div>
      <PlatformSubscriptionSyncHint data={data} section="wallet" locale={locale} />
    </section>
    </div>
    <details className="platform-usage-explanation"><summary>{t('accountUsageExplanation')}</summary>
      <p>{t('accountUsageScope')}</p><p>{t('accountConsumptionUnavailable')}</p>
    </details>
  </div>;
}
