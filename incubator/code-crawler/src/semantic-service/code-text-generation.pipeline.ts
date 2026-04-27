import { getErrorMessage, isNullish } from "@lichens-innovation/ts-common";
import { getCodeCrawlerRagTextModel } from "../utils/env.utils";
import { applyTransformersFilesystemEnv } from "../utils/ml/transformers-fs-env.utils";
import type {
  TextGenChatMessage,
  TextGenChatOutputItem,
  TextGenOutputItem,
} from "./code-text-generation.pipeline.types";
import type { QueryMatchSummary } from "./types/search.types";

export type {
  TextGenChatGenerator,
  TextGenChatMessage,
  TextGenChatOutputItem,
} from "./code-text-generation.pipeline.types";

export const getFirstTextGenChatOutputItem = (
  output: TextGenChatOutputItem[] | TextGenChatOutputItem[][]
): TextGenChatOutputItem | null => {
  const firstBatch = Array.isArray(output[0])
    ? (output[0] as TextGenChatOutputItem[])
    : (output as TextGenChatOutputItem[]);

  return firstBatch[0] ?? null;
};

export const getLastAssistantStringContent = (messages: TextGenChatMessage[]): string | null => {
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  if (!lastAssistant || typeof lastAssistant.content !== "string") {
    return null;
  }

  return lastAssistant.content;
};

interface TextGenerationCallOptions {
  max_new_tokens?: number;
  return_full_text?: boolean;
}

type TextGenerator = (
  prompt: string,
  options?: TextGenerationCallOptions
) => Promise<TextGenOutputItem[] | TextGenOutputItem[][]>;

const loadTextGenerationPipeline = async (): Promise<TextGenerator> => {
  const { env, pipeline } = await import("@huggingface/transformers");
  applyTransformersFilesystemEnv(env);

  const model = getCodeCrawlerRagTextModel();
  /** Default fp32 `model.onnx` + external data hits ORT shape-inference errors on some graphs; `q8` uses bundled `model_quantized.onnx`. */
  const options = { dtype: "q8" as const };
  console.info(
    `[loadTextGenerationPipeline] Loading model "${model}" (dtype=${options.dtype}, local: "${env.localModelPath}"; first run may download assets)…`
  );
  const generator = (await pipeline("text-generation", model, options)) as TextGenerator;
  console.info(`[loadTextGenerationPipeline] Model ready: "${model}"`);
  return generator;
};

let pipelinePromise: Promise<TextGenerator> | null = null;

export const getTextGenerationPipeline = (): Promise<TextGenerator> => {
  if (isNullish(pipelinePromise)) {
    pipelinePromise = loadTextGenerationPipeline();
  }
  return pipelinePromise;
};

export const buildRagContextFromMatches = (matches: QueryMatchSummary[]): string =>
  matches.map((r, index) => `### Code Snippet ${index + 1}:\n\`\`\`\n${r.documentPreview}\n\`\`\``).join("\n\n");

interface BuildRagPromptArgs {
  context: string;
  question: string;
}

const buildRagPrompt = ({ context, question }: BuildRagPromptArgs): string =>
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
 *
 * TODO-001: generateRagAnswerFromMatches should use a streaming API to return the answer progressively.
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
