import { getErrorMessage, isNullish } from "@lichens-innovation/ts-common";
import { NUMERIC_DIVISION_EPSILON } from "../../utils/embeddings.utils";
import {
  getCodeCrawlerRerankerDtype,
  getCodeCrawlerRerankerModel,
  getCodeCrawlerRerankerModelType,
} from "../../utils/env.utils";
import { applyTransformersFilesystemEnv } from "../../utils/ml/transformers-fs-env.utils";
import type { QueryMatchSummary } from "../types/search.types";

/**
 * Hub `config.json` may omit `model_type`; Transformers.js then throws `Unsupported model type: null`.
 * `CODE_CRAWLER_RERANKER_MODEL_TYPE` supplies the slug (must match the chosen reranker architecture).
 */

interface ClassifierScoreItem {
  score?: number;
}

/** Loaded `pipeline('text-classification', …)` — we call `tokenizer` + `model` directly so `text_pair` is honored (the pipeline `_call` does not forward it). */
interface TextClassificationPipelineInstance {
  tokenizer: (text: string | string[], options?: Record<string, unknown>) => unknown;
  model: {
    (inputs: unknown): Promise<{ logits: unknown }>;
    config?: { problem_type?: string; id2label?: Record<number, string> };
  };
}

type TransformersModule = typeof import("@huggingface/transformers");

type RerankerPretrainedConfig = InstanceType<TransformersModule["PretrainedConfig"]>;

interface CreateRerankerPretrainedConfigArgs {
  modelId: string;
  modelType: string;
  autoConfigClass: TransformersModule["AutoConfig"];
  pretrainedConfigClass: TransformersModule["PretrainedConfig"];
}

const omitNormalizedConfigInJson = (key: string, value: unknown): unknown =>
  key === "normalized_config" ? undefined : value;

const importTransformersWithFilesystemEnv = async (): Promise<TransformersModule> => {
  const transformers = await import("@huggingface/transformers");
  applyTransformersFilesystemEnv(transformers.env);
  return transformers;
};

const createRerankerPretrainedConfig = async ({
  modelId,
  modelType,
  autoConfigClass,
  pretrainedConfigClass,
}: CreateRerankerPretrainedConfigArgs): Promise<RerankerPretrainedConfig> => {
  const loadedConfig = await autoConfigClass.from_pretrained(modelId, {});
  const plain = JSON.parse(JSON.stringify(loadedConfig, omitNormalizedConfigInJson)) as Record<string, unknown>;
  plain.model_type = modelType;
  return new pretrainedConfigClass(plain);
};

const loadCrossEncoderPipeline = async (): Promise<TextClassificationPipelineInstance> => {
  const { env, pipeline, AutoConfig, PretrainedConfig } = await importTransformersWithFilesystemEnv();
  const modelId = getCodeCrawlerRerankerModel();
  const dtype = getCodeCrawlerRerankerDtype();
  const modelType = getCodeCrawlerRerankerModelType();

  console.info(
    `[loadCrossEncoderPipeline] Loading model "${modelId}" (dtype=${dtype}, model_type=${modelType}, local: "${env.localModelPath}"; first run may download assets)…`
  );

  const config = await createRerankerPretrainedConfig({
    modelId,
    modelType,
    autoConfigClass: AutoConfig,
    pretrainedConfigClass: PretrainedConfig,
  });

  const reranker = await pipeline("text-classification", modelId, { dtype, config });

  console.info(`[loadCrossEncoderPipeline] Model ready: "${modelId}"`);
  return reranker as TextClassificationPipelineInstance;
};

let crossEncoderPipelinePromise: Promise<TextClassificationPipelineInstance> | null = null;

const getCrossEncoderPipeline = (): Promise<TextClassificationPipelineInstance> => {
  if (isNullish(crossEncoderPipelinePromise)) {
    crossEncoderPipelinePromise = loadCrossEncoderPipeline();
  }

  return crossEncoderPipelinePromise;
};

const readScoreFromUnknown = (value: unknown): number | undefined => {
  if (typeof value !== "object" || isNullish(value)) {
    return undefined;
  }

  const candidate = value as ClassifierScoreItem;
  if (typeof candidate.score !== "number" || !Number.isFinite(candidate.score)) {
    return undefined;
  }

  return candidate.score;
};

const readScoreForSingleInput = (value: unknown): number | undefined => {
  if (!Array.isArray(value)) {
    return readScoreFromUnknown(value);
  }

  for (const item of value) {
    const score = readScoreFromUnknown(item);
    if (!isNullish(score)) {
      return score;
    }
  }

  return undefined;
};

interface ExtractRerankerScoresArgs {
  rawOutput: unknown;
  expectedCount: number;
}

