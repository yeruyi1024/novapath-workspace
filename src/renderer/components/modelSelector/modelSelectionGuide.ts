import { ProviderName } from '@shared/providers';

import type { Model } from '../../store/slices/modelSlice';

/** Presentation guidance only; capabilities and billing still come from the platform. */
export function getModelSelectionGuide(model: Pick<Model, 'id' | 'name' | 'providerKey'>) {
  const identity = `${model.id} ${model.name}`;
  if (/(?:^|[/\s])glm(?:[-_.\s\d]|$)/i.test(identity) || model.providerKey === ProviderName.Zhipu) {
    return { providerKey: ProviderName.Zhipu, badgeKey: 'modelGuideGlmBadge', descriptionKey: 'modelGuideGlmDescription' };
  }
  if (/(?:^|[/\s])kimi(?:[-_.\s\d]|$)/i.test(identity) || model.providerKey === ProviderName.Moonshot) {
    return { providerKey: ProviderName.Moonshot, badgeKey: 'modelGuideKimiBadge', descriptionKey: 'modelGuideKimiDescription' };
  }
  if (/(?:^|[/\s])deepseek(?:[-_.\s\d]|$)/i.test(identity) || model.providerKey === ProviderName.DeepSeek) {
    return { providerKey: ProviderName.DeepSeek, badgeKey: 'modelGuideDeepseekBadge', descriptionKey: 'modelGuideDeepseekDescription' };
  }
  return null;
}
