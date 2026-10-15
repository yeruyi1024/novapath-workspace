/**
 * MCP management tabs.
 *
 * Custom servers are not a separate place: a hand-configured server is
 * installed just like one from the marketplace, so it lives in Installed and
 * "add" is a toolbar action rather than a tab.
 */
export const McpTab = {
  Installed: 'installed',
  Marketplace: 'marketplace',
} as const;
export type McpTab = typeof McpTab[keyof typeof McpTab];

/** Start with configured tools; optional marketplace integrations stay one tab away. */
export const MCP_TAB_ORDER: readonly McpTab[] = [McpTab.Installed, McpTab.Marketplace];

export const MCP_TAB_LABEL_KEYS: Record<McpTab, string> = {
  [McpTab.Installed]: 'mcpInstalled',
  [McpTab.Marketplace]: 'mcpMarketplace',
};
