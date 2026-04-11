import { getErrorMessage, isNullish } from "@lichens-innovation/ts-common";
import path from "node:path";
import { l2NormalizeInPlace } from "../utils/embeddings.utils";
import {
  EnvNames,
  getCodeCrawlerEmbeddingModel,
  getCodeCrawlerTransformersModelsPath,
  getEmbeddingDimensions,
} from "../utils/env.utils";

type FeaturePipeline = {
  (
    texts: string | string[],
    options?: { normalize?: boolean; pooling?: "mean" | "none" | "cls" }
  ): Promise<{
    data: Float32Array;
    dims: number[];
  }>;
};

const TRANSFORMERS_FS_CACHE_DIR = ".hf-transformers-cache";

const loadFeatureExtractionPipeline = async (): Promise<FeaturePipeline> => {
  const { env, pipeline } = await import("@huggingface/transformers");
  const modelsRoot = getCodeCrawlerTransformersModelsPath();
  env.localModelPath = modelsRoot.endsWith(path.sep) ? modelsRoot : `${modelsRoot}${path.sep}`;
  env.cacheDir = path.join(modelsRoot, TRANSFORMERS_FS_CACHE_DIR);
  const model = getCodeCrawlerEmbeddingModel();
  console.info(
    `[semantic-embedding] Loading model "${model}" (local: "${env.localModelPath}", cache: "${env.cacheDir}"; first run may download assets)…`
  );
  const extractor = await pipeline("feature-extraction", model);
  console.info(`[semantic-embedding] Model ready: "${model}"`);
  return extractor as FeaturePipeline;
};

let pipelinePromise: Promise<FeaturePipeline> | null = null;

const getFeatureExtractionPipeline = (): Promise<FeaturePipeline> => {
  if (isNullish(pipelinePromise)) {
    pipelinePromise = loadFeatureExtractionPipeline();
  }
  return pipelinePromise;
};

const asFloat32Data = (data: ArrayLike<number>): Float32Array =>
  data instanceof Float32Array ? data : Float32Array.from(data);

/**
 * Converts a feature-extraction tensor (float32) into one row per
 * batch item. Copies each row into its own Float32Array.
 */
const tensorToRowVectors = (tensor: { data: ArrayLike<number>; dims: number[] }): Float32Array[] => {
  const data = asFloat32Data(tensor.data);
  const { dims } = tensor;
  if (dims.length === 1) {
    return [Float32Array.from(data)];
  }
  const batch = dims[0] ?? 0;
  const dim = dims[1] ?? 0;
  if (batch <= 0 || dim <= 0) {
    return [];
  }
  const rows: Float32Array[] = [];
  for (let i = 0; i < batch; i += 1) {
    const start = i * dim;
    rows.push(Float32Array.from(data.subarray(start, start + dim)));
  }
  return rows;
};

export interface EmbedTextsOutcome {
  embeddings: Float32Array[];
  errorMessage?: string;
}

/**
 * Embeds texts with mean pooling. Normalizes each row to
 * unit L2 (defensive; pipeline may already set normalize: true).
 */
export const embedTextsWithLanguageModel = async (texts: string[]): Promise<EmbedTextsOutcome> => {
  if (texts.length === 0) {
    return { embeddings: [] };
  }

  try {
    const extractor = await getFeatureExtractionPipeline();
    const tensor = await extractor(texts, { pooling: "mean", normalize: true });
    const rows = tensorToRowVectors(tensor);

    if (rows.length !== texts.length) {
      return {
        embeddings: [],
        errorMessage: `Embedding batch size mismatch: expected ${texts.length}, got ${rows.length}`,
      };
    }

    const expectedDim = getEmbeddingDimensions();
    const firstLen = rows[0]?.length;
    if (!isNullish(firstLen) && firstLen !== expectedDim) {
      return {
        embeddings: [],
        errorMessage: [
          `Embedding vector length ${firstLen} does not match configured ${expectedDim}`,
          `(${getCodeCrawlerEmbeddingModel()}). Set ${EnvNames.embeddingDim} to the model output width.`,
        ].join(" "),
      };
    }

    for (const row of rows) {
      l2NormalizeInPlace(row);
    }

    return { embeddings: rows };
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error(`[embedTextsWithLanguageModel]: ${message}`, e);
    return { embeddings: [], errorMessage: message };
  }
};
