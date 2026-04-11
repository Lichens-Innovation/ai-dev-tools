import { isBlank, isNotBlank } from "@lichens-innovation/ts-common";
import { homedir } from "node:os";
import path from "node:path";

const DEFAULT_EMBEDDING_DIMENSIONS = 768;

const ENV_SEMANTIC_INDEX_DB = "CODE_CRAWLER_SEMANTIC_INDEX_DB_PATH";
const ENV_EMBEDDING_DIM = "CODE_CRAWLER_EMBEDDING_DIM";

const DEFAULT_DB_BASENAME = "code-crawler-db";

/**
 * Absolute path to the semantic index database file.
 * Override with {@link ENV_SEMANTIC_INDEX_DB} when set (non-empty after trim).
 */
export const resolveSemanticIndexDbPath = (): string => {
  const fromEnv = process.env[ENV_SEMANTIC_INDEX_DB]?.trim();

  if (isNotBlank(fromEnv)) {
    return path.resolve(fromEnv);
  }

  return path.join(homedir(), "code-crawler", DEFAULT_DB_BASENAME);
};

/**
 * Embedding vector length for vec0 (default 384 for Xenova/all-MiniLM-L6-v2).
 * Must match the model output; override with {@link ENV_EMBEDDING_DIM} when using another model.
 */
export const getEmbeddingDimensions = (): number => {
  const raw = process.env[ENV_EMBEDDING_DIM]?.trim();

  if (isBlank(raw)) {
    return DEFAULT_EMBEDDING_DIMENSIONS;
  }

  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`[getEmbeddingDimensions] invalid ${ENV_EMBEDDING_DIM}=${raw}`);
  }

  return n;
};
