import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

import { i18nService } from '@/services/i18n';

import LegacyPublishingUnavailableDialog from './LegacyPublishingUnavailableDialog';

vi.mock('./PublishingRestrictionDialogShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

test('legacy publishing failures show a neutral message without subscription prompts', () => {
  const previousLanguage = i18nService.getLanguage();
  i18nService.setLanguage('zh', { persist: false });
  try {
    const html = renderToStaticMarkup(
      React.createElement(LegacyPublishingUnavailableDialog, { onClose: vi.fn() }),
    );
    expect(html).toContain('当前客户端未开放此功能');
    expect(html).toContain('已有内容仍可在文件库中查看和管理');
    expect(html).not.toContain('订阅');
    expect(html).not.toContain('购买');
  } finally {
    i18nService.setLanguage(previousLanguage, { persist: false });
  }
});
