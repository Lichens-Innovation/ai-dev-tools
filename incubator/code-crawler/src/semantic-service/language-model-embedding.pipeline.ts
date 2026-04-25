import { getErrorMessage, isNullish } from "@lichens-innovation/ts-common";
import { l2NormalizeInPlace } from "../utils/embeddings.utils";
import { EnvNames, getCodeCrawlerEmbeddingModel, getEmbeddingDimensions } from "../utils/env.utils";
import { applyTransformersFilesystemEnv } from "../utils/ml/transformers-fs-env.utils";

interface FeatureExtractionCallOptions {
  normalize?: boolean;
  pooling?: "mean" | "none" | "cls";
}

interface FeatureExtractionTensor {
  data: Float32Array;
  dims: number[];
}

type FeaturePipeline = {
  (texts: string | string[], options?: FeatureExtractionCallOptions): Promise<FeatureExtractionTensor>;
};

const loadFeatureExtractionPipeline = async (): Promise<FeaturePipeline> => {
  const { env, pipeline } = await import("@huggingface/transformers");
  applyTransformersFilesystemEnv(env);

  const model = getCodeCrawlerEmbeddingModel();
  console.info(
    `[loadFeatureExtractionPipeline] Loading model "${model}" (local: "${env.localModelPath}" first run may download assets)…`
  );
  const extractor = await pipeline("feature-extraction", model);
  console.info(`[loadFeatureExtractionPipeline] Model ready: "${model}"`);
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

interface TensorLikeRowSource {
  data: ArrayLike<number>;
  dims: number[];
}

/**
 * Converts a feature-extraction tensor (float32) into one row per
 * batch item. Copies each row into its own Float32Array.
 */
const tensorToRowVectors = (tensor: TensorLikeRowSource): Float32Array[] => {
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
