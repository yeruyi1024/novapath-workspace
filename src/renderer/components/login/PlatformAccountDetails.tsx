import './platformAccount.css';

import { ArrowPathIcon, ArrowRightStartOnRectangleIcon } from '@heroicons/react/24/outline';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { MaasAccount } from '../../../shared/auth/maas';
import { formatMaasQuota } from '../../../shared/auth/maasBilling';
import { i18nService } from '../../services/i18n';
import { applyMaasResult, refreshMaasAccount, refreshMaasBilling, useMaasSession } from '../../services/maasAccount';
import PlatformAccountAvatar from './PlatformAccountAvatar';

interface Props { account: MaasAccount; onClose?: () => void }

export default function PlatformAccountDetails({ account, onClose }: Props) {
  const session = useMaasSession();
  const language = useSyncExternalStore(listener => i18nService.subscribe(listener), () => i18nService.getLanguage());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true);
  const t = (key: string) => i18nService.t(key);
  const name = account.displayName || account.username;
  const billing = session.snapshot.account?.id === account.id && session.snapshot.billing?.accountId === account.id
    ? session.snapshot.billing : undefined;
  const locale = language === 'zh' ? 'zh-CN' : 'en-US';
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  const refresh = async () => {
    if (pending) return;
    setPending(true); setError('');
    try {
      await refreshMaasAccount();
      await refreshMaasBilling();
    } catch {
      if (active.current) setError(t('maasError_network'));
    } finally {
      if (active.current) setPending(false);
    }
  };
  const logout = async () => {
    if (pending) return;
    setPending(true); setError('');
    try {
      const result = await window.electron.maas.logout();
      if (active.current) {
        if (result.success) onClose?.();
        else setError(t(`maasError_${result.error ?? 'network'}`));
      }
      applyMaasResult(result);
    } catch { if (active.current) setError(t('maasError_network')); }
    finally { if (active.current) setPending(false); }
  };

  return <>
    <div className="platform-account-body">
      <section className="platform-account-panel">
        <div className="platform-profile-identity">
          <PlatformAccountAvatar name={name} large />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="break-words text-base font-semibold tracking-tight text-foreground">{name}</h3>
              <span className="platform-account-status">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {t('maasSignedIn')}
              </span>
            </div>
            <p className="platform-profile-meta" title={account.username}>
              <span className="truncate">@{account.username}</span>
              <span aria-hidden="true">·</span>
              <span className="shrink-0 tabular-nums">#{account.id}</span>
            </p>
          </div>
        </div>

        <section className="platform-account-balance" aria-label={t('maasBalance')}>
          <div className="platform-account-balance-main">
            <div className="min-w-0">
              <p className="platform-bento-label">{t('maasBalance')}</p>
              <p className="platform-account-balance-value">
                {billing ? formatMaasQuota(billing.quota, billing.display, locale) : '—'}
              </p>
            </div>
            {billing && <div className="platform-account-balance-usage">
              <span>{t('maasTotalUsage')}</span>
              <strong>{formatMaasQuota(billing.usedQuota, billing.display, locale)}</strong>
            </div>}
          </div>
          <div className="platform-account-balance-foot">
            <p className="platform-account-balance-note" role={session.billingError ? 'status' : undefined}>
              {session.billingError
                ? t(billing ? 'maasBillingStale' : 'maasBillingUnavailable')
                : session.billingLoading
                  ? t('maasBillingSyncing')
                  : billing
                    ? t('maasBillingDisplayHint')
                    : t('maasBillingNotSynced')}
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={() => { void refresh(); }}
              className="platform-account-refresh-btn"
              title={t('maasRefreshProfile')}
              aria-label={t('maasRefreshProfile')}
            >
              <ArrowPathIcon aria-hidden="true" className={`h-3.5 w-3.5 ${pending ? 'animate-spin motion-reduce:animate-none' : ''}`} />
              <span>{t(pending ? 'loading' : 'maasRefreshProfile')}</span>
            </button>
          </div>
        </section>
        {session.error && <p role="alert" className="platform-account-notice text-error">{t(`maasError_${session.error}`)}</p>}
      </section>
      {error && <p role="alert" className="platform-account-notice text-error">{error}</p>}
    </div>
    <footer className="platform-account-footer">
      <button type="button" disabled={pending} onClick={() => { void logout(); }} className="platform-account-text-button"><ArrowRightStartOnRectangleIcon aria-hidden="true" className="h-4 w-4" />{t('authLogout')}</button>
      {onClose && <button type="button" onClick={onClose} className="platform-account-button">{t('close')}</button>}
    </footer>
  </>;
}
