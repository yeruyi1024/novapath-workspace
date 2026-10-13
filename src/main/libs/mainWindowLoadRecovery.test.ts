import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
  createMainWindowLoadRecovery,
  MainWindowLoadErrorCode,
} from './mainWindowLoadRecovery';

const RETRY_DELAY_MS = 3_000;
const SLOW_LOAD_WARNING_MS = 30_000;

function createHarness() {
  let targetAvailable = true;
  const loadPage = vi.fn(() => Promise.resolve());
  const loadErrorPage = vi.fn(() => Promise.resolve());
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };
  const recovery = createMainWindowLoadRecovery({
    isTargetAvailable: () => targetAvailable,
    loadPage,
    loadErrorPage,
    logger,
    retryDelayMs: RETRY_DELAY_MS,
    slowLoadWarningMs: SLOW_LOAD_WARNING_MS,
  });

  return {
    loadPage,
    loadErrorPage,
    logger,
    recovery,
    removeTarget: () => {
      targetAvailable = false;
    },
  };
}

function failMainFrame(
  recovery: ReturnType<typeof createMainWindowLoadRecovery>,
  errorCode = -102,
) {
  recovery.handleDidFailLoad({
    errorCode,
    errorDescription: 'ERR_CONNECTION_REFUSED',
    isMainFrame: true,
    validatedUrl: 'http://localhost:5175/',
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('main-window load recovery', () => {
  test('warns about a slow active load without reloading it', () => {
    const harness = createHarness();

    harness.recovery.start();
    vi.advanceTimersByTime(SLOW_LOAD_WARNING_MS);

    expect(harness.loadPage).toHaveBeenCalledTimes(1);
    expect(harness.logger.warn).toHaveBeenCalledWith(
      `[Main] main window is still loading after ${SLOW_LOAD_WARNING_MS}ms; waiting without reloading`,
    );
  });

  test('ignores an aborted main-frame navigation', () => {
    const harness = createHarness();

    harness.recovery.start();
    failMainFrame(harness.recovery, MainWindowLoadErrorCode.Aborted);
    vi.advanceTimersByTime(RETRY_DELAY_MS);

    expect(harness.loadPage).toHaveBeenCalledTimes(1);
    expect(harness.loadErrorPage).not.toHaveBeenCalled();
    expect(harness.logger.error).not.toHaveBeenCalled();
  });

  test('schedules only one retry for duplicate failure signals', () => {
    const harness = createHarness();

    harness.recovery.start();
    failMainFrame(harness.recovery);
    failMainFrame(harness.recovery);
    vi.advanceTimersByTime(RETRY_DELAY_MS);

    expect(harness.loadPage).toHaveBeenCalledTimes(2);
  });

  test('deduplicates a rejected load promise and its did-fail-load event', async () => {
    const harness = createHarness();
    const connectionError = Object.assign(new Error('ERR_CONNECTION_REFUSED'), {
      code: 'ERR_CONNECTION_REFUSED',
      errno: -102,
    });
    harness.loadPage.mockRejectedValueOnce(connectionError);

    harness.recovery.start();
    await Promise.resolve();
    failMainFrame(harness.recovery);
    vi.advanceTimersByTime(RETRY_DELAY_MS);

    expect(harness.loadPage).toHaveBeenCalledTimes(2);
    expect(harness.logger.error).toHaveBeenCalledTimes(1);
  });

  test('shows the fallback page once after the bounded attempts fail', () => {
    const harness = createHarness();

    harness.recovery.start();
    failMainFrame(harness.recovery);
    vi.advanceTimersByTime(RETRY_DELAY_MS);
    failMainFrame(harness.recovery);
    vi.advanceTimersByTime(RETRY_DELAY_MS);
    failMainFrame(harness.recovery);
    failMainFrame(harness.recovery);

    expect(harness.loadPage).toHaveBeenCalledTimes(3);
    expect(harness.loadErrorPage).toHaveBeenCalledTimes(1);
  });

  test('cancels pending recovery after a successful load', () => {
    const harness = createHarness();

    harness.recovery.start();
    failMainFrame(harness.recovery);
    harness.recovery.handleDidFinishLoad();
    vi.advanceTimersByTime(RETRY_DELAY_MS + SLOW_LOAD_WARNING_MS);

    expect(harness.loadPage).toHaveBeenCalledTimes(1);
    expect(harness.logger.warn).toHaveBeenCalledTimes(1);
  });

  test('stops the slow-load diagnostic after the first paint', () => {
    const harness = createHarness();

    harness.recovery.start();
    harness.recovery.handleFirstPaint();
    vi.advanceTimersByTime(SLOW_LOAD_WARNING_MS);

    expect(harness.logger.warn).not.toHaveBeenCalled();
  });

  test('does not run stale timers after disposal or target destruction', () => {
    const disposedHarness = createHarness();
    disposedHarness.recovery.start();
    failMainFrame(disposedHarness.recovery);
    disposedHarness.recovery.dispose();

    const destroyedHarness = createHarness();
    destroyedHarness.recovery.start();
    failMainFrame(destroyedHarness.recovery);
    destroyedHarness.removeTarget();

    vi.advanceTimersByTime(RETRY_DELAY_MS + SLOW_LOAD_WARNING_MS);

    expect(disposedHarness.loadPage).toHaveBeenCalledTimes(1);
    expect(destroyedHarness.loadPage).toHaveBeenCalledTimes(1);
  });
  test('recovers a failed user refresh after the first successful load', () => {
    const harness = createHarness();
    harness.recovery.start();
    harness.recovery.handleDidFinishLoad();
    harness.recovery.handleNavigationStarted();
    failMainFrame(harness.recovery);
    vi.advanceTimersByTime(RETRY_DELAY_MS);
    expect(harness.loadPage).toHaveBeenCalledTimes(2);
    harness.recovery.handleDidFinishLoad();
    vi.advanceTimersByTime(SLOW_LOAD_WARNING_MS);
    expect(harness.loadErrorPage).not.toHaveBeenCalled();
  });

  test('does not reload a healthy user refresh', () => {
    const harness = createHarness();
    harness.recovery.start();
    harness.recovery.handleDidFinishLoad();
    harness.recovery.handleNavigationStarted();
    harness.recovery.handleDidFinishLoad();
    vi.advanceTimersByTime(SLOW_LOAD_WARNING_MS);
    expect(harness.loadPage).toHaveBeenCalledTimes(1);
  });

  test('a failed fallback can be retried against the original page', () => {
    const harness = createHarness();
    harness.recovery.start();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      failMainFrame(harness.recovery);
      vi.advanceTimersByTime(RETRY_DELAY_MS);
    }
    expect(harness.loadErrorPage).toHaveBeenCalledTimes(1);
    harness.recovery.handleDidFinishLoad(); // This is the fallback document.
    harness.recovery.retry();
    expect(harness.loadPage).toHaveBeenCalledTimes(4);
    harness.recovery.handleDidFinishLoad();
    vi.advanceTimersByTime(RETRY_DELAY_MS);
    expect(harness.loadErrorPage).toHaveBeenCalledTimes(1);
  });

  test('rapid crashes remain bounded even when navigation succeeds between them', () => {
    const harness = createHarness();
    harness.recovery.start();
    for (let crash = 0; crash < 3; crash += 1) {
      harness.recovery.handleDidFinishLoad();
      harness.recovery.handleRendererGone('crashed');
      harness.recovery.handleRendererGone('crashed'); // duplicate Electron signal
      vi.advanceTimersByTime(RETRY_DELAY_MS);
    }
    expect(harness.loadErrorPage).toHaveBeenCalledTimes(1);
    expect(harness.loadPage).toHaveBeenCalledTimes(3);
  });

  test('normal renderer shutdown does not trigger recovery', () => {
    const harness = createHarness();
    harness.recovery.start();
    harness.recovery.handleDidFinishLoad();
    harness.recovery.handleRendererGone('clean-exit');
    vi.advanceTimersByTime(RETRY_DELAY_MS);
    expect(harness.loadPage).toHaveBeenCalledTimes(1);
  });

  test('a stable page restores its crash recovery budget', () => {
    const harness = createHarness();
    harness.recovery.start();
    for (let crash = 0; crash < 4; crash += 1) {
      harness.recovery.handleDidFinishLoad();
      vi.advanceTimersByTime(30000);
      harness.recovery.handleRendererGone('crashed');
      vi.advanceTimersByTime(RETRY_DELAY_MS);
    }
    expect(harness.loadErrorPage).not.toHaveBeenCalled();
    expect(harness.loadPage).toHaveBeenCalledTimes(5);
  });

  test('an aborted old navigation cannot suppress the active navigation failure', () => {
    const harness = createHarness();
    harness.recovery.start();
    failMainFrame(harness.recovery, MainWindowLoadErrorCode.Aborted);
    failMainFrame(harness.recovery);
    vi.advanceTimersByTime(RETRY_DELAY_MS);
    expect(harness.loadPage).toHaveBeenCalledTimes(2);
  });

  test('a navigation that never finishes ends in manual recovery, not a reload loop', () => {
    const harness = createHarness();
    harness.recovery.start();
    vi.advanceTimersByTime(90000);
    expect(harness.loadPage).toHaveBeenCalledTimes(1);
    expect(harness.loadErrorPage).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(180000);
    expect(harness.loadErrorPage).toHaveBeenCalledTimes(1);
  });

  test('a stale load promise cannot affect a new manual retry', async () => {
    const harness = createHarness();
    let rejectOld: (error: Error) => void = () => {};
    harness.loadPage.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject; }));
    harness.recovery.start();
    harness.recovery.retry();
    rejectOld(new Error('old navigation'));
    await Promise.resolve();
    vi.advanceTimersByTime(RETRY_DELAY_MS);
    expect(harness.loadPage).toHaveBeenCalledTimes(2);
    expect(harness.logger.error).not.toHaveBeenCalled();
  });

});
