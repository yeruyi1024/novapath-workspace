import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';

import { i18nService } from '../../../services/i18n';
import LocalVoiceInputActions from './LocalVoiceInputActions';

test('recording exposes an explicit stop and transcribe action alongside cancellation', () => {
  const html = renderToStaticMarkup(React.createElement(LocalVoiceInputActions, {
    phase: 'recording', hasError: false, onCancel: () => {}, onFinish: () => {},
  }));
  expect(html).toContain(i18nService.t('gatewayVoiceStop'));
  expect(html).toContain(i18nService.t('cancel'));
  expect((html.match(/type="button"/g) ?? []).length).toBe(2);
});

test('recognition retains cancellation without offering another transcription request', () => {
  const html = renderToStaticMarkup(React.createElement(LocalVoiceInputActions, {
    phase: 'recognizing', hasError: false, onCancel: () => {}, onFinish: () => {},
  }));
  expect(html).toContain(i18nService.t('cancel'));
  expect(html).not.toContain(i18nService.t('gatewayVoiceStop'));
});
