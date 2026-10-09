export const DEFAULT_MCP_URL = "https://mcp.rumoro.dev/mcp";
export type McpClient = "claude" | "cursor" | "vscode" | "generic";

/** A client's configuration for the Rumoro MCP server with this key. */
export function mcpConfig(kind: McpClient, url: string, apiKey: string) {
  const auth = `Bearer ${apiKey}`;
  switch (kind) {
    case "claude":
      return `claude mcp add --transport http rumoro ${url} --header "Authorization: ${auth}"`;
    case "vscode":
      return JSON.stringify({ servers: { rumoro: { type: "http", url, headers: { Authorization: auth } } } }, null, 2);
    case "cursor":
      return JSON.stringify({ mcpServers: { rumoro: { url, headers: { Authorization: auth } } } }, null, 2);
    case "generic":
      return JSON.stringify({ mcpServers: { rumoro: { type: "http", url, headers: { Authorization: auth } } } }, null, 2);
  }
}
