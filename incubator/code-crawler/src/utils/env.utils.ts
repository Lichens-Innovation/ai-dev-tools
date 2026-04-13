import { isBlank, isNullish } from "@lichens-innovation/ts-common";
import { homedir } from "node:os";
import path from "node:path";

export const EnvNames = {
  root: "CODE_CRAWLER_ROOT",
  host: "CODE_CRAWLER_HOST",
  port: "CODE_CRAWLER_PORT",
  corsOrigin: "CODE_CRAWLER_CORS_ORIGIN",
  embeddingModel: "CODE_CRAWLER_EMBEDDING_MODEL",
  embeddingDim: "CODE_CRAWLER_EMBEDDING_DIM",
  transformersModelsPath: "CODE_CRAWLER_TRANSFORMERS_MODELS_PATH",
  semanticIndexDbPath: "CODE_CRAWLER_SEMANTIC_INDEX_DB_PATH",
  maxIndexFileBytes: "CODE_CRAWLER_MAX_INDEX_FILE_BYTES",
  chunkMaxChars: "CODE_CRAWLER_CHUNK_MAX_CHARS",
  chunkMaxLines: "CODE_CRAWLER_CHUNK_MAX_LINES",
  chunkOverlapLines: "CODE_CRAWLER_CHUNK_OVERLAP_LINES",
  embedBatchSize: "CODE_CRAWLER_EMBED_BATCH_SIZE",
  ragTextModel: "CODE_CRAWLER_RAG_TEXT_MODEL",
} as const;

export type CodeCrawlerEnv = {
  root: string;
  host: string;
  port: number;
  corsOrigin: string | boolean;
  embeddingModel: string;
  embeddingDim: number;
  transformersModelsPath: string;
  semanticIndexDbPath: string;
  maxIndexFileBytes: number;
  chunkMaxChars: number;
  chunkMaxLines: number;
  chunkOverlapLines: number;
  embedBatchSize: number;
  ragTextModel: string;
};

let cached: CodeCrawlerEnv | null = null;

// `~` in env values is often not expanded outside a shell; normalize before `path.resolve`.
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

export const readOptionalTrimmedEnvVar = (name: string): string => process.env[name]?.trim() ?? "";

export const requireNonBlankEnvVar = (name: string): string => {
  const trimmed = readOptionalTrimmedEnvVar(name);
  if (isBlank(trimmed)) {
    throw new Error(`[env] ${name} is required (non-empty)`);
  }
  return trimmed;
};

export const requirePositiveIntEnvVar = (name: string): number => {
  const raw = requireNonBlankEnvVar(name);
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`[env] ${name} must be a positive integer (got: ${raw})`);
  }
  return n;
};

export const requirePortEnvVar = (name: string): number => {
  const raw = requireNonBlankEnvVar(name);
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > 65_535) {
    throw new Error(`[env] ${name} must be an integer from 1 to 65535 (got: ${raw})`);
  }
  return n;
};

const buildCodeCrawlerEnv = (): CodeCrawlerEnv => {
  const host = requireNonBlankEnvVar(EnvNames.host);
  const port = requirePortEnvVar(EnvNames.port);
  const corsRaw = readOptionalTrimmedEnvVar(EnvNames.corsOrigin);
  const root = requireNonBlankEnvVar(EnvNames.root);
  const embeddingModel = requireNonBlankEnvVar(EnvNames.embeddingModel);
  const embeddingDim = requirePositiveIntEnvVar(EnvNames.embeddingDim);
  const transformersModelsRaw = requireNonBlankEnvVar(EnvNames.transformersModelsPath);
  const semanticIndexRaw = requireNonBlankEnvVar(EnvNames.semanticIndexDbPath);
  const maxIndexFileBytes = requirePositiveIntEnvVar(EnvNames.maxIndexFileBytes);
  const chunkMaxChars = requirePositiveIntEnvVar(EnvNames.chunkMaxChars);
  const chunkMaxLines = requirePositiveIntEnvVar(EnvNames.chunkMaxLines);
  const chunkOverlapLines = requirePositiveIntEnvVar(EnvNames.chunkOverlapLines);
  const embedBatchSize = requirePositiveIntEnvVar(EnvNames.embedBatchSize);
  const ragTextModel = requireNonBlankEnvVar(EnvNames.ragTextModel);

  return {
    host,
    port,
    corsOrigin: isBlank(corsRaw) ? true : corsRaw,
    root,
    embeddingModel,
    embeddingDim,
    transformersModelsPath: path.resolve(expandUserDirectory(transformersModelsRaw)),
    semanticIndexDbPath: path.resolve(expandUserDirectory(semanticIndexRaw)),
    maxIndexFileBytes,
    chunkMaxChars,
    chunkMaxLines,
    chunkOverlapLines,
    embedBatchSize,
    ragTextModel,
  };
};

/** Parses and caches env; throws on the first invalid or missing required variable. */
export const loadCodeCrawlerEnv = (): CodeCrawlerEnv => {
  if (!isNullish(cached)) {
    return cached;
  }
  cached = buildCodeCrawlerEnv();
  return cached;
};

export const getCodeCrawlerEnv = (): Readonly<CodeCrawlerEnv> => loadCodeCrawlerEnv();

export const getCodeCrawlerHost = (): string => getCodeCrawlerEnv().host;

export const getCodeCrawlerPort = (): number => getCodeCrawlerEnv().port;

export const getCodeCrawlerCorsOrigin = (): string | boolean => getCodeCrawlerEnv().corsOrigin;

export const getCodeCrawlerRoot = (): string => getCodeCrawlerEnv().root;

export const getCodeCrawlerEmbeddingModel = (): string => getCodeCrawlerEnv().embeddingModel;

export const getCodeCrawlerTransformersModelsPath = (): string => getCodeCrawlerEnv().transformersModelsPath;

export const resolveSemanticIndexDbPath = (): string => getCodeCrawlerEnv().semanticIndexDbPath;

export const getEmbeddingDimensions = (): number => getCodeCrawlerEnv().embeddingDim;

export const getCodeCrawlerMaxIndexFileBytes = (): number => getCodeCrawlerEnv().maxIndexFileBytes;

export const getCodeCrawlerChunkMaxChars = (): number => getCodeCrawlerEnv().chunkMaxChars;

export const getCodeCrawlerChunkMaxLines = (): number => getCodeCrawlerEnv().chunkMaxLines;

export const getCodeCrawlerChunkOverlapLines = (): number => getCodeCrawlerEnv().chunkOverlapLines;

export const getCodeCrawlerEmbedBatchSize = (): number => getCodeCrawlerEnv().embedBatchSize;

export const getCodeCrawlerRagTextModel = (): string => getCodeCrawlerEnv().ragTextModel;

export const CODE_CRAWLER_TRANSFORMERS_FS_CACHE_DIR = ".hf-transformers-cache";

export const getCodeCrawlerTransformersFsEnvValues = (): { localModelPath: string; cacheDir: string } => {
  const modelsRoot = getCodeCrawlerTransformersModelsPath();

  const localModelPath = modelsRoot.endsWith(path.sep) ? modelsRoot : `${modelsRoot}${path.sep}`;
  const cacheDir = path.join(modelsRoot, CODE_CRAWLER_TRANSFORMERS_FS_CACHE_DIR);

  return {
    localModelPath,
    cacheDir,
  };
};
