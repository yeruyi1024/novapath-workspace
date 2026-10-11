const OPTIONAL_CHANNELS = [
  { pluginIds: ['moltbot-popo'], channelIds: ['moltbot-popo'] },
  { pluginIds: ['openclaw-nim-channel', 'nimsuite-openclaw-nim-channel'], channelIds: ['nim'] },
  { pluginIds: ['openclaw-netease-bee'], channelIds: ['netease-bee'] },
] as const;

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Remove unavailable build-only channels from generated config, never from app storage. */
export function omitUnavailableOptionalChannels(
  config: Record<string, unknown>, availablePluginIds: readonly string[],
): Record<string, unknown> {
  const missing = OPTIONAL_CHANNELS.filter(channel =>
    !channel.pluginIds.some(id => availablePluginIds.includes(id)));
  if (!missing.length) return config;
  const pluginIds: readonly string[] = missing.flatMap(channel => [...channel.pluginIds]);
  const channelIds: readonly string[] = missing.flatMap(channel => [...channel.channelIds]);
  const result = { ...config };
  if (config.plugins) {
    const plugins = { ...asRecord(config.plugins) };
    if (plugins.entries) plugins.entries = Object.fromEntries(Object.entries(asRecord(plugins.entries))
      .filter(([id]) => !pluginIds.includes(id)));
    for (const key of ['allow', 'deny']) {
      if (Array.isArray(plugins[key])) plugins[key] = (plugins[key] as unknown[])
        .filter(id => typeof id !== 'string' || !pluginIds.includes(id));
    }
    result.plugins = plugins;
  }
  if (config.channels) result.channels = Object.fromEntries(Object.entries(asRecord(config.channels))
    .filter(([id]) => !channelIds.includes(id)));
  if (Array.isArray(config.bindings)) result.bindings = config.bindings.filter(binding =>
    !channelIds.includes(String(asRecord(asRecord(binding).match).channel ?? '')));
  return result;
}
