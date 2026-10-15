import { ProviderName } from '@shared/providers';
import { expect, test } from 'vitest';

import { getModelSelectionGuide } from './modelSelectionGuide';

test.each([
  ['glm-5.1', ProviderName.Zhipu],
  ['kimi-k3', ProviderName.Moonshot],
  ['deepseek-v4.1-flash', ProviderName.DeepSeek],
])('recognizes the model family behind a company gateway: %s', (id, providerKey) => {
  expect(getModelSelectionGuide({ id, name: id, providerKey: 'company-gateway' })?.providerKey).toBe(providerKey);
});

test('unknown models do not acquire another family guidance or guessed capabilities', () => {
  expect(getModelSelectionGuide({ id: 'other-glm-copy', name: 'Custom model' })).toBeNull();
  const guide = getModelSelectionGuide({ id: 'kimi-k3', name: 'Kimi K3' });
  expect(guide).not.toHaveProperty('supportsImage');
  expect(guide).not.toHaveProperty('costMultiplier');
});

test('recognizes an aliased model using its explicit family provider', () => {
  expect(getModelSelectionGuide({ id: 'my-model', name: 'Internal', providerKey: ProviderName.DeepSeek })?.providerKey)
    .toBe(ProviderName.DeepSeek);
});