const extractRerankerScores = ({ rawOutput, expectedCount }: ExtractRerankerScoresArgs): number[] => {
  if (expectedCount < 1) {
    return [];
  }

  if (!Array.isArray(rawOutput)) {
    throw new Error("[rerankWithCrossEncoder] unexpected reranker output shape (non-array)");
  }

  const scores = rawOutput.map((entry) => readScoreForSingleInput(entry));
  if (scores.length !== expectedCount) {
    throw new Error(
      `[rerankWithCrossEncoder] reranker score count mismatch: expected ${expectedCount}, got ${scores.length}`
    );
  }

  const missingScoreIndex = scores.findIndex((score) => isNullish(score));
  if (missingScoreIndex !== -1) {
    throw new Error(`[rerankWithCrossEncoder] missing score for item index ${missingScoreIndex}`);
  }

  return scores as number[];
};

/**
 * Per-batch logits row from the reranker (`outputs.logits` iterator).
 * Structurally typed because the loaded pipeline’s logits type is opaque.
 */
interface CrossEncoderLogitsBatch {
  data: Float32Array;
  dims: number[];
  sigmoid(): unknown;
}

interface RunTextClassificationWithTextPairsArgs {
  pipe: TextClassificationPipelineInstance;
  texts: string[];
  textPairs: string[];
  topK: number;
}

/**
 * Batched sequence-classification with query/document pairs. Mirrors
 * `TextClassificationPipeline._call` but passes `text_pair` into the tokenizer.
 */
const runTextClassificationWithTextPairs = async ({
  pipe,
  texts,
  textPairs,
  topK,
}: RunTextClassificationWithTextPairsArgs): Promise<unknown[]> => {
  const { Tensor, topk, softmax } = await import("@huggingface/transformers");
  const modelInputs = pipe.tokenizer(texts, {
    text_pair: textPairs,
    padding: true,
    truncation: true,
  });
  const outputs = await pipe.model(modelInputs);
  const modelConfig = pipe.model.config;
  const problemType = modelConfig?.problem_type;
  const id2label = modelConfig?.id2label;

  const functionToApply =
    problemType === "multi_label_classification"
      ? (batch: CrossEncoderLogitsBatch) => batch.sigmoid()
      : (batch: CrossEncoderLogitsBatch) => new Tensor("float32", softmax(batch.data), batch.dims);

  const toReturn: unknown[] = [];
  const logits = outputs.logits as Iterable<CrossEncoderLogitsBatch>;
  for (const batch of logits) {
    const output = functionToApply(batch);
    const scores = await topk(output as InstanceType<typeof Tensor>, topK);
    const values = scores[0].tolist() as number[];
    const indices = scores[1].tolist() as number[];
    const vals = indices.map((labelIndex, topKPosition) => ({
      label: id2label ? id2label[labelIndex] : `LABEL_${labelIndex}`,
      score: values[topKPosition],
    }));

    if (topK === 1) {
      toReturn.push(...vals);
    } else {
      toReturn.push(vals);
    }
  }

  return toReturn;
};

interface RerankWithCrossEncoderArgs {
  queryText: string;
  matches: QueryMatchSummary[];
}

/**
 * Applies cross-encoder reranking and maps scores back into distance semantics (lower is better).
 * Distances are derived from min-max normalized cross-encoder scores, then inverted.
 */
export const rerankWithCrossEncoder = async ({
  queryText,
  matches,
}: RerankWithCrossEncoderArgs): Promise<QueryMatchSummary[]> => {
  if (matches.length < 2) {
    return matches;
  }

  try {
    const pipe = await getCrossEncoderPipeline();
    const texts = matches.map(() => queryText);
    const textPairs = matches.map((m) => m.documentPreview);
    const rawOutput = await runTextClassificationWithTextPairs({
      pipe,
      texts,
      textPairs,
      topK: 1,
    });
    const scores = extractRerankerScores({ rawOutput, expectedCount: matches.length });

    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const scoreSpan = maxScore - minScore;

    const reranked = matches.map((match, index) => {
      const score = scores[index] ?? minScore;
      const normalizedSimilarity =
        scoreSpan <= NUMERIC_DIVISION_EPSILON ? 1 : (score - minScore) / (scoreSpan + NUMERIC_DIVISION_EPSILON);
      const distance = 1 / (normalizedSimilarity + NUMERIC_DIVISION_EPSILON);

      return {
        ...match,
        distance,
      };
    });

    reranked.sort((left, right) => left.distance - right.distance);
    return reranked;
  } catch (error: unknown) {
    console.error("[rerankWithCrossEncoder]", error);
    const message = getErrorMessage(error);
    throw new Error(`[rerankWithCrossEncoder] ${message}`, { cause: error });
  }
};
