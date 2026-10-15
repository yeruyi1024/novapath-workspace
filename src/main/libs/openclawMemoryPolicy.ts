/** Apply at both config sync and bootstrap, including installs without a model. */
export const OPENCLAW_MEMORY_CORE_PLUGIN_ID = 'memory-core';
const asRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

export function disableRetiredDreaming(config: Record<string, unknown>): boolean {
  const plugins = asRecord(config.plugins);
  const entries = asRecord(plugins.entries);
  const memory = asRecord(entries[OPENCLAW_MEMORY_CORE_PLUGIN_ID]);
  const memoryConfig = asRecord(memory.config);
  const dreaming = asRecord(memoryConfig.dreaming);
  if (memory.enabled === true && dreaming.enabled === false && Object.keys(dreaming).length === 1) return false;
  config.plugins = {
    ...plugins,
    entries: {
      ...entries,
      [OPENCLAW_MEMORY_CORE_PLUGIN_ID]: {
        ...memory,
        enabled: true,
        config: { ...memoryConfig, dreaming: { enabled: false } },
      },
    },
  };
  return true;
}
