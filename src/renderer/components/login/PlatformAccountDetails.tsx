import './platformAccount.css';

import { ArrowPathIcon, ArrowRightStartOnRectangleIcon, CheckCircleIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { MaasAccount } from '../../../shared/auth/maas';
import { i18nService } from '../../services/i18n';
import { applyMaasResult, refreshMaasAccount, useMaasSession } from '../../services/maasAccount';
import PlatformAccountAvatar from './PlatformAccountAvatar';

interface Props { account: MaasAccount; onClose?: () => void }

export default function PlatformAccountDetails({ account, onClose }: Props) {
  const session = useMaasSession();
  useSyncExternalStore(listener => i18nService.subscribe(listener), () => i18nService.getLanguage());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true);
  const t = (key: string) => i18nService.t(key);
  const name = account.displayName || account.username;
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  const refresh = async () => {
    if (pending) return;
    setPending(true); setError('');
    await refreshMaasAccount();
    if (active.current) setPending(false);
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
          <div className="min-w-0 flex-1"><h3 className="break-words text-xl font-semibold tracking-tight">{name}</h3><p className="mt-1 break-all text-sm text-secondary">{account.username}</p></div>
          <span className="platform-account-status"><CheckCircleIcon aria-hidden="true" className="h-3.5 w-3.5" />{t('maasSignedIn')}</span>
        </div>
        <div className="platform-account-section-heading"><h3>{t('maasProfileDetails')}</h3>
          <button type="button" disabled={pending} onClick={() => { void refresh(); }} className="platform-account-text-button"><ArrowPathIcon aria-hidden="true" className={`h-3.5 w-3.5 ${pending ? 'animate-spin motion-reduce:animate-none' : ''}`} />{t(pending ? 'loading' : 'maasRefreshProfile')}</button>
        </div>
        <dl className="platform-profile-details">
          {[['maasDisplayName', name], ['maasUsername', account.username], ['maasAccountId', `#${account.id}`]].map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>)}
        </dl>
        {session.error && <p role="alert" className="platform-account-notice text-error">{t(`maasError_${session.error}`)}</p>}
        <div className="platform-profile-security"><ShieldCheckIcon aria-hidden="true" className="h-4 w-4 shrink-0" /><div><p className="text-xs font-medium text-foreground">{t('maasAccountSecurityTitle')}</p><p className="mt-1 text-xs leading-5 text-secondary">{t('maasLoginSecurity')}</p></div></div>
      </section>
      {error && <p role="alert" className="platform-account-notice text-error">{error}</p>}
    </div>
    <footer className="platform-account-footer">
      <button type="button" disabled={pending} onClick={() => { void logout(); }} className="platform-account-text-button"><ArrowRightStartOnRectangleIcon aria-hidden="true" className="h-4 w-4" />{t('authLogout')}</button>
      {onClose && <button type="button" onClick={onClose} className="platform-account-button">{t('close')}</button>}
    </footer>
  </>;
}
