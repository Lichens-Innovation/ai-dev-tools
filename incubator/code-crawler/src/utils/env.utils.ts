import { isBlank, isNotBlank } from "@lichens-innovation/ts-common";
import { homedir } from "node:os";
import path from "node:path";

/** Env var names (single source for code, MCP copy, and `.env.example`). */
export const EnvNames = {
  root: "CODE_CRAWLER_ROOT",
  host: "CODE_CRAWLER_HOST",
  port: "CODE_CRAWLER_PORT",
  corsOrigin: "CODE_CRAWLER_CORS_ORIGIN",
  embeddingModel: "CODE_CRAWLER_EMBEDDING_MODEL",
  embeddingDim: "CODE_CRAWLER_EMBEDDING_DIM",
  semanticIndexDbPath: "CODE_CRAWLER_SEMANTIC_INDEX_DB_PATH",
  maxIndexFileBytes: "CODE_CRAWLER_MAX_INDEX_FILE_BYTES",
  chunkMaxChars: "CODE_CRAWLER_CHUNK_MAX_CHARS",
  chunkMaxLines: "CODE_CRAWLER_CHUNK_MAX_LINES",
  chunkOverlapLines: "CODE_CRAWLER_CHUNK_OVERLAP_LINES",
  embedBatchSize: "CODE_CRAWLER_EMBED_BATCH_SIZE",
} as const;

/** Hub model id → output width when {@link EnvNames.embeddingDim} is unset (exact id match). */
export const EMBEDDING_MODEL_DIMENSIONS_PRESET: Readonly<Record<string, number>> = {
  "jinaai/jina-embeddings-v2-base-code": 768,
  "Xenova/all-MiniLM-L6-v2": 384,
  "sentence-transformers/all-MiniLM-L6-v2": 384,
};

export const DefaultValues = {
  host: "127.0.0.1",
  port: 3333,
  embeddingModel: "jinaai/jina-embeddings-v2-base-code",
  /**
   * Fallback vector length when {@link EnvNames.embeddingDim} is unset and the resolved model id
   * is not in {@link EMBEDDING_MODEL_DIMENSIONS_PRESET}. Must match the default model output.
   */
  embeddingDim: 768,
  semanticIndexDbBasename: "code-crawler-db",
  maxIndexFileBytes: 1 * 1024 * 1024,
  chunkMaxChars: 1280,
  chunkMaxLines: 48,
  chunkOverlapLines: 10,
  /** Max texts passed to the embedding pipeline per forward pass (memory vs throughput). */
  embedBatchSize: 64,
} as const;

const parsePortInRange = (raw: string | undefined, fallback: number): number => {
  if (isBlank(raw)) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65_535) {
    return fallback;
  }

  return parsed;
};

export const getCodeCrawlerHost = (): string => {
  const raw = process.env[EnvNames.host]?.trim();
  return isBlank(raw) ? DefaultValues.host : raw;
};

/**
 * HTTP listen port: {@link EnvNames.port} if set and valid, else default.
 */
export const getCodeCrawlerPort = (): number =>
  parsePortInRange(process.env[EnvNames.port]?.trim(), DefaultValues.port);

/**
 * CORS `origin`: returns `true` (reflect request Origin) when unset/blank; otherwise the trimmed string.
 */
export const getCodeCrawlerCorsOrigin = (): string | boolean => {
  const raw = process.env[EnvNames.corsOrigin]?.trim();
  return isBlank(raw) ? true : raw;
};

/**
 * Expands a leading `~` or `~/` to {@link homedir}. Other paths are returned trimmed unchanged.
 * Shells expand `~` in `.env`; Node and MCP often do not — use this before `path.resolve`.
 */
export const expandUserDirectory = (input: string): string => {
  const trimmed = input.trim();
  if (trimmed === "~") {
    return homedir();
  }

  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return path.join(homedir(), trimmed.slice(2));
  }

  return trimmed;
};

export const getCodeCrawlerRoot = (): string | undefined => {
  const raw = process.env[EnvNames.root];
  if (isBlank(raw?.trim())) {
    return undefined;
  }

  return raw;
};

export const getCodeCrawlerEmbeddingModel = (): string => {
  const raw = process.env[EnvNames.embeddingModel]?.trim();
  return isBlank(raw) ? DefaultValues.embeddingModel : raw;
};

/**
 * Absolute path to the semantic index SQLite file.
 * When {@link EnvNames.semanticIndexDbPath} is unset/blank: `<homedir>/code-crawler/<DefaultValues.semanticIndexDbBasename>`.
 * When set: resolved after {@link expandUserDirectory} (so `~/...` in `.env` works).
 */
export const resolveSemanticIndexDbPath = (): string => {
  const fromEnv = process.env[EnvNames.semanticIndexDbPath]?.trim();

  if (isNotBlank(fromEnv)) {
    return path.resolve(expandUserDirectory(fromEnv));
  }

  return path.join(homedir(), "code-crawler", DefaultValues.semanticIndexDbBasename);
};

/**
 * Embedding vector length for sqlite-vec. Must match the loaded model.
 * When {@link EnvNames.embeddingDim} is unset: uses {@link EMBEDDING_MODEL_DIMENSIONS_PRESET} for the
 * resolved {@link getCodeCrawlerEmbeddingModel} id, else {@link DefaultValues.embeddingDim}.
 * Throws if {@link EnvNames.embeddingDim} is set but not a positive integer.
 */
export const getEmbeddingDimensions = (): number => {
  const raw = process.env[EnvNames.embeddingDim]?.trim();

  if (isNotBlank(raw)) {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) {
      throw new Error(`[getEmbeddingDimensions] invalid ${EnvNames.embeddingDim}=${raw}`);
    }
    return n;
  }

  const modelId = getCodeCrawlerEmbeddingModel();
  const fromPreset = EMBEDDING_MODEL_DIMENSIONS_PRESET[modelId];
  if (fromPreset !== undefined) {
    return fromPreset;
  }

  return DefaultValues.embeddingDim;
};

export const getCodeCrawlerMaxIndexFileBytes = (): number => {
  const raw = process.env[EnvNames.maxIndexFileBytes]?.trim();
  if (isBlank(raw)) {
    return DefaultValues.maxIndexFileBytes;
  }

  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DefaultValues.maxIndexFileBytes;
};

const parsePositiveIntFromEnv = (raw: string | undefined): number | null => {
  const trimmed = raw?.trim();
  if (isBlank(trimmed)) {
    return null;
  }

  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const getCodeCrawlerChunkMaxChars = (): number =>
  parsePositiveIntFromEnv(process.env[EnvNames.chunkMaxChars]) ?? DefaultValues.chunkMaxChars;

export const getCodeCrawlerChunkMaxLines = (): number =>
  parsePositiveIntFromEnv(process.env[EnvNames.chunkMaxLines]) ?? DefaultValues.chunkMaxLines;

export const getCodeCrawlerChunkOverlapLines = (): number =>
  parsePositiveIntFromEnv(process.env[EnvNames.chunkOverlapLines]) ?? DefaultValues.chunkOverlapLines;

/**
 * Batch size for embedding many chunk texts in one pipeline call.
 */
export const getCodeCrawlerEmbedBatchSize = (): number =>
  parsePositiveIntFromEnv(process.env[EnvNames.embedBatchSize]) ?? DefaultValues.embedBatchSize;
