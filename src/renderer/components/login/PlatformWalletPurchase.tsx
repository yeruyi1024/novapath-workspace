import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { useEffect, useRef, useState } from 'react';

import { formatMaasQuota } from '../../../shared/auth/maasBilling';
import { type MaasPurchaseConfirmation, MaasPurchaseError, type MaasPurchaseResult,MaasPurchaseState } from '../../../shared/auth/maasSubscriptionPurchase';
import { i18nService } from '../../services/i18n';
import { applyMaasResult } from '../../services/maasAccount';
import { formatPlanDuration, formatPlanPriceLabel, formatPlanReset } from './platformAccountPresentation';
import { formatSubscriptionQuota } from './PlatformPlanCard';

export default function PlatformWalletPurchase({ accountId, username, origin, planId, onBack, onResult }: {
  accountId: number; username: string; origin: string; planId: number; onBack: () => void; onResult: (result: MaasPurchaseResult) => void;
}) {
  const [confirmation, setConfirmation] = useState<MaasPurchaseConfirmation>();
  const [error, setError] = useState<MaasPurchaseError>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [attempt, setAttempt] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const alive = useRef(true);
  const locked = useRef(false);
  const locale = i18nService.getLanguage() === 'zh' ? 'zh-CN' : 'en-US';
  const t = (key: string) => i18nService.t(key);
  useEffect(() => {
    alive.current = true;
    heading.current?.focus();
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(undefined); setConfirmation(undefined);
    void window.electron.maas.prepareSubscriptionPurchase({ accountId, planId }).then(result => {
      if (cancelled) return;
      if (result.snapshot.origin !== origin || result.snapshot.account?.id !== accountId) {
        setError(MaasPurchaseError.Account);
        if (result.snapshot.origin === origin && !result.snapshot.account && result.error === 'loginRejected') applyMaasResult({ ...result, success: true });
      } else if (!result.success || !result.purchase?.confirmation) {
        setError(result.purchase?.error ?? MaasPurchaseError.Network);
      } else setConfirmation(result.purchase.confirmation);
    }).catch(() => { if (!cancelled) setError(MaasPurchaseError.Network); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [accountId, origin, planId, attempt]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const submit = async () => {
    if (!confirmation || locked.current || error || confirmation.expiresAt <= Date.now()) return;
    locked.current = true; setSubmitting(true); setError(undefined);
    try {
      const result = await window.electron.maas.purchaseSubscriptionWithBalance({ accountId, confirmationId: confirmation.confirmationId });
      if (!alive.current) return;
      if (result.snapshot.origin !== origin || result.snapshot.account?.id !== accountId) { setError(MaasPurchaseError.Account); setConfirmation(undefined); return; }
      if (!result.success || !result.purchase) { setError(MaasPurchaseError.Network); setConfirmation(undefined); return; }
      if (result.purchase.state === MaasPurchaseState.Succeeded || result.purchase.state === MaasPurchaseState.Unknown) onResult(result.purchase);
      else { setError(result.purchase.error ?? MaasPurchaseError.Rejected); setConfirmation(undefined); }
    } catch {
      // IPC loss after submission does not prove failure. Main-process journal resolves on refresh/restart.
      if (alive.current) onResult({ state: MaasPurchaseState.Unknown });
    } finally { locked.current = false; if (alive.current) setSubmitting(false); }
  };
  const expired = Boolean(confirmation && confirmation.expiresAt <= now);
  const plan = confirmation?.plan;
  const amount = confirmation ? formatMaasQuota(confirmation.chargedQuota, confirmation.wallet.display, locale) : '';
  return <section className="platform-wallet-confirm" aria-busy={loading || submitting}>
    <button type="button" className="platform-account-text-button" onClick={onBack} disabled={submitting}><ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />{t('maasPurchaseBack')}</button>
    <div className="platform-wallet-confirm-title"><h3 ref={heading} tabIndex={-1}>{t('maasPurchaseReview')}</h3></div>
    {loading && <p role="status" className="platform-purchase-notice">{t('maasSubscriptionsLoading')}</p>}
    {error && <p role="alert" className="platform-purchase-notice text-error">{t('maasPurchase_error_' + error)}</p>}
    {expired && !submitting && <p role="status" className="platform-purchase-notice">{t('maasPurchase_error_expired')}</p>}
    {confirmation && plan && <>
      <div className="platform-wallet-amount"><span>{t('maasPurchaseAmount')}</span><strong>{amount}</strong></div>
      <div className="platform-wallet-order">
        <div className="platform-wallet-order-heading"><h4>{plan.title}</h4><span>{formatPlanPriceLabel(plan, locale, confirmation.wallet.display)} / {formatPlanDuration(plan, locale, t)}</span></div>
        <dl className="platform-wallet-order-allowance"><div><dt>{t('maasPlanCycleQuota')}</dt><dd>{plan.totalAmount === 0 ? t('maasUnlimitedQuota') : formatSubscriptionQuota(plan.totalAmount, confirmation.wallet.display, locale)}</dd></div><div><dt>{t('maasPlanReset')}</dt><dd>{formatPlanReset(plan, locale, t)}</dd></div></dl>
      </div>
      <dl className="platform-wallet-review-details">
        <div><dt>{t('maasUsername')}</dt><dd>{username}</dd></div>
        <div><dt>{t('maasWalletBalanceLabel')}</dt><dd>{formatMaasQuota(confirmation.wallet.quota, confirmation.wallet.display, locale)}</dd></div>
        <div><dt>{t('maasPurchaseAfter')}</dt><dd>{formatMaasQuota(Math.max(0, confirmation.wallet.quota - confirmation.chargedQuota), confirmation.wallet.display, locale)}</dd></div>
      </dl>
      <p className="platform-wallet-policy">{t('maasPurchaseNewRecord')}</p>
    </>}
    <div className="platform-wallet-confirm-actions">
      {(error || expired) && !loading && <button type="button" className="platform-subscribe-button" onClick={() => setAttempt(value => value + 1)} disabled={submitting}>{t('maasPurchaseRecheck')}</button>}
      {confirmation && !expired && !error && <button type="button" className="platform-subscribe-button" disabled={submitting} onClick={() => { void submit(); }}>{t(submitting ? 'maasPurchaseSubmitting' : 'maasPurchaseConfirm')}{!submitting && ' ' + amount}</button>}
    </div>
    {confirmation && <p className="platform-wallet-settlement">{t('maasPurchaseSettlement')}</p>}
  </section>;
}
