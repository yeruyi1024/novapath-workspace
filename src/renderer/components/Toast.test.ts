import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import Toast from './Toast';

describe('Toast', () => {
  test('renders a successful sign-in as non-blocking status feedback', () => {
    const html = renderToStaticMarkup(React.createElement(Toast, {
      message: '登录成功', closeLabel: '关闭', tone: 'success',
    }));
    expect(html).toContain('登录成功');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('fixed inset-0');
  });
  test('announces errors with a distinct icon and does not add a blocking overlay', () => {
    const html = renderToStaticMarkup(React.createElement(Toast, {
      message: '文件不存在', closeLabel: '关闭', tone: 'error', onClose: () => {},
    }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain('bg-destructive/10');
    expect(html).not.toContain('fixed inset-0');
  });
  test('renders non-blocking feedback without a modal backdrop', () => {
    const html = renderToStaticMarkup(React.createElement(Toast, {
      message: '消息已复制',
      closeLabel: '关闭',
      onClose: () => {},
    }));

    expect(html).toContain('pointer-events-none');
    expect(html).toContain('left-1/2');
    expect(html).toContain('top-1/2');
    expect(html).toContain('-translate-x-1/2');
    expect(html).toContain('-translate-y-1/2');
    expect(html).not.toContain('bottom-5');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-label="关闭"');
    expect(html).not.toContain('modal-backdrop');
    expect(html).not.toContain('fixed inset-0');
  });
});
