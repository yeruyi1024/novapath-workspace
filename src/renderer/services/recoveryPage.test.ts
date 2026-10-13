import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import { expect, test, vi } from 'vitest';

const script = readFileSync('resources/recovery.js', 'utf8');
function harness(reloadWindow: () => Promise<boolean>) {
  let click = async () => {};
  const status = { textContent: '' };
  const button = { disabled: false, addEventListener: (_event: string, handler: () => Promise<void>) => { click = handler; } };
  vm.runInNewContext(script, {
    localStorage: { getItem: () => 'zh' },
    document: {
      documentElement: {},
      getElementById: (id: string) => id === 'retry' ? button : status,
    },
    window: { electron: { appInfo: { reloadWindow } } },
  });
  return { click: () => click(), status, button };
}

test('the fallback retries the real app through preload instead of reloading itself', async () => {
  const reloadWindow = vi.fn().mockResolvedValue(true);
  const page = harness(reloadWindow);
  await page.click();
  expect(reloadWindow).toHaveBeenCalledTimes(1);
  expect(page.button.disabled).toBe(true);
  expect(page.status.textContent).toBe('');
});

test('failed recovery gives an actionable message and re-enables retry', async () => {
  const page = harness(vi.fn().mockResolvedValue(false));
  await page.click();
  expect(page.button.disabled).toBe(false);
  expect(page.status.textContent).toContain('重新打开星途');
});

test('release files include the independent fallback and its script', () => {
  const config = JSON.parse(readFileSync('electron-builder.json', 'utf8'));
  expect(config.files).toContain('resources/error.html');
  expect(config.files).toContain('resources/recovery.js');
});
