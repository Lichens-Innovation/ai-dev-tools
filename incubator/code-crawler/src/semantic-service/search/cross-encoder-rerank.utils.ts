import { getErrorMessage, isNullish } from "@lichens-innovation/ts-common";
import { getCodeCrawlerRerankerDtype, getCodeCrawlerRerankerModel } from "../../utils/env.utils";
import { NUMERIC_DIVISION_EPSILON } from "../../utils/embeddings.utils";
import { applyTransformersFilesystemEnv } from "../../utils/ml/transformers-fs-env.utils";
import type { QueryMatchSummary } from "../types/search.types";

interface ClassifierScoreItem {
  score?: number;
}

type SequenceClassifierPipeline = (
  inputs: Array<[string, string]>,
  options?: Record<string, unknown>
) => Promise<unknown>;

const loadCrossEncoderPipeline = async (): Promise<SequenceClassifierPipeline> => {
  const { env, pipeline } = await import("@huggingface/transformers");
  applyTransformersFilesystemEnv(env);

  const model = getCodeCrawlerRerankerModel();
  const dtype = getCodeCrawlerRerankerDtype();
  console.info(
    `[loadCrossEncoderPipeline] Loading model "${model}" (dtype=${dtype}, local: "${env.localModelPath}"; first run may download assets)…`
  );

  const reranker = await pipeline("text-classification", model, { dtype });
  console.info(`[loadCrossEncoderPipeline] Model ready: "${model}"`);
  return reranker as SequenceClassifierPipeline;
};

let crossEncoderPipelinePromise: Promise<SequenceClassifierPipeline> | null = null;

const getCrossEncoderPipeline = (): Promise<SequenceClassifierPipeline> => {
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
    const reranker = await getCrossEncoderPipeline();
    const pairs: Array<[string, string]> = matches.map((match) => [queryText, match.documentPreview]);
    const rawOutput = await reranker(pairs, { topk: 1 });
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
    const message = getErrorMessage(error);
    throw new Error(`[rerankWithCrossEncoder] ${message}`, { cause: error });
  }
};
