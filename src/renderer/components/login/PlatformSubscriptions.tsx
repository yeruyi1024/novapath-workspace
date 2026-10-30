import './platformAccount.css';

import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import type { MaasAccount } from '../../../shared/auth/maas';
import { formatMaasQuota } from '../../../shared/auth/maasBilling';
import { estimateMaasPurchaseQuota, type MaasPurchaseResult,MaasPurchaseState } from '../../../shared/auth/maasSubscriptionPurchase';
import type { MaasPlan } from '../../../shared/auth/maasSubscriptions';
import { i18nService } from '../../services/i18n';
import { applyMaasResult, refreshMaasBilling } from '../../services/maasAccount';
import { createMaasSubscriptionsStore } from '../../services/maasSubscriptions';
import { filterPlansByPeriod, formatSubscriptionDate, isSubscriptionActive, PlatformAccountSection, PlatformPlanPeriod } from './platformAccountPresentation';
import { PlatformPlanCard } from './PlatformPlanCard';
import PlatformSubscriptionSyncHint from './PlatformSubscriptionSyncHint';
import PlatformUsage from './PlatformUsage';
import PlatformWalletPurchase from './PlatformWalletPurchase';

interface Props { account: MaasAccount; origin: string; view?: PlatformAccountSection; onViewChange?: (view: PlatformAccountSection) => void }

