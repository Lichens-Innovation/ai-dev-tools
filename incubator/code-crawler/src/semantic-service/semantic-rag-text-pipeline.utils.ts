import { getErrorMessage, isNullish } from "@lichens-innovation/ts-common";
import { getCodeCrawlerRagTextModel, getCodeCrawlerTransformersFsEnvValues } from "../utils/env.utils";
import type { QueryMatchSummary } from "./semantic-search.types";

type TextGenOutputItem = { generated_text: string };

type TextGenerator = (
  prompt: string,
  options?: { max_new_tokens?: number; return_full_text?: boolean }
) => Promise<TextGenOutputItem[] | TextGenOutputItem[][]>;

const loadTextGenerationPipeline = async (): Promise<TextGenerator> => {
  const { env, pipeline } = await import("@huggingface/transformers");
  const { localModelPath, cacheDir } = getCodeCrawlerTransformersFsEnvValues();
  env.localModelPath = localModelPath;
  env.cacheDir = cacheDir;

  const model = getCodeCrawlerRagTextModel();
  /** Default fp32 `model.onnx` + external data hits ORT shape-inference errors on some graphs; `q8` uses bundled `model_quantized.onnx`. */
  const options = { dtype: "q8" as const };
  console.info(
    `[semantic-rag-text] Loading model "${model}" (dtype=${options.dtype}, local: "${env.localModelPath}"; first run may download assets)…`
  );
  const generator = (await pipeline("text-generation", model, options)) as TextGenerator;
  console.info(`[semantic-rag-text] Model ready: "${model}"`);
  return generator;
};

let pipelinePromise: Promise<TextGenerator> | null = null;

const getTextGenerationPipeline = (): Promise<TextGenerator> => {
  if (isNullish(pipelinePromise)) {
    pipelinePromise = loadTextGenerationPipeline();
  }
  return pipelinePromise;
};

export const buildRagContextFromMatches = (matches: QueryMatchSummary[]): string =>
  matches.map((r, index) => `### Code Snippet ${index + 1}:\n\`\`\`\n${r.documentPreview}\n\`\`\``).join("\n\n");

const buildRagPrompt = ({ context, question }: { context: string; question: string }): string =>
  `You are a code assistant. Answer using only the context below.

Context:
${context}

Question: ${question}
Answer:`;

export interface GenerateRagAnswerOutcome {
  ragResponse: string;
  errorMessage?: string;
}

export interface GenerateRagAnswerArgs {
  matches: QueryMatchSummary[];
  question: string;
}

/**
 * Runs causal LM generation over consolidated semantic hits. Call only when `matches` is non-empty
 * so the text pipeline is not loaded for empty search results.
 */
export const generateRagAnswerFromMatches = async ({
  matches,
  question,
}: GenerateRagAnswerArgs): Promise<GenerateRagAnswerOutcome> => {
  if (matches.length === 0) {
    return { ragResponse: "", errorMessage: "generateRagAnswerFromMatches called with no matches" };
  }

  const context = buildRagContextFromMatches(matches);
  const prompt = buildRagPrompt({ context, question });

  try {
    const generator = await getTextGenerationPipeline();
    const output = await generator(prompt, { max_new_tokens: 512, return_full_text: false });
    const firstBatch: TextGenOutputItem[] = Array.isArray(output[0]) ? output[0] : (output as TextGenOutputItem[]);
    const first = firstBatch[0];
    if (isNullish(first) || typeof first.generated_text !== "string") {
      return { ragResponse: "", errorMessage: "Text generation returned an empty or unexpected shape" };
    }
    return { ragResponse: first.generated_text.trim() };
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error(`[generateRagAnswerFromMatches]: ${message}`, e);
    return { ragResponse: "", errorMessage: message };
  }
};
