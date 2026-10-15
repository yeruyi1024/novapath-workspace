import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

import PreviewErrorBoundary from './PreviewErrorBoundary';

vi.mock('../../services/i18n', () => ({ i18nService: { t: (key: string) => key } }));

test('preview failure renders a local fallback without exposing error contents', () => {
  const boundary = new PreviewErrorBoundary({ children: 'file content' });
  boundary.state = PreviewErrorBoundary.getDerivedStateFromError();
  const html = renderToStaticMarkup(React.createElement('section', null, boundary.render()));
  expect(html).toContain('role="alert"');
  expect(html).toContain('previewRenderFailed');
  expect(html).not.toContain('file content');
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    boundary.componentDidCatch(new TypeError('private-path-and-file-content'));
    expect(log).toHaveBeenCalledWith('[PreviewErrorBoundary] render failed:', 'TypeError');
  } finally { log.mockRestore(); }
});

test('a healthy preview is rendered unchanged', () => {
  const content = React.createElement('p', null, 'preview');
  const boundary = new PreviewErrorBoundary({ children: content });
  expect(boundary.render()).toBe(content);
});

test('a new source mode or content version can recover a failed editor without remounting a healthy one', () => {
  const content = React.createElement('p', null, 'preview');
  const boundary = new PreviewErrorBoundary({ children: content, resetKey: '1:false' });
  expect(PreviewErrorBoundary.getDerivedStateFromProps(
    { children: content, resetKey: '1:false' }, boundary.state,
  )).toBeNull();
  boundary.state = { failed: true, resetKey: '1:false' };
  expect(PreviewErrorBoundary.getDerivedStateFromProps(
    { children: content, resetKey: '1:true' }, boundary.state,
  )).toEqual({ failed: false, resetKey: '1:true' });
});
