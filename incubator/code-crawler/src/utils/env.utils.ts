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
} as const;

export const DefaultValues = {
  host: "127.0.0.1",
  port: 3333,
  embeddingModel: "jinaai/jina-embeddings-v2-base-code",
  /** Default vector length when `CODE_CRAWLER_EMBEDDING_DIM` is unset; must match the default model output. */
  embeddingDim: 768,
  semanticIndexDbBasename: "code-crawler-db",
  maxIndexFileBytes: 1 * 1024 * 1024,
  chunkMaxChars: 1280,
  chunkMaxLines: 48,
  chunkOverlapLines: 10,
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
 * When {@link EnvNames.semanticIndexDbPath} is unset/blank: `~/code-crawler/<DefaultValues.semanticIndexDbBasename>`.
 */
export const resolveSemanticIndexDbPath = (): string => {
  const fromEnv = process.env[EnvNames.semanticIndexDbPath]?.trim();

  if (isNotBlank(fromEnv)) {
    return path.resolve(fromEnv);
  }

  return path.join(homedir(), "code-crawler", DefaultValues.semanticIndexDbBasename);
};

/**
 * Embedding vector length for sqlite-vec. Must match the loaded model.
 * Throws if {@link EnvNames.embeddingDim} is set but not a positive integer.
 */
export const getEmbeddingDimensions = (): number => {
  const raw = process.env[EnvNames.embeddingDim]?.trim();

  if (isBlank(raw)) {
    return DefaultValues.embeddingDim;
  }

  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`[getEmbeddingDimensions] invalid ${EnvNames.embeddingDim}=${raw}`);
  }

  return n;
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
