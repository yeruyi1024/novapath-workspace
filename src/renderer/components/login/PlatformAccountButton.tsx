import './platformAccount.css';

import { ChevronUpDownIcon, Cog6ToothIcon, SparklesIcon, UserCircleIcon } from '@heroicons/react/24/outline';
import { useState, useSyncExternalStore } from 'react';

import { i18nService } from '../../services/i18n';
import { useMaasAccount } from '../../services/maasAccount';
import CardOverflowMenu from '../common/CardOverflowMenu';
import { PlatformAccountTab } from './platformAccountPresentation';
import PlatformLoginDialog from './PlatformLoginDialog';
import PlatformSubscriptionDialog from './PlatformSubscriptionDialog';

interface Props { onShowSettings: () => void }

export default function PlatformAccountButton({ onShowSettings }: Props) {
  const snapshot = useMaasAccount();
  useSyncExternalStore(listener => i18nService.subscribe(listener), () => i18nService.getLanguage());
  const [tab, setTab] = useState<PlatformAccountTab | null>(null);
  const t = (key: string) => i18nService.t(key);

  return <div className="platform-sidebar-account">
    <CardOverflowMenu menuWidthPx={232} triggerClassName="platform-sidebar-profile platform-sidebar-brand"
      triggerLabel={t('maasAccountMenu')}
      triggerContent={<>
      <img src="logo.svg" alt="" className="h-7 w-7 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-left text-[13px] font-medium text-foreground">{t('productName')}</span>
      <ChevronUpDownIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-muted" />
      </>}
      items={[
        ...(!snapshot.account ? [{ key: PlatformAccountTab.Profile, label: t('maasLoginTitle'), icon: <UserCircleIcon aria-hidden="true" className="h-4 w-4" />, onSelect: () => setTab(PlatformAccountTab.Profile) }] : []),
        ...(snapshot.account ? [{ key: PlatformAccountTab.Subscriptions, label: t('maasUpgradePlan'), icon: <SparklesIcon aria-hidden="true" className="h-4 w-4 text-primary" />, onSelect: () => setTab(PlatformAccountTab.Subscriptions) }] : []),
        { key: 'settings', label: t('settings'), icon: <Cog6ToothIcon aria-hidden="true" className="h-4 w-4" />, separatorBefore: true, onSelect: onShowSettings },
      ]} />
    {tab && !snapshot.account && <PlatformLoginDialog onClose={() => setTab(null)} />}
    {tab === PlatformAccountTab.Subscriptions && snapshot.account && <PlatformSubscriptionDialog key={`${snapshot.origin}:${snapshot.account.id}`} account={snapshot.account} origin={snapshot.origin} onClose={() => setTab(null)} />}
  </div>;
}
