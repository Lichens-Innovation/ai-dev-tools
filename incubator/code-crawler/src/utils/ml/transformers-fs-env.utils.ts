import { getCodeCrawlerTransformersFsEnvValues } from "../env.utils";

type TransformersModule = typeof import("@huggingface/transformers");

/**
 * Applies local model path and HF cache dir from env to Transformers.js `env` singleton.
 */
export const applyTransformersFilesystemEnv = (env: TransformersModule["env"]): void => {
  const { localModelPath, cacheDir } = getCodeCrawlerTransformersFsEnvValues();
  env.localModelPath = localModelPath;
  env.cacheDir = cacheDir;
};
