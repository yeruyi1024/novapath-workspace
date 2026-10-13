import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test } from 'vitest';

import WorkspaceLoadingScreen from './WorkspaceLoadingScreen';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});

function renderLoading(platform: string) {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { electron: { platform } } });
  return renderToStaticMarkup(React.createElement(WorkspaceLoadingScreen, { label: 'Checking account' }));
}

test('Windows can still close, minimize or maximize while account/startup loading covers the workspace', () => {
  const html = renderLoading('win32');
  expect(html).toContain('Checking account');
  expect(html).toContain('aria-label="Minimize"');
  expect(html).toContain('aria-label="Maximize"');
  expect(html).toContain('aria-label="Close"');
});

test.each(['darwin', 'linux'])('does not add Windows captions to %s startup', platform => {
  expect(renderLoading(platform)).not.toContain('aria-label="Close"');
});

test('startup can be rendered before a browser window or native bridge is available', () => {
  Reflect.deleteProperty(globalThis, 'window');
  const html = renderToStaticMarkup(React.createElement(WorkspaceLoadingScreen, { label: 'Preparing workspace' }));
  expect(html).toContain('Preparing workspace');
  expect(html).not.toContain('aria-label="Close"');
});
