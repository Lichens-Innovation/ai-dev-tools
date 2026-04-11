import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { StatusCodes } from "http-status-codes";

export type CallToolResultToRestOutcome = {
  httpStatus: number;
  body: Record<string, unknown> | unknown[];
};

const extractText = (result: CallToolResult): string => {
  const block = result.content[0];
  if (block?.type === "text" && typeof block.text === "string") {
    return block.text;
  }
  return "";
};

const isJsonObjectOrArray = (value: unknown): value is Record<string, unknown> | unknown[] =>
  value !== null && (Array.isArray(value) || typeof value === "object");

export const callToolResultToRestBody = ({ result }: { result: CallToolResult }): CallToolResultToRestOutcome => {
  if (result.isError) {
    return {
      httpStatus: StatusCodes.BAD_REQUEST,
      body: { error: extractText(result) || "Request failed" },
    };
  }

  const text = extractText(result);
  if (text === "") {
    return {
      httpStatus: StatusCodes.OK,
      body: { message: "OK" },
    };
  }

  try {
    const parsed: unknown = JSON.parse(text);
    if (isJsonObjectOrArray(parsed)) {
      return { httpStatus: StatusCodes.OK, body: parsed };
    }
  } catch {
    // fall through to plain message
  }

  return { httpStatus: StatusCodes.OK, body: { message: text } };
};
