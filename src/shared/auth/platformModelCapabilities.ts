import type { ModelThinkingConfig } from '../providers/modelThinking';

/** Explicit company configuration, not an inference from a vendor/model name. */
export const CONFIRMED_PLATFORM_MODEL_CAPABILITIES = [{
  origin: 'http://127.0.0.1:3303',
  modelId: 'deepseek-flash',
  supportsThinking: true,
  // FINAL-S1 A/B observed reasoning_content without requesting an effort.
  // No evidence that this alias accepts any upstream reasoning control field.
  supportsReasoningEffort: false,
  evidence: 'specs/product/evidence/2026-10-20-FINAL-S1/same-request-chain.json',
  verifiedAt: '2026-10-20',
}] as const;

export function getConfirmedPlatformModelCapability(baseUrl: string, modelId: string) {
  let url: URL;
  try { url = new URL(baseUrl); } catch { return undefined; }
  if (url.username || url.password || url.search || url.hash
    || !['', '/', '/v1', '/v1/'].includes(url.pathname)) return undefined;
  return CONFIRMED_PLATFORM_MODEL_CAPABILITIES.find(entry => entry.origin === url.origin && entry.modelId === modelId);
}

/** Only selects the existing runtime's local reasoning gate, never API parameters. */
export function getConfirmedPlatformThinkingConfig(baseUrl: string, modelId: string): ModelThinkingConfig | undefined {
  if (!getConfirmedPlatformModelCapability(baseUrl, modelId)) return undefined;
  return {
    options: [{ level: 'off', openclawLevel: 'off' }, { level: 'high', openclawLevel: 'high' }],
    defaultLevel: 'high',
  };
}

export function applyConfirmedPlatformModelCapabilities<T extends { id: string; supportsThinking?: boolean }>(baseUrl: string, models: T[]): T[] {
  return models.map(model => {
    const confirmed = getConfirmedPlatformModelCapability(baseUrl, model.id);
    // An explicit saved user choice always wins, including false.
    return confirmed && model.supportsThinking === undefined
      ? { ...model, supportsThinking: confirmed.supportsThinking }
      : { ...model };
  });
}
