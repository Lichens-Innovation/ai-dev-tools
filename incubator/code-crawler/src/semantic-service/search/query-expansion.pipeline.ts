import { getErrorMessage, isBlank, isNullish } from "@lichens-innovation/ts-common";
import {
  getFirstTextGenChatOutputItem,
  getLastAssistantStringContent,
  getTextGenerationPipeline,
} from "../code-text-generation.pipeline";
import type {
  TextGenChatGenerator,
  TextGenChatMessage,
  TextGenChatOutputItem,
} from "../code-text-generation.pipeline.types";

interface BuildExpansionMessagesArgs {
  queryText: string;
  count: number;
}

const buildExpansionMessages = ({ queryText, count }: BuildExpansionMessagesArgs): TextGenChatMessage[] => [
  {
    role: "system",
    content:
      "You are a search query expansion assistant. Respond ONLY with a valid JSON array of strings. No explanation, no markdown, no surrounding text.",
  },
  {
    role: "user",
    content: `Generate ${count} alternative search queries for: "${queryText}"\nEach variant should rephrase or approach the same question from a different angle.\n\nRespond with a JSON array only, e.g.: ["variant 1", "variant 2"]`,
  },
];

interface ParseVariantArgs {
  raw?: string | null;
  count: number;
}

const isMarkdownFenceLine = (line: string): boolean => line.trimStart().startsWith("```");

/** Drops the first and last line when they start with ``` (language tag after backticks is ignored). */
const stripMarkdownFenceLines = (text: string): string => {
  const lines = text.trim().split(/\r?\n/);
  let start = 0;
  let end = lines.length;

  if (end > 0 && isMarkdownFenceLine(lines[0])) {
    start = 1;
  }

  if (end > start && isMarkdownFenceLine(lines[end - 1])) {
    end = lines.length - 1;
  }

  return lines.slice(start, end).join("\n").trim();
};

/** Yields parse candidates (fence-stripped text, then first `[`…last `]` slice if different). */
const jsonArrayStringCandidates = (text: string): string[] => {
  const trimmed = stripMarkdownFenceLines(text);

  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  const bracketSlice = start >= 0 && end > start ? trimmed.slice(start, end + 1) : null;

  if (isNullish(bracketSlice) || bracketSlice === trimmed) {
    return [trimmed];
  }

  return [trimmed, bracketSlice];
};

const parseJsonVariants = ({ raw, count }: ParseVariantArgs): string[] => {
  if (isBlank(raw)) {
    return [];
  }

  let lastErr: unknown;
  for (const candidate of jsonArrayStringCandidates(raw)) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
        return parsed.slice(0, count);
      }
    } catch (error: unknown) {
      lastErr = error;
    }
  }

  if (!isNullish(lastErr)) {
    const errorMessage = getErrorMessage(lastErr);
    console.warn(`[parseJsonVariants] failed to parse JSON: ${errorMessage}`, lastErr);
  }

  return [];
};

export interface GenerateQueryExpansionVariantsArgs {
  queryText: string;
  count: number;
}

export const generateQueryExpansionVariants = async ({
  queryText,
  count,
}: GenerateQueryExpansionVariantsArgs): Promise<string[]> => {
  const generator = await getTextGenerationPipeline();
  const chatGenerator = generator as unknown as TextGenChatGenerator;
  const messages: TextGenChatMessage[] = buildExpansionMessages({ queryText, count });
  const output = await chatGenerator(messages, {
    max_new_tokens: Math.max(512, count * 128),
  });

  const first: TextGenChatOutputItem | null = getFirstTextGenChatOutputItem(output);

  if (isNullish(first) || !Array.isArray(first.generated_text)) {
    return [];
  }

  const raw = getLastAssistantStringContent(first.generated_text);

  return parseJsonVariants({ raw, count });
};
