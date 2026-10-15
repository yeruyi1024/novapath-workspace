import './platformAccount.css';

import { ArrowPathIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react';

import type { MaasAccount } from '../../../shared/auth/maas';
import { MaasSubscriptionStatus } from '../../../shared/auth/maasSubscriptions';
import { i18nService } from '../../services/i18n';
import { applyMaasResult } from '../../services/maasAccount';
import { createMaasSubscriptionsStore } from '../../services/maasSubscriptions';
import { filterPlansByPeriod, PlatformPlanPeriod } from './platformAccountPresentation';
import { PlatformPlanCard, PlatformSubscriptionCard } from './PlatformPlanCard';

interface Props { account: MaasAccount; origin: string }

export default function PlatformSubscriptions({ account, origin }: Props) {
  const store = useMemo(() => createMaasSubscriptionsStore(account.id, origin,
    () => window.electron.maas.subscriptions(), applyMaasResult), [account.id, origin]);
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const language = useSyncExternalStore(listener => i18nService.subscribe(listener), () => i18nService.getLanguage());
  const locale = language === 'zh' ? 'zh-CN' : 'en-US';
  const [period, setPeriod] = useState<PlatformPlanPeriod>(PlatformPlanPeriod.All);
  const id = useId();
  const t = (key: string) => i18nService.t(key);
  useEffect(() => {
    store.activate();
    void store.refresh();
    const refresh = () => { void store.refresh(); };
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    return () => { store.dispose(); window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh); };
  }, [store]);
  const data = state.data;
  const subscriptions = data?.subscriptions.filter(item => item.status === MaasSubscriptionStatus.Active) ?? [];
  const history = data?.subscriptions.filter(item => item.status !== MaasSubscriptionStatus.Active) ?? [];
  const plans = data?.plans ?? [];
  const effectivePeriod = period === PlatformPlanPeriod.All || plans.some(plan => plan.durationUnit === period) ? period : PlatformPlanPeriod.All;
  const visiblePlans = filterPlansByPeriod(plans, effectivePeriod);
  const showPeriods = plans.some(plan => plan.durationUnit === PlatformPlanPeriod.Month) && plans.some(plan => plan.durationUnit === PlatformPlanPeriod.Year);
  const periods = [
    { key: PlatformPlanPeriod.All, label: 'maasPlanPeriodAll' },
    { key: PlatformPlanPeriod.Month, label: 'maasPlanPeriodMonth' },
    { key: PlatformPlanPeriod.Year, label: 'maasPlanPeriodYear' },
  ];

  return <div className="platform-subscriptions" aria-busy={state.loading}>
    {showPeriods && <div className="platform-plan-periods" role="group" aria-label={t('maasPlanPeriodLabel')}>
      {periods.map(({key, label}) => <button key={key} type="button" aria-pressed={effectivePeriod === key} onClick={() => setPeriod(key)}>{t(label)}</button>)}
    </div>}
    {state.error && <p role="alert" className="platform-account-notice text-error">{t(data ? 'maasSubscriptionsStale' : 'maasSubscriptionsUnavailable')} {t(`maasError_${state.error}`)}</p>}
    {state.loading && !data && <div className="platform-plan-grid" aria-hidden="true">{[0, 1, 2].map(item => <div key={item} className="platform-plan-skeleton"><span /><span /><span /></div>)}</div>}
    {data && <>
      <section aria-labelledby={`${id}-plans`} className="platform-subscription-catalog">
        <h3 id={`${id}-plans`} className="sr-only">{t('maasAvailablePlans')}</h3>
        {!plans.length ? <div className="platform-subscription-no-plans"><p className="text-base font-medium">{t('maasNoPlans')}</p><p className="mt-2 text-sm text-secondary">{t('maasPlansRetryHint')}</p></div> : <div className="platform-plan-grid" data-plan-count={visiblePlans.length}>{visiblePlans.map(plan => <PlatformPlanCard key={plan.id} plan={plan} subscribed={subscriptions.some(sub => sub.planId === plan.id)} locale={locale} />)}</div>}
      </section>
      <details className="platform-subscription-records">
        <summary><span>{t('maasMySubscriptions')}{subscriptions.length > 0 && <span className="ml-2 text-muted">({subscriptions.length})</span>}</span><ChevronDownIcon aria-hidden="true" className="h-4 w-4 shrink-0" /></summary>
        {!subscriptions.length ? <p className="platform-subscriptions-empty text-sm text-secondary">{t('maasNoSubscriptions')}</p> : <div className="platform-subscription-list">{subscriptions.map(subscription => <PlatformSubscriptionCard key={subscription.id} subscription={subscription} plan={plans.find(plan => plan.id === subscription.planId)} locale={locale} />)}</div>}
        {history.length > 0 && <section className="platform-subscription-record-history" aria-labelledby={`${id}-history`}><h3 id={`${id}-history`} className="mb-3 text-xs font-medium text-secondary">{t('maasSubscriptionHistory')}</h3><div className="platform-subscription-list">{history.map(subscription => <PlatformSubscriptionCard key={subscription.id} subscription={subscription} plan={plans.find(plan => plan.id === subscription.planId)} locale={locale} />)}</div></section>}
      </details>
    </>}
    <div className="platform-subscription-sync-row">
      <p role="status" aria-live="polite">{state.loading ? t('maasSubscriptionsLoading') : data ? `${t('maasBillingSyncedAt')} ${new Date(data.syncedAt).toLocaleString(locale)}` : ''}</p>
      <button type="button" disabled={state.loading} onClick={() => { void store.refresh(); }} className="platform-account-text-button"><ArrowPathIcon aria-hidden="true" className={`h-3.5 w-3.5 ${state.loading ? 'animate-spin motion-reduce:animate-none' : ''}`} />{t(state.loading ? 'loading' : 'maasRefreshSubscriptions')}</button>
    </div>
    <p className="platform-subscription-account-note">{t('maasSubscriptionsAccountHint')}</p>
  </div>;
}
