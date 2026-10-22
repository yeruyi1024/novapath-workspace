import { describe, expect, test } from 'vitest';

import { applyConfirmedPlatformModelCapabilities, getConfirmedPlatformModelCapability, getConfirmedPlatformThinkingConfig } from './platformModelCapabilities';

describe('explicit platform model capability scope', () => {
  test('uses the observed exact alias without claiming a vendor version or request controls', () => {
    expect(getConfirmedPlatformModelCapability('http://127.0.0.1:3303/v1', 'deepseek-flash')).toMatchObject({
      modelId: 'deepseek-flash', supportsThinking: true, supportsReasoningEffort: false,
      evidence: expect.stringContaining('FINAL-S1/same-request-chain.json'),
    });
    expect(getConfirmedPlatformThinkingConfig('http://127.0.0.1:3303/v1', 'deepseek-flash')).toEqual({
      options: [{ level: 'off', openclawLevel: 'off' }, { level: 'high', openclawLevel: 'high' }], defaultLevel: 'high',
    });
  });

  test.each([
    ['http://127.0.0.1:3313/v1', 'deepseek-flash'],
    ['https://gateway.example/v1', 'deepseek-flash'],
    ['http://localhost:3303/v1', 'deepseek-flash'],
    ['http://127.0.0.1:3303/other/v1', 'deepseek-flash'],
    ['http://user@127.0.0.1:3303/v1', 'deepseek-flash'],
    ['http://127.0.0.1:3303/v1?key=invalid', 'deepseek-flash'],
    ['http://127.0.0.1:3303/v1', 'deepseek-v4-flash'],
    ['http://127.0.0.1:3303/v1', 'my-deepseek-flash'],
    ['http://127.0.0.1:3303/v1', 'DeepSeek-Flash'],
    ['invalid', 'deepseek-flash'],
  ])('does not infer support for %s / %s', (baseUrl, modelId) => {
    expect(getConfirmedPlatformModelCapability(baseUrl, modelId)).toBeUndefined();
    expect(getConfirmedPlatformThinkingConfig(baseUrl, modelId)).toBeUndefined();
  });

  test('retains explicit manual flags and unrelated model metadata without mutation', () => {
    const models = [
      { id: 'deepseek-flash', supportsThinking: false, name: 'My alias', customParams: { temperature: 0.2 } },
      { id: 'other-deepseek', name: 'Unknown' },
    ];
    expect(applyConfirmedPlatformModelCapabilities('http://127.0.0.1:3303/v1', models)).toEqual(models);
    expect(models[1]).not.toHaveProperty('supportsThinking');
    expect(applyConfirmedPlatformModelCapabilities('http://127.0.0.1:3303/v1', [{ id: 'deepseek-flash' }]))
      .toEqual([{ id: 'deepseek-flash', supportsThinking: true }]);
  });
});
