import { isNullish } from "@lichens-innovation/ts-common";
import { getTextGenerationPipeline, TextGenOutputItem } from "../code-rag-text.pipeline";

interface BuildExpansionPromptArgs {
  queryText: string;
  count: number;
}

const buildExpansionPrompt = ({ queryText, count }: BuildExpansionPromptArgs): string =>
  `Generate ${count} different variations of the following query that would help retrieve more relevant documents.

Original query: ${queryText}

Return ${count} alternative queries that rephrase or approach the same question form different angles.
Output only the ${count} alternative queries, one per line, without numbering or explanation.
`;

interface ParseVariantLinesArgs {
  raw: string;
  count: number;
}

const parseVariantLines = ({ raw, count }: ParseVariantLinesArgs): string[] =>
  raw
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/^[\d]+[.)]\s*/, "")
        .replace(/^[-*]\s*/, "")
    )
    .filter((line) => line.length > 0)
    .slice(0, count);

export interface GenerateQueryExpansionVariantsArgs {
  queryText: string;
  count: number;
}

export const generateQueryExpansionVariants = async ({
  queryText,
  count,
}: GenerateQueryExpansionVariantsArgs): Promise<string[]> => {
  const generator = await getTextGenerationPipeline();
  const prompt = buildExpansionPrompt({ queryText, count });
  const output = await generator(prompt, { max_new_tokens: 128, return_full_text: false });
  const firstBatch: TextGenOutputItem[] = Array.isArray(output[0]) ? output[0] : (output as TextGenOutputItem[]);
  const first = firstBatch[0];
  if (isNullish(first) || typeof first.generated_text !== "string") {
    return [];
  }
  return parseVariantLines({ raw: first.generated_text, count });
};
