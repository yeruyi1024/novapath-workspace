import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Provider } from 'react-redux';
import { expect, test, vi } from 'vitest';

import { type Artifact, ArtifactTypeValue } from '@/types/artifact';

import ArtifactPreviewCard from './ArtifactPreviewCard';

vi.mock('@/services/i18n', () => ({ i18nService: { t: (key: string) => key } }));
vi.mock('./ArtifactFileShareController', () => ({
  useOptionalArtifactFileShare: () => ({ openShare: vi.fn() }),
}));

test('a shareable document keeps Open with but does not offer file sharing', () => {
  const artifact: Artifact = {
    id: 'document-1',
    messageId: 'message-1',
    sessionId: 'session-1',
    type: ArtifactTypeValue.Document,
    title: 'example.docx',
    fileName: 'example.docx',
    filePath: '/preview/example.docx',
    content: '',
    createdAt: 1,
  };
  const store = configureStore({ reducer: () => ({}) });

  const html = renderToStaticMarkup(
    React.createElement(
      Provider,
      { store, children: React.createElement(ArtifactPreviewCard, { artifact }) },
    ),
  );

  expect(html).toContain('aria-label="artifactPreviewCardOpenWith"');
  expect(html).not.toContain('aria-label="htmlShare"');
});

test('a local service keeps its preview action without the old deployment entry', () => {
  const artifact: Artifact = {
    id: 'service-1',
    messageId: 'message-1',
    sessionId: 'session-1',
    type: ArtifactTypeValue.LocalService,
    title: 'Local preview',
    content: 'http://localhost:5175',
    url: 'http://localhost:5175',
    createdAt: 1,
  };
  const store = configureStore({ reducer: () => ({}) });

  const html = renderToStaticMarkup(
    React.createElement(Provider, {
      store,
      children: React.createElement(ArtifactPreviewCard, {
        artifact,
        onDeployLocalService: vi.fn(),
      }),
    }),
  );

  expect(html).toContain('aria-label="artifactPreviewCardOpenWith"');
  expect(html).not.toContain('aria-label="nodeDeploymentProgressDeploy"');
});
