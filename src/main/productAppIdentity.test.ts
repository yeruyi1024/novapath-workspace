import { EventEmitter } from 'node:events';

import { expect, test, vi } from 'vitest';

import { PRODUCT } from '../shared/product';
import { configureProductAppIdentity } from './productAppIdentity';

test.each(['darwin', 'linux'] as const)('preserves the encryption identity through a public rename on %s', platform => {
  const events = new EventEmitter();
  const setName = vi.fn();
  const originalName = PRODUCT.name;
  try {
    PRODUCT.name = 'Another public name';
    configureProductAppIdentity({ setName, once: events.once.bind(events) }, platform);
    expect(setName).toHaveBeenCalledExactlyOnceWith('星途 StarPath');
    events.emit('ready');
    expect(setName.mock.calls).toEqual([['星途 StarPath'], ['Another public name']]);
    events.emit('ready');
    expect(setName).toHaveBeenCalledTimes(2);
  } finally {
    PRODUCT.name = originalName;
  }
});

test('Windows retains the public name without a keychain-name lifecycle', () => {
  const setName = vi.fn(), once = vi.fn();
  configureProductAppIdentity({ setName, once }, 'win32');
  expect(setName).toHaveBeenCalledExactlyOnceWith(PRODUCT.name);
  expect(once).not.toHaveBeenCalled();
});
