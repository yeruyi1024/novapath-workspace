import { expect, test } from 'vitest';

import { omitUnavailableOptionalChannels } from './openclawOptionalChannels';

test('excluded plugins cannot poison gateway validation; source settings remain intact', () => {
  const source = {
    plugins: { entries: { 'nimsuite-openclaw-nim-channel': { enabled: false },
      'openclaw-netease-bee': { enabled: true }, browser: { enabled: true } },
    allow: ['browser', 'openclaw-netease-bee'], deny: ['openclaw-nim-channel'] },
    channels: { nim: { accounts: { saved: {} } }, 'netease-bee': { enabled: true }, telegram: { enabled: true } },
    bindings: [{ agentId: 'main', match: { channel: 'nim' } }, { agentId: 'main', match: { channel: 'telegram' } }],
    models: { providers: {} },
  };
  const snapshot = JSON.stringify(source);
  const result = omitUnavailableOptionalChannels(source, ['browser']);
  expect(result.plugins).toEqual({ entries: { browser: { enabled: true } }, allow: ['browser'], deny: [] });
  expect(result.channels).toEqual({ telegram: { enabled: true } });
  expect(result.bindings).toEqual([source.bindings[1]]);
  expect(result.models).toBe(source.models);
  expect(JSON.stringify(source)).toBe(snapshot);
});

test('explicitly installed optional plugins keep their channel and routing configuration', () => {
  const config = { plugins: { entries: { 'nimsuite-openclaw-nim-channel': { enabled: true } } },
    channels: { nim: { accounts: { saved: {} } } } };
  expect(omitUnavailableOptionalChannels(config, ['nimsuite-openclaw-nim-channel'])).toEqual(config);
});
