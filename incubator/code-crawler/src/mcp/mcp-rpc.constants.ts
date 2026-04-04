/**
 * JSON-RPC 2.0 reserves -32000..-32099 for implementation-defined server errors.
 * @see https://www.jsonrpc.org/specification#error_object
 */
export const McpRpcCodes = {
  noValidSessionId: -32_000,
} as const;

/** Standard JSON-RPC 2.0 codes used by this HTTP transport. */
export const JsonRpcStandardCodes = {
  internalError: -32_603,
} as const;
