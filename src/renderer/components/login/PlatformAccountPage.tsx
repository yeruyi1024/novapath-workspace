import './platformAccountWorkspace.css';
import './platformSubscription.css';

import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

import { i18nService } from '../../services/i18n';
import { useMaasAccount } from '../../services/maasAccount';
import SidebarToggleIcon from '../icons/SidebarToggleIcon';
import PlatformAccountDetails from './PlatformAccountDetails';
import { PlatformAccountSection } from './platformAccountPresentation';
import PlatformLoginDialog from './PlatformLoginDialog';
import PlatformSubscriptions from './PlatformSubscriptions';

export { PlatformAccountSection } from './platformAccountPresentation';

export default function PlatformAccountPage({ section, onSectionChange, onBack, collapsed, onToggleSidebar }: {
  section: PlatformAccountSection; onSectionChange: (section: PlatformAccountSection) => void;
  onBack: () => void; collapsed: boolean; onToggleSidebar: () => void;
}) {
  const snapshot = useMaasAccount();
  useSyncExternalStore(listener => i18nService.subscribe(listener), () => i18nService.getLanguage());
  const [loginOpen, setLoginOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const positions = useRef<Record<PlatformAccountSection, number>>({ profile: 0, usage: 0, subscriptions: 0 });
  const t = (key: string) => i18nService.t(key);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [section, snapshot.origin, snapshot.account?.id]);
  useLayoutEffect(() => {
    const element = scroll.current;
    const savedPositions = positions.current;
    if (element) element.scrollTop = savedPositions[section];
    return () => { if (element) savedPositions[section] = element.scrollTop; };
  }, [section]);
  const profile = section === PlatformAccountSection.Profile;
  return <main className="platform-account-workspace" onKeyDown={event => {
    if (event.key !== 'Escape' || event.defaultPrevented || (event.target instanceof HTMLElement && event.target.closest('[data-app-modal], input, textarea, select'))) return;
    event.preventDefault(); onBack();
  }}>
    <header className={'platform-account-workspace-topbar draggable' + (collapsed && window.electron.platform === 'darwin' ? ' platform-account-macos-collapsed' : '')}>
      <div className="non-draggable">{collapsed && <button type="button" onClick={onToggleSidebar} aria-label={t('expand')}><SidebarToggleIcon className="h-4 w-4" isCollapsed={collapsed} /></button>}
        <button type="button" onClick={onBack}><ArrowLeftIcon aria-hidden="true" className="h-4 w-4" />{t('accountWorkspaceBack')}</button></div>
      <nav className="non-draggable" aria-label={t('accountIdentity')}>
        <button type="button" aria-current={profile ? 'page' : undefined} onClick={() => onSectionChange(PlatformAccountSection.Profile)}>{t('maasProfileTitle')}</button>
        <button type="button" aria-current={section === PlatformAccountSection.Usage ? 'page' : undefined} onClick={() => onSectionChange(PlatformAccountSection.Usage)}>{t('accountUsage')}</button>
        <button type="button" aria-current={section === PlatformAccountSection.Subscriptions ? 'page' : undefined} onClick={() => onSectionChange(PlatformAccountSection.Subscriptions)}>{t('accountSubscriptions')}</button>
      </nav>
    </header>
    <div ref={scroll} className="platform-account-workspace-scroll">
      <div className="platform-account-workspace-content" data-account-view={section}>
        <div className="platform-account-workspace-title">
          <h1 ref={heading} tabIndex={-1}>{t(profile ? 'maasProfileTitle' : section === PlatformAccountSection.Usage ? 'accountUsage' : 'accountSubscriptions')}</h1>
          <p>{t(profile ? 'profilePageDescription' : section === PlatformAccountSection.Usage ? 'accountUsageDescription' : 'accountSubscriptionsDescription')}</p>
        </div>
        {snapshot.account ? profile ? <PlatformAccountDetails key={`${snapshot.origin}:${snapshot.account.id}`} account={snapshot.account} /> : <PlatformSubscriptions key={`${snapshot.origin}:${snapshot.account.id}`} account={snapshot.account} origin={snapshot.origin} view={section} onViewChange={onSectionChange} />
          : <div className="platform-account-empty"><h2>{t('accountLoginRequired')}</h2><button type="button" className="platform-account-button" onClick={() => setLoginOpen(true)}>{t('accountLoginAction')}</button></div>}
      </div>
    </div>
    {loginOpen && !snapshot.account && <PlatformLoginDialog onClose={() => setLoginOpen(false)} />}
  </main>;
}
