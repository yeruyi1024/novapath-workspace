export const SettingsTab = { Account: 'account' } as const;

export const SettingsNavGroup = {
  Account: 'settingsGroupAccount',
  Preferences: 'settingsGroupPreferences',
  ModelsAndTools: 'settingsGroupModelsAndTools',
  Connections: 'settingsGroupConnections',
  Maintenance: 'settingsGroupMaintenance',
} as const;

export const settingsNavGroups: { label: string; keys: string[] }[] = [
  { label: SettingsNavGroup.Account, keys: [SettingsTab.Account] },
  { label: SettingsNavGroup.Preferences, keys: ['general', 'appearance', 'shortcuts', 'coworkMemory'] },
  { label: SettingsNavGroup.ModelsAndTools, keys: ['browserWebAccess', 'plugins'] },
  { label: SettingsNavGroup.Connections, keys: ['im'] },
  { label: SettingsNavGroup.Maintenance, keys: ['coworkAgentEngine'] },
];

// Configuration remains implemented; the platform manages model credentials.
export const hiddenSettingsTabs: readonly string[] = ['email', 'model'];
const hiddenTabFallback = 'im';
const defaultTab = 'general';

export function resolveVisibleSettingsTab<T extends string>(tab: T | undefined): T | typeof hiddenTabFallback | typeof defaultTab | typeof SettingsTab.Account {
  if (!tab) return defaultTab;
  if (tab === 'model') return SettingsTab.Account;
  return hiddenSettingsTabs.includes(tab) ? hiddenTabFallback : tab;
}

// Tabs that only display information and have nothing for the shared save bar to apply.
export const settingsTabsWithoutSave: readonly string[] = [SettingsTab.Account, 'about'];
