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

const parseJsonVariants = ({ raw, count }: ParseVariantArgs): string[] => {
  if (isBlank(raw)) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed.slice(0, count);
    }
  } catch (err: unknown) {
    const msg = getErrorMessage(err);
    console.warn(`[parseJsonVariants] failed to parse JSON: ${msg}`, err);
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
