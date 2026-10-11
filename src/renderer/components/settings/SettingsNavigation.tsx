import { ChevronDownIcon } from '@heroicons/react/24/outline';
import React, { useEffect, useState } from 'react';

import { PRODUCT } from '../../../shared/product';
import { i18nService } from '../../services/i18n';

const primaryGroups = [
  { label: 'starpathWorkspaceSettings', keys: ['general', 'appearance', 'shortcuts'] },
  { label: 'starpathPlatformTools', keys: ['model', 'plugins'] },
];
const primaryKeys = primaryGroups.flatMap(group => group.keys);

interface Props<T extends string> {
  tabs: { key: T; label: string; icon: React.ReactNode }[];
  activeTab: T;
  onSelect: (key: T) => void;
}

export default function SettingsNavigation<T extends string>({ tabs, activeTab, onSelect }: Props<T>) {
  const isAdvancedTab = !primaryKeys.includes(activeTab) && activeTab !== 'about';
  const [advancedOpen, setAdvancedOpen] = useState(isAdvancedTab);
  useEffect(() => { if (isAdvancedTab) setAdvancedOpen(true); }, [activeTab, isAdvancedTab]);
  const renderTab = (tab: Props<T>['tabs'][number]) => (
    <button key={tab.key} type="button" onClick={() => onSelect(tab.key)} aria-current={activeTab === tab.key ? 'page' : undefined}
      className={`settings-nav-item ${activeTab === tab.key ? 'is-active' : ''}`}>
      <span className="settings-nav-icon">{tab.icon}</span><span className="truncate">{tab.label}</span>
    </button>
  );
  return (
    <aside className="settings-navigation">
      <div className="settings-brand">
        <img src="logo.svg" alt="" className="h-9 w-9 shrink-0" />
        <div><div className="flex items-baseline gap-2"><span className="text-base font-semibold text-foreground">{PRODUCT.shortName}</span>
          <span className="text-xs text-secondary">{PRODUCT.englishName}</span></div>
          <p className="mt-0.5 text-[11px] text-secondary">{i18nService.t('starpathWorkspace')}</p></div>
      </div>
      <nav aria-label={i18nService.t('settings')} className="settings-nav-list">
        {primaryGroups.map(group => (
          <div key={group.label} className="settings-nav-group">
            <p className="settings-nav-group-label">{i18nService.t(group.label)}</p>
            {group.keys.flatMap(key => tabs.filter(tab => tab.key === key)).map(renderTab)}
          </div>
        ))}
        {tabs.some(tab => !primaryKeys.includes(tab.key) && tab.key !== 'about') && (
          <div className="settings-advanced-navigation">
            <button type="button" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen(value => !value)} className="settings-nav-item text-secondary">
              <ChevronDownIcon className={`h-4 w-4 transition-transform ${advancedOpen ? '' : '-rotate-90'}`} />
              <span>{i18nService.t('starpathAdvancedSettings')}</span>
            </button>
            {advancedOpen && tabs.filter(tab => !primaryKeys.includes(tab.key) && tab.key !== 'about').map(renderTab)}
          </div>
        )}
      </nav>
      <div className="settings-nav-footer">{tabs.filter(tab => tab.key === 'about').map(renderTab)}
        <p className="px-3 pt-3 text-[11px] leading-5 text-secondary">{i18nService.t('starpathTagline')}</p></div>
    </aside>
  );
}
