import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';

import PlatformLoginFailureDialog from './PlatformLoginFailureDialog';

test('presents one named failure dialog with one confirmation action', () => {
  const html = renderToStaticMarkup(React.createElement(PlatformLoginFailureDialog, {
    message: '请检查账号和密码后重试。', onClose: () => {},
  }));
  expect((html.match(/role="alertdialog"/g) ?? []).length).toBe(1);
  expect(html).toContain('aria-modal="true"');
  expect(html).toContain('aria-describedby=');
  expect((html.match(/<button/g) ?? []).length).toBe(1);
  expect(html).toContain('请检查账号和密码后重试。');
});
