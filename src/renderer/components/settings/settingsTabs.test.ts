import { describe, expect, test } from 'vitest';

import { hiddenSettingsTabs, resolveVisibleSettingsTab, settingsNavGroups } from './settingsTabs';

describe('settings tabs', () => {
  test('redirects hidden configuration tabs to their visible destinations', () => {
    expect(resolveVisibleSettingsTab('email')).toBe('im');
    expect(resolveVisibleSettingsTab('model')).toBe('account');
    for (const tab of ['account', 'general', 'appearance', 'shortcuts', 'coworkMemory', 'browserWebAccess', 'plugins', 'im', 'coworkAgentEngine', 'about']) {
      expect(resolveVisibleSettingsTab(tab)).toBe(tab);
    }
    expect(resolveVisibleSettingsTab(undefined)).toBe('general');
  });

  test('navigation groups never list hidden tabs', () => {
    const grouped = settingsNavGroups.flatMap(group => group.keys);
    for (const hidden of hiddenSettingsTabs) expect(grouped).not.toContain(hidden);
    expect(new Set(grouped).size).toBe(grouped.length);
  });
});
