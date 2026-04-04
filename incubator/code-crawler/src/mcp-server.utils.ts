import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const buildMcpTextResponse = (text: string): CallToolResult => ({
  content: [{ type: "text", text }],
  isError: false,
});

export const buildMcpErrorResponse = (error: string): CallToolResult => ({
  content: [{ type: "text", text: error }],
  isError: true,
});
