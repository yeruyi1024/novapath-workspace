import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import React, { useRef, useState } from 'react';

import { PRODUCT } from '../../../shared/product';
import { i18nService } from '../../services/i18n';

export const SettingsTab = { Account: 'account' } as const;

const groups = [
  { label: 'starpathWorkspaceSettings', keys: [SettingsTab.Account, 'general', 'appearance', 'coworkMemory', 'shortcuts'] },
  { label: 'starpathPlatformTools', keys: ['model', 'plugins', 'browserWebAccess'] },
  { label: 'starpathConnectionsSettings', keys: ['im', 'email', 'coworkAgentEngine'] },
];
const NavigationKey = { Next: 'ArrowDown', Previous: 'ArrowUp', Right: 'ArrowRight', Left: 'ArrowLeft', First: 'Home', Last: 'End' } as const;

interface Props<T extends string> {
  tabs: { key: T; label: string; icon: React.ReactNode }[];
  activeTab: T;
  onSelect: (key: T) => void;
}

export default function SettingsNavigation<T extends string>({ tabs, activeTab, onSelect }: Props<T>) {
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleTabs = tabs.filter(tab => !normalizedQuery
    || `${tab.label} ${i18nService.t(`starpathSettingsDescription_${tab.key}`)}`.toLocaleLowerCase().includes(normalizedQuery));
  const clearSearch = () => { setQuery(''); searchRef.current?.focus(); };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-settings-tab]'));
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    let next: number;
    switch (event.key) {
      case NavigationKey.Next: case NavigationKey.Right: next = (index + 1) % buttons.length; break;
      case NavigationKey.Previous: case NavigationKey.Left: next = (index - 1 + buttons.length) % buttons.length; break;
      case NavigationKey.First: next = 0; break;
      case NavigationKey.Last: next = buttons.length - 1; break;
      default: return;
    }
    event.preventDefault();
    buttons[next].focus();
    buttons[next].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  const renderTab = (tab: Props<T>['tabs'][number]) => (
    <button key={tab.key} data-settings-tab={tab.key} type="button" onClick={() => onSelect(tab.key)}
      aria-current={activeTab === tab.key ? 'page' : undefined}
      className={`settings-nav-item ${activeTab === tab.key ? 'is-active' : ''}`}>
      <span className="settings-nav-icon" aria-hidden="true">{tab.icon}</span><span>{tab.label}</span>
    </button>
  );
  return (
    <header className="settings-navigation">
      <div className="settings-brand">
        <img src="logo.svg" alt="" />
        <div><div className="settings-brand-name">{PRODUCT.shortName}<span>{PRODUCT.englishName}</span></div>
          <p>{i18nService.t('starpathSettingsWorkbench')}</p></div>
      </div>
      <div className="settings-nav-search settings-search-field">
        <MagnifyingGlassIcon aria-hidden="true" className="h-4 w-4" />
        <input ref={searchRef} type="text" value={query} onChange={event => setQuery(event.target.value)}
          aria-label={i18nService.t('starpathSettingsSearch')} placeholder={i18nService.t('starpathSettingsSearch')}
          className="settings-field" />
        {query && <button type="button" onClick={clearSearch} className="settings-icon-button settings-search-clear"
          aria-label={i18nService.t('starpathSettingsClearSearch')}><XMarkIcon aria-hidden="true" className="h-4 w-4" /></button>}
      </div>
      <nav aria-label={i18nService.t('settings')} className="settings-nav-list" onKeyDown={handleKeyDown}>
        {groups.map(group => {
          const groupTabs = group.keys.flatMap(key => visibleTabs.filter(tab => tab.key === key));
          if (!groupTabs.length) return null;
          return <div key={group.label} className={`settings-nav-group ${groupTabs.some(tab => tab.key === activeTab) ? 'is-current-group' : ''}`}>
            <p className="settings-nav-group-label">{i18nService.t(group.label)}</p>
            <div className="settings-nav-group-items">{groupTabs.map(renderTab)}</div>
          </div>;
        })}
        {visibleTabs.some(tab => tab.key === 'about') && <div className="settings-nav-about">{visibleTabs.filter(tab => tab.key === 'about').map(renderTab)}</div>}
        {!visibleTabs.length && <p role="status" className="settings-nav-empty">{i18nService.t('starpathSettingsNoResults')}</p>}
      </nav>
    </header>
  );
}
