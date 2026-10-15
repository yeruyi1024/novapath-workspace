import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';

import { OpenClawEnginePhase } from '../../../shared/openclawEngine/constants';
import type { OpenClawEngineStatus } from '../../types/cowork';
import EngineStartupOverlay from './EngineStartupOverlay';

const snapshot = vi.hoisted(() => ({ status: null as OpenClawEngineStatus | null }));
vi.mock('../../services/cowork', () => ({
  coworkService: { getOpenClawEngineStatusSnapshot: () => snapshot.status },
}));
vi.mock('../../services/i18n', () => ({ i18nService: { t: (key: string) => key } }));

const render = (bootstrapping = false): string => renderToStaticMarkup(
  React.createElement(EngineStartupOverlay, { bootstrapping }),
);

describe('EngineStartupOverlay', () => {
  test('keeps the initial screen visible before any engine status arrives', () => {
    snapshot.status = null;
    expect(render()).toBe('');
    const html = render(true);
    expect(html).toContain('role="status"');
    expect(html).toContain('engineStartingWorkspace');
    expect(html).not.toContain('%');
  });

  test.each([OpenClawEnginePhase.Running, OpenClawEnginePhase.Ready, OpenClawEnginePhase.Error])(
    'does not cover the normal or error interface in phase %s', phase => {
      snapshot.status = { phase, version: '2026.8.1', canRetry: false };
      expect(render()).toBe('');
    },
  );

  test.each([undefined, Number.NaN])('does not invent progress for an unknown value %s', progressPercent => {
    snapshot.status = { phase: OpenClawEnginePhase.Starting, version: '2026.8.1', canRetry: false, progressPercent };
    const html = render();
    expect(html).toContain('engineStartingAssistant');
    expect(html).not.toContain('%');
  });

  test.each([0, 10, 42.4, 100, 120])('does not present estimated startup progress as completion percentage: %s', progressPercent => {
    snapshot.status = { phase: OpenClawEnginePhase.Starting, version: '2026.8.1', canRetry: false, progressPercent };
    const html = render();
    expect(html).toContain('engineStartingAssistant');
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('%');
  });
});
