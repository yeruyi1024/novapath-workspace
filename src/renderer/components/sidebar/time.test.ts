import { afterEach, expect, test, vi } from 'vitest';

import { i18nService } from '../../services/i18n';
import { formatConversationRelativeTime } from './time';

const now = 1_700_000_000_000;

afterEach(() => {
  vi.restoreAllMocks();
  i18nService.setLanguage('zh', { persist: false });
});

test('formatConversationRelativeTime uses Chinese compact minute hour and day units', () => {
  i18nService.setLanguage('zh', { persist: false });
  vi.spyOn(Date, 'now').mockReturnValue(now);

  expect(formatConversationRelativeTime(now - 30 * 1000).compact).toBe('1 分钟');
  expect(formatConversationRelativeTime(now - 4 * 60000).compact).toBe('4 分钟');
  expect(formatConversationRelativeTime(now - 60 * 60000).compact).toBe('60 分钟');
  expect(formatConversationRelativeTime(now - 61 * 60000).compact).toBe('1 小时');
  expect(formatConversationRelativeTime(now - 10 * 3600000).compact).toBe('10 小时');
  expect(formatConversationRelativeTime(now - 25 * 3600000).compact).toBe('1 天');
});

test('formatConversationRelativeTime uses English compact minute hour and day units', () => {
  i18nService.setLanguage('en', { persist: false });
  vi.spyOn(Date, 'now').mockReturnValue(now);

  expect(formatConversationRelativeTime(now - 30 * 1000).compact).toBe('1m');
  expect(formatConversationRelativeTime(now - 4 * 60000).compact).toBe('4m');
  expect(formatConversationRelativeTime(now - 60 * 60000).compact).toBe('60m');
  expect(formatConversationRelativeTime(now - 61 * 60000).compact).toBe('1h');
  expect(formatConversationRelativeTime(now - 10 * 3600000).compact).toBe('10h');
  expect(formatConversationRelativeTime(now - 25 * 3600000).compact).toBe('1d');
});

test('formatConversationRelativeTime switches to week month and year units', () => {
  i18nService.setLanguage('zh', { persist: false });
  vi.spyOn(Date, 'now').mockReturnValue(now);

  expect(formatConversationRelativeTime(now - 7 * 86400000).compact).toBe('1 周');
  expect(formatConversationRelativeTime(now - 30 * 86400000).compact).toBe('1 月');
  expect(formatConversationRelativeTime(now - 360 * 86400000).compact).toBe('1 年');
});
