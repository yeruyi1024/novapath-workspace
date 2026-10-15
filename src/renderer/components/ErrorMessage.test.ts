import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';

import { i18nService } from '../services/i18n';
import ErrorMessage from './ErrorMessage';

test('keeps errors readable and supplies named recovery controls', () => {
  const html = renderToStaticMarkup(React.createElement(ErrorMessage, {
    title: '暂时无法登录', message: '请检查网络后重试。', actionLabel: '重试',
    onAction: () => {}, onClose: () => {}, className: 'mt-4',
  }));
  expect(html).toContain('role="alert"');
  expect(html).toContain('aria-label="'+i18nService.t('close')+'"');
  expect(html).toContain('暂时无法登录');
  expect(html).toContain('重试');
  expect(html).toContain('[overflow-wrap:anywhere]');
  expect(html).not.toContain('bg-gradient');
  expect(html).not.toContain('text-white');
});

test('escapes error text and omits unavailable actions', () => {
  const html = renderToStaticMarkup(React.createElement(ErrorMessage, { message: '<script>test</script>' }));
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<button');
});