export default function PlatformSubscriptions({ account, origin, view = PlatformAccountSection.Subscriptions, onViewChange }: Props) {
  const store = useMemo(() => createMaasSubscriptionsStore(account.id, origin,
    () => window.electron.maas.subscriptionOverview ? window.electron.maas.subscriptionOverview(account.id) : window.electron.maas.subscriptions(), applyMaasResult), [account.id, origin]);
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const language = useSyncExternalStore(listener => i18nService.subscribe(listener), () => i18nService.getLanguage());
  const locale = language === 'zh' ? 'zh-CN' : 'en-US';
  const [period, setPeriod] = useState<PlatformPlanPeriod>(PlatformPlanPeriod.Month);
  const [buyingPlan, setBuyingPlan] = useState<number>();
  const [purchaseResult, setPurchaseResult] = useState<MaasPurchaseResult>();
  const [verified, setVerified] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState(false);
  const [now, setNow] = useState(Date.now());
  const currentPurchase = useRef(buyingPlan);
  currentPurchase.current = buyingPlan;
  const followupTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const t = (key: string) => i18nService.t(key);
  useEffect(() => {
    store.activate();
    const timers = followupTimers.current;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastAttempt = 0;
    let failures = 0;
    const visible = () => document.visibilityState !== 'hidden' && navigator.onLine;
    const schedule = () => {
      clearTimeout(timer);
      if (disposed || !visible()) return;
      const time = Date.now();
      const records = store.getState().data?.subscriptions ?? [];
      const future = records.flatMap(sub => [sub.endTime * 1000, sub.nextResetTime * 1000]).filter(at => at > time);
      const backoff = [60_000, 120_000, 300_000][Math.min(Math.max(0, failures - 1), 2)];
      const delay = failures ? backoff : Math.max(1000, Math.min(60_000, ...future.map(at => at - time + 50)));
      timer = setTimeout(() => { void refresh(); }, delay);
    };
    const refresh = async () => {
      if (disposed || !visible()) return;
      setNow(Date.now());
      if (currentPurchase.current === undefined && Date.now() - lastAttempt >= 5000) {
        lastAttempt = Date.now();
        await store.refresh();
        failures = store.getState().error ? failures + 1 : 0;
      }
      schedule();
    };
    const unsubscribe = store.subscribe(() => {
      if (!store.getState().loading) { setNow(Date.now()); schedule(); }
    });
    void refresh();
    const resume = () => { if (visible()) void refresh(); else clearTimeout(timer); };
    window.addEventListener('focus', resume); window.addEventListener('online', resume); window.addEventListener('offline', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      disposed = true; clearTimeout(timer); unsubscribe(); store.dispose();
      timers.forEach(clearTimeout); timers.clear();
      window.removeEventListener('focus', resume); window.removeEventListener('online', resume); window.removeEventListener('offline', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [store]);
  useEffect(() => { setBuyingPlan(undefined); setPurchaseResult(undefined); setVerified(false); }, [account.id, origin]);
  useEffect(() => { if (view === PlatformAccountSection.Usage) setBuyingPlan(undefined); }, [view]);
  const data = state.data;
  const subscriptions = data?.subscriptions.filter(item => isSubscriptionActive(item, now)) ?? [];
  const plans = data?.plans ?? [];
  const visiblePlans = filterPlansByPeriod(plans, period);
  const wallet = data?.wallet;
  const pending = Boolean(data?.pendingPurchase || purchaseResult?.state === MaasPurchaseState.Unknown);
  const pendingInfo = data?.pendingPurchase ?? purchaseResult?.pending;
  const periods = [{ key: PlatformPlanPeriod.Month, label: 'accountMonthly' }, { key: PlatformPlanPeriod.Year, label: 'accountAnnual' }];
  const disabledReason = (plan: MaasPlan) => {
    if (pending) return 'maasPurchase_error_pending';
    if (!window.electron.maas.prepareSubscriptionPurchase || state.error || data?.paymentCompliance !== true || plan.allowBalancePay !== true || !data.historyComplete || plan.maxPurchasePerUser === undefined || !wallet) return 'maasPurchase_error_unavailable';
    if (plan.currency !== 'USD') return 'maasPurchase_error_currency';
    if (plan.maxPurchasePerUser > 0 && data.subscriptions.filter(sub => sub.planId === plan.id).length >= plan.maxPurchasePerUser) return 'maasPurchase_error_limit';
    try { if (wallet.quota < estimateMaasPurchaseQuota(plan.price, wallet.display.quotaPerUnit)) return 'maasPurchase_error_balance'; } catch { return 'maasPurchase_error_unavailable'; }
    return undefined;
  };
  const complete = (result: MaasPurchaseResult) => {
    setPurchaseResult(result); setBuyingPlan(undefined); setVerified(false);
    void store.refresh(); void refreshMaasBilling();
    if (result.state === MaasPurchaseState.Succeeded || result.state === MaasPurchaseState.Unknown) {
      for (const delay of [2000, 7000, 17000, 37000, 67000]) {
        const timer = setTimeout(() => {
          followupTimers.current.delete(timer);
          if (document.visibilityState !== 'hidden' && navigator.onLine) { void store.refresh(); void refreshMaasBilling(); }
        }, delay);
        followupTimers.current.add(timer);
      }
    }
  };
  const unlock = async () => {
    if (!verified || clearing) return;
    setClearing(true); setClearError(false);
    try {
      const result = await window.electron.maas.clearPendingSubscriptionPurchase(account.id);
      if (result.success && result.snapshot.origin === origin && result.snapshot.account?.id === account.id && result.purchase?.state === MaasPurchaseState.Ready) {
        setPurchaseResult(undefined); setVerified(false); await store.refresh();
      } else setClearError(true);
    } catch { setClearError(true); } finally { setClearing(false); }
  };
  if (buyingPlan !== undefined && view === PlatformAccountSection.Subscriptions) return <PlatformWalletPurchase key={account.id + '/' + buyingPlan} accountId={account.id} username={account.username} origin={origin} planId={buyingPlan} onBack={() => { setBuyingPlan(undefined); void store.refresh(); }} onResult={complete} />;
  const sync = <div className="platform-subscription-sync-row"><p role="status" aria-live="polite">{state.loading ? t('maasSubscriptionsLoading') : data ? t('accountDataUpdated') + ' ' + formatSubscriptionDate((data.sectionSyncedAt?.subscriptions ?? data.syncedAt) / 1000, locale, t) : t('accountUsageNotSynced')}</p><button type="button" disabled={state.loading} onClick={() => { setNow(Date.now()); void store.refresh(); }} className="platform-account-text-button"><ArrowPathIcon aria-hidden="true" className={'h-3.5 w-3.5 ' + (state.loading ? 'animate-spin motion-reduce:animate-none' : '')} />{t(state.loading ? 'loading' : 'accountRefresh')}</button></div>;
  if (view === PlatformAccountSection.Usage) return <div className="platform-subscriptions" aria-busy={state.loading}>
    {state.error && <p role="alert" className="platform-account-notice text-error">{t(data ? 'maasSubscriptionsStale' : 'maasSubscriptionsUnavailable')}</p>}
    {pending && <p role="status" className="platform-purchase-notice">{t('maasPurchaseUnknown')} <button type="button" className="platform-account-text-button" onClick={() => onViewChange?.(PlatformAccountSection.Subscriptions)}>{t('accountViewSubscriptions')}</button></p>}
    <PlatformUsage state={state} locale={locale} now={now} onViewSubscriptions={() => onViewChange?.(PlatformAccountSection.Subscriptions)} />{sync}
  </div>;
  return <div className="platform-subscriptions" aria-busy={state.loading}>
    {purchaseResult?.state === MaasPurchaseState.Succeeded && <p role="status" className="platform-purchase-notice platform-purchase-success">{t('maasPurchaseSuccess')}</p>}
    {pending && <div className="platform-purchase-notice" role="status"><p>{t('maasPurchaseUnknown')}</p>{pendingInfo && <p className="platform-plan-hint">{plans.find(plan => plan.id === pendingInfo.planId)?.title || t('maasPlanNumber') + ' ' + pendingInfo.planId} · {t('maasPurchaseAmount')} {wallet ? formatMaasQuota(pendingInfo.chargedQuota, wallet.display, locale) : pendingInfo.chargedQuota.toLocaleString(locale) + ' ' + t('maasRawQuotaUnit')}<br />{t('maasPurchaseSubmittedAt')} {formatSubscriptionDate(pendingInfo.startedAt / 1000, locale, t)}</p>}<label className="platform-wallet-verify"><input type="checkbox" checked={verified} onChange={event => setVerified(event.target.checked)} />{t('maasPurchaseVerify')}</label><p className="platform-plan-hint">{t('maasPurchaseUnlockHint')}</p><button type="button" className="platform-account-text-button" disabled={!verified || clearing} onClick={() => { void unlock(); }}>{t('maasPurchaseUnlock')}</button>{clearError && <p role="alert">{t('maasPurchase_error_network')}</p>}</div>}
    <div className="platform-plan-periods-bar"><div className="platform-plan-periods" role="group" aria-label={t('accountBillingCycle')}>{periods.map(({ key, label }) => <button key={key} type="button" aria-pressed={period === key} onClick={() => setPeriod(key)}>{t(label)}</button>)}</div></div>
    {state.error && <p role="alert" className="platform-account-notice text-error">{t(data ? 'maasSubscriptionsStale' : 'maasSubscriptionsUnavailable')}</p>}
    {state.loading && !data && <div className="platform-plan-grid" aria-hidden="true">{[0, 1, 2].map(item => <div key={item} className="platform-plan-skeleton"><span /><span /><span /></div>)}</div>}
    {data && <>
      <section aria-label={t('maasAvailablePlans')} className="platform-subscription-catalog"><PlatformSubscriptionSyncHint data={data} section="plans" locale={locale} />
        {!visiblePlans.length ? <div className="platform-subscription-no-plans"><h2>{t(data.errors?.plans ? 'maasSubscriptionsUnavailable' : period === PlatformPlanPeriod.Year ? 'accountNoAnnualPlans' : 'accountNoMonthlyPlans')}</h2><p>{t(data.errors?.plans ? 'maasPlansRetryHint' : data.paymentCompliance === false ? 'maasPaymentClosed' : 'accountPlansEmptyHint')}</p></div> : <div className="platform-plan-grid" data-plan-count={visiblePlans.length}>{visiblePlans.map(plan => <PlatformPlanCard key={plan.id} plan={plan} subscribed={subscriptions.some(sub => sub.planId === plan.id)} locale={locale} display={wallet?.display} onBuy={() => setBuyingPlan(plan.id)} disabledReason={disabledReason(plan)} purchaseCount={data.subscriptions.filter(sub => sub.planId === plan.id).length} />)}</div>}
      </section>
      {period === PlatformPlanPeriod.Year && <p className="platform-subscription-account-note">{t('accountAnnualQuotaHint')}</p>}
    </>}
    {sync}
    <p className="platform-subscription-account-note">{t('maasSubscriptionsAccountHint')}</p>
  </div>;
}
