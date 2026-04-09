import type { CallToolResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types";

export type GenerateMcpResourceErrorParams = {
  uri: string;
  errorText: string;
};

export const generateMcpResourceError = ({ uri, errorText }: GenerateMcpResourceErrorParams): ReadResourceResult => ({
  contents: [
    {
      uri,
      mimeType: "text/plain",
      text: errorText,
    },
  ],
  isError: true,
});

export type BuildMcpResourceResponseParams = {
  uri: string;
  payload: unknown;
};

export const buildMcpResourceResponse = ({ uri, payload }: BuildMcpResourceResponseParams): ReadResourceResult => ({
  contents: [
    {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(payload),
    },
  ],
});

export const buildMcpTextResponse = (text: string): CallToolResult => ({
  content: [{ type: "text", text }],
  isError: false,
});

export const buildMcpErrorResponse = (error: string): CallToolResult => ({
  content: [{ type: "text", text: error }],
  isError: true,
});
