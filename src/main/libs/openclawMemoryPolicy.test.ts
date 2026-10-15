import { describe, expect, test } from 'vitest';

import { disableRetiredDreaming } from './openclawMemoryPolicy';

describe('retired dreaming policy', () => {
  test('disables runtime defaults on a fresh install without a configured model', () => {
    const config: Record<string, unknown> = { gateway: { mode: 'local' } };
    expect(disableRetiredDreaming(config)).toBe(true);
    expect(config).toEqual({ gateway: { mode: 'local' }, plugins: { entries: {
      'memory-core': { enabled: true, config: { dreaming: { enabled: false } } },
    } } });
    expect(disableRetiredDreaming(config)).toBe(false);
  });

  test('overrides legacy dreaming while preserving memory retention and other plugins', () => {
    const config = { plugins: { allow: ['memory-core', 'browser'], entries: {
      browser: { enabled: true, config: { custom: 'retained' } },
      'memory-core': { enabled: true, config: { retention: { days: 30 }, dreaming: { enabled: true, cron: '0 3 * * *' } } },
    } }, models: { existing: 'retained' } };
    expect(disableRetiredDreaming(config)).toBe(true);
    expect(config.plugins.entries['memory-core'].config).toEqual({ retention: { days: 30 }, dreaming: { enabled: false } });
    expect(config.plugins.entries.browser.config.custom).toBe('retained');
    expect(config.plugins.allow).toEqual(['memory-core', 'browser']);
    expect(config.models).toEqual({ existing: 'retained' });
    expect(disableRetiredDreaming(config)).toBe(false);
  });
});
