import './platformAccount.css';
import './platformAccountWorkspace.css';

import { ArrowRightStartOnRectangleIcon, ChartPieIcon, ChevronUpDownIcon, Cog6ToothIcon, SparklesIcon, UserCircleIcon } from '@heroicons/react/24/outline';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { i18nService } from '../../services/i18n';
import { applyMaasResult, useMaasAccount } from '../../services/maasAccount';
import CardOverflowMenu from '../common/CardOverflowMenu';
import PlatformAccountAvatar from './PlatformAccountAvatar';
import { PlatformAccountSection } from './platformAccountPresentation';
import PlatformLoginDialog from './PlatformLoginDialog';

interface Props { onShowSettings: () => void; onOpenSection: (section: PlatformAccountSection) => void }

export default function PlatformAccountButton({ onShowSettings, onOpenSection }: Props) {
  const snapshot = useMaasAccount();
  useSyncExternalStore(listener => i18nService.subscribe(listener), () => i18nService.getLanguage());
  const [loginOpen, setLoginOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { setError(''); }, [snapshot.origin, snapshot.account?.id]);
  const t = (key: string) => i18nService.t(key);

  const name = snapshot.account?.displayName || snapshot.account?.username || t('accountIdentity');
  const logout = async () => {
    if (pending) return;
    setPending(true); setError('');
    try {
      const result = await window.electron.maas.logout();
      applyMaasResult(result);
      if (alive.current && !result.success) setError(t(`maasError_${result.error ?? 'network'}`));
    } catch { if (alive.current) setError(t('maasError_network')); }
    finally { if (alive.current) setPending(false); }
  };
  return <div className="platform-sidebar-account" data-platform-account-entry>
    <CardOverflowMenu menuWidthPx={252} menuClassName="platform-account-menu" triggerClassName="platform-sidebar-profile"
      triggerLabel={t('maasAccountMenu')}
      menuHeader={snapshot.account && <div className="platform-account-menu-identity"><PlatformAccountAvatar name={name} /><div><strong>{name}</strong><span>@{snapshot.account.username}</span></div></div>}
      triggerContent={<>
        {snapshot.account ? <PlatformAccountAvatar name={name} /> : <img src="logo.svg" alt="" className="h-6 w-6 shrink-0 rounded-lg" />}
        <span className="platform-sidebar-identity"><strong>{snapshot.account ? name : t('productName')}</strong></span>
        <ChevronUpDownIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted" />
      </>}
      items={[
        ...(!snapshot.account ? [{ key: 'login', label: t('maasLoginTitle'), icon: <UserCircleIcon aria-hidden="true" className="h-4 w-4" />, onSelect: () => setLoginOpen(true) }] : []),
        ...(snapshot.account ? [
          { key: 'profile', label: t('maasProfileTitle'), icon: <UserCircleIcon aria-hidden="true" className="h-4 w-4" />, disabled: pending, onSelect: () => onOpenSection(PlatformAccountSection.Profile) },
          { key: 'usage', label: t('accountUsage'), icon: <ChartPieIcon aria-hidden="true" className="h-4 w-4" />, disabled: pending, onSelect: () => onOpenSection(PlatformAccountSection.Usage) },
          { key: 'subscriptions', label: t('accountSubscriptions'), icon: <SparklesIcon aria-hidden="true" className="h-4 w-4" />, disabled: pending, onSelect: () => onOpenSection(PlatformAccountSection.Subscriptions) },
        ] : []),
        { key: 'settings', label: t('settings'), icon: <Cog6ToothIcon aria-hidden="true" className="h-4 w-4" />, separatorBefore: true, disabled: pending, onSelect: onShowSettings },
        ...(snapshot.account ? [{ key: 'logout', label: t('authLogout'), icon: <ArrowRightStartOnRectangleIcon aria-hidden="true" className="h-4 w-4" />, disabled: pending, onSelect: () => { void logout(); } }] : []),
      ]} />
    {error && <p role="alert" className="platform-sidebar-account-error">{error}</p>}
    {loginOpen && !snapshot.account && <PlatformLoginDialog onClose={() => setLoginOpen(false)} />}
  </div>;
}
