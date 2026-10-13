import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import { afterEach, expect, test, vi } from 'vitest';

const script = readFileSync('public/startup.js', 'utf8');
afterEach(() => vi.useRealTimers());

function harness(nativeAppearance?: 'light' | 'dark', savedAppearance?: 'light' | 'dark', systemDark = false) {
  vi.useFakeTimers();
  let shellPresent = true;
  const listeners = new Map<string, () => void>();
  const status = { textContent: '', appendChild: vi.fn() };
  const shell = { setAttribute: vi.fn(), querySelector: () => status };
  const reload = vi.fn();
  const button = { addEventListener: vi.fn() };
  const disconnect = vi.fn();
  let mutation = () => {};
  const root = { dataset: {} as { theme?: string }, classList: { add: vi.fn(), remove: vi.fn() }, style: {} as { backgroundColor?: string; colorScheme?: string } };
  vm.runInNewContext(script, {
    navigator: { language: 'zh-CN' },
    localStorage: { getItem: (key: string) => key === 'lobster-theme-appearance' ? savedAppearance : null },
    window: {
      matchMedia: () => ({ matches: systemDark }), location: { reload },
      electron: { appInfo: { initialAppearance: nativeAppearance } },
      setTimeout, clearTimeout,
      addEventListener: (name: string, fn: () => void) => listeners.set(name, fn),
      removeEventListener: (name: string) => listeners.delete(name),
    },
    document: {
      documentElement: root,
      getElementById: (id: string) => id === 'startup-shell' ? (shellPresent ? shell : null) : {},
      createElement: () => button,
      addEventListener: (_name: string, fn: () => void) => fn(),
    },
    MutationObserver: class {
      constructor(fn: () => void) { mutation = fn; }
      observe() {}
      disconnect = disconnect;
    },
  });
  return { root, status, reload, button, shell, disconnect,
    fail: () => listeners.get('error')?.(),
    mount: () => { shellPresent = false; mutation(); },
  };
}

test('a stalled bootstrap exposes a manual retry without automatic reload', () => {
  const app = harness();
  vi.advanceTimersByTime(30000);
  expect(app.status.textContent).toContain('界面未能启动');
  expect(app.status.appendChild).toHaveBeenCalledTimes(1);
  expect(app.shell.setAttribute).toHaveBeenCalledWith('aria-busy', 'false');
  expect(app.reload).not.toHaveBeenCalled();
  app.button.addEventListener.mock.calls[0][1]();
  expect(app.reload).toHaveBeenCalledTimes(1);
});

test('module failure shows recovery only once', () => {
  const app = harness();
  app.fail();
  app.fail();
  vi.advanceTimersByTime(30000);
  expect(app.status.appendChild).toHaveBeenCalledTimes(1);
});

test('a mounted app cancels startup recovery and leaves runtime errors to React', () => {
  const app = harness();
  app.mount();
  app.fail();
  vi.advanceTimersByTime(30000);
  expect(app.status.appendChild).not.toHaveBeenCalled();
  expect(app.disconnect).toHaveBeenCalled();
});

test('sets dark theme variables before React CSS when the native snapshot is dark', () => {
  const app = harness('dark', 'light');
  expect(app.root.dataset.theme).toBe('classic-dark');
  expect(app.root.classList.add).toHaveBeenCalledWith('dark');
  expect(app.root.style.backgroundColor).toBe('#212121');
  expect(app.root.style.colorScheme).toBe('dark');
});
test('a persisted native light choice overrides stale dark hints and the system', () => {
  const app = harness('light', 'dark', true);
  expect(app.root.dataset.theme).toBe('classic-light');
  expect(app.root.style.backgroundColor).toBe('#FFFFFF');
});
test('ordinary browser previews keep cache/system fallback without a preload snapshot', () => {
  expect(harness(undefined, 'dark').root.dataset.theme).toBe('classic-dark');
  expect(harness(undefined, undefined, true).root.dataset.theme).toBe('classic-dark');
});
