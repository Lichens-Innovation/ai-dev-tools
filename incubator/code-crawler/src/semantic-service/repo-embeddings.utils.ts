import { getErrorMessage, isBlank, isNotBlank, isNullish } from "@lichens-innovation/ts-common";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { createHash } from "node:crypto";
import type { Dirent, Stats } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";
import { z } from "zod";
import { buildMcpErrorResponse, buildMcpTextResponse } from "../mcp/mcp-server.utils";
import { toString } from "../utils/arrays.utils";
import { buildSemanticLineChunks as buildSemanticChunks } from "./semantic-chunk.utils";
import { embedTextsWithLanguageModel } from "./semantic-embedding-pipeline.utils";
import type { SemanticIndexChunkRow } from "./semantic-index-store.types";
import type { FileIndexMetadata, FileIndexRecord, QueryOutcome } from "./semantic-search.types";
import { workspaceSemanticIndexStore } from "./sqlite-semantic-index.store";

import {
  CODE_CRAWLER_ROOT_CONFIGURATION_ERROR_MESSAGE,
  expandUserDirectory,
  listGitRepoRootsUnderParent,
  resolveCodeCrawlerParentPath,
  resolveRepositoryUnderCodeCrawlerRoot,
} from "./git-projects.utils";

const WORKSPACE_REPOSITORIES_FILES_COLLECTION = "workspace-repositories-files";

/** Default cap (1 MiB) when `CODE_CRAWLER_MAX_INDEX_FILE_BYTES` is unset or invalid. */
const DEFAULT_MAX_INDEX_FILE_BYTES = 1 * 1024 * 1024;

const parseMaxIndexFileBytes = (): number => {
  const raw = process.env.CODE_CRAWLER_MAX_INDEX_FILE_BYTES?.trim();
  if (isBlank(raw)) {
    return DEFAULT_MAX_INDEX_FILE_BYTES;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_INDEX_FILE_BYTES;
};

const MAX_INDEX_FILE_BYTES = parseMaxIndexFileBytes();
const EMBED_BATCH_SIZE = 64;

const EXAMPLE_QUERY_TEXT = "tanstack query returning a list of items with an infinite staleTime";

const MAX_SEMANTIC_SEARCH_NB_RESULTS = 50;

const INDEX_SKIP_DIR_NAMES = new Set([
  ".git",
  ".github",
  ".vscode",
  ".idea",
  ".next",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "vendor",
  ".amplify",

  // mobile app platforms
  "ios",
  "android",
  ".expo",
]);

/** Only these extensions are embedded into the semantic index (case-insensitive). */
//const INDEX_ALLOWED_FILE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".py", ".c", ".cpp", ".cs"]);
const INDEX_ALLOWED_FILE_EXTENSIONS = new Set([".ts", ".tsx"]);

export const prepareRepositoryForSemanticSearchInputSchema = z.object({
  repository: z
    .string()
    .min(1)
    .describe(
      toString([
        "Git repository folder name (directory basename) under the parent directory",
        "(rootDir when provided, otherwise CODE_CRAWLER_ROOT); must match names from the",
        "workspace-repositories resource when using the default root.",
      ])
    ),
  rootDir: z
    .string()
    .optional()
    .describe(
      toString([
        "Optional path to the directory that contains Git repositories",
        "(~ expansion supported). When omitted, CODE_CRAWLER_ROOT is used.",
      ])
    ),
});

export type PrepareRepositoryForSemanticSearchInput = z.infer<typeof prepareRepositoryForSemanticSearchInputSchema>;

export const prepareWorkspaceRepositoriesForSemanticSearchInputSchema = z.object({
  rootDir: z
    .string()
    .optional()
    .describe(
      toString([
        "Optional path to the directory that contains Git repositories",
        "(~ expansion supported). When omitted, CODE_CRAWLER_ROOT is used",
        "(same default as prepare-repository-for-semantic-search).",
      ])
    ),
});

export type PrepareWorkspaceRepositoriesForSemanticSearchInput = z.infer<
  typeof prepareWorkspaceRepositoriesForSemanticSearchInputSchema
>;

export const semanticSearchWorkspaceFilesInputSchema = z.object({
  queryText: z
    .string()
    .min(1)
    .describe(
      toString([
        "Natural-language search query; embedded and matched against indexed",
        "source chunks (line windows with path prefix), not whole files only.",
      ])
    ),
  nbResults: z
    .number()
    .int()
    .positive()
    .max(MAX_SEMANTIC_SEARCH_NB_RESULTS)
    .optional()
    .default(10)
    .describe(
      toString([
        `Maximum number of chunk matches to return (default 10, max ${MAX_SEMANTIC_SEARCH_NB_RESULTS});`,
        "each row is one indexed source chunk, not a whole file.",
      ])
    ),
  repository: z
    .string()
    .min(1)
    .optional()
    .describe(
      toString([
        "Optional repository folder name (metadata filter, same basename as",
        "prepare-repository-for-semantic-search). When omitted, search runs across",
        "all indexed repositories.",
      ])
    ),
});

export type SemanticSearchWorkspaceFilesInput = z.infer<typeof semanticSearchWorkspaceFilesInputSchema>;

export const clearWorkspaceSemanticSearchIndexInputSchema = z.object({});

export type ClearWorkspaceSemanticSearchIndexInput = z.infer<typeof clearWorkspaceSemanticSearchIndexInputSchema>;

const hashDocumentUtf8 = (document: string): string => createHash("sha256").update(document, "utf8").digest("hex");

const readDirEntriesOrNull = async (dir: string): Promise<Dirent[] | null> => {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (e: unknown) {
    console.error(`[readDirEntriesOrNull]: readdir failed on ${dir}: ${getErrorMessage(e)}`, e);
    return null;
  }
};

const statFileOrNull = async (fullPath: string): Promise<Stats | null> => {
  try {
    return await stat(fullPath);
  } catch (e: unknown) {
    console.error(`[statFileOrNull]: stat failed on ${fullPath}: ${getErrorMessage(e)}`, e);
    return null;
  }
};

const readFileBufferOrNull = async (fullPath: string): Promise<Buffer | null> => {
  try {
    return await readFile(fullPath);
  } catch (e: unknown) {
    console.error(`[readFileBufferOrNull]: readFile failed on ${fullPath}: ${getErrorMessage(e)}`, e);
    return null;
  }
};

interface TryBuildFileIndexRecordArgs {
  fullPath: string;
  repoRoot: string;
  repository: string;
}

interface IndexableFileContent {
  document: string;
  stat: Stats;
}

const loadIndexableFileContent = async (fullPath: string): Promise<IndexableFileContent | null> => {
  console.info(`\t ${fullPath}`);

  const st = await statFileOrNull(fullPath);
  if (!st || !st.isFile() || st.size > MAX_INDEX_FILE_BYTES) {
    return null;
  }

  const buf = await readFileBufferOrNull(fullPath);
  if (!buf) {
    return null;
  }

  const document = buf.toString("utf8");
  if (document.includes("\uFFFD")) {
    return null;
  }

  return { document, stat: st };
};

const pathHasIndexableExtension = (fullPath: string): boolean =>
  INDEX_ALLOWED_FILE_EXTENSIONS.has(extname(fullPath).toLowerCase());

const tryBuildFileIndexRecord = async ({
  fullPath,
  repoRoot,
  repository,
}: TryBuildFileIndexRecordArgs): Promise<FileIndexRecord | null> => {
  if (!pathHasIndexableExtension(fullPath)) {
    return null;
  }

  const loaded = await loadIndexableFileContent(fullPath);
  if (!loaded) {
    return null;
  }

  const { document, stat: st } = loaded;
  const relRaw = relative(repoRoot, fullPath);
  const path = relRaw.split(/[/\\]/).join("/");
  const id = `${repository}::${path}`;
  const lastModifiedAtISO = st.mtime.toISOString();
  const contentSha256 = hashDocumentUtf8(document);

  return {
    document,
    id,
    metadata: {
      contentSha256,
      fileId: id,
      filename: basename(fullPath),
      fullPath,
      lastModifiedAtISO,
      pathRelative: path,
      repository,
      sizeBytes: st.size,
    },
  };
};

interface WalkRepositoryForFileRecordsArgs {
  dir: string;
  records: FileIndexRecord[];
  repoRoot: string;
  repository: string;
}

const walkRepositoryForFileRecords = async ({
  dir,
  records,
  repoRoot,
  repository,
}: WalkRepositoryForFileRecordsArgs): Promise<void> => {
  const entries = await readDirEntriesOrNull(dir);
  if (!entries) {
    return;
  }

  for (const ent of entries) {
    const fullPath = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (INDEX_SKIP_DIR_NAMES.has(ent.name)) {
        continue;
      }

      await walkRepositoryForFileRecords({ dir: fullPath, records, repoRoot, repository });
      continue;
    }

    if (!ent.isFile()) {
      continue;
    }

    const rec = await tryBuildFileIndexRecord({ fullPath, repoRoot, repository });
    if (rec) {
      records.push(rec);
    }
  }
};

interface CollectFileRecordsArgs {
  repoRoot: string;
  repository: string;
}

const collectFileRecords = async ({ repoRoot, repository }: CollectFileRecordsArgs): Promise<FileIndexRecord[]> => {
  const records: FileIndexRecord[] = [];
  await walkRepositoryForFileRecords({ dir: repoRoot, records, repoRoot, repository });
  console.info(`[${repository}] discovery complete: ${records.length} indexable file(s)`);
  return records;
};

export type CollectFileRecordsOutcome =
  | { ok: true; records: FileIndexRecord[] }
  | { ok: false; result: CallToolResult };

export interface TryCollectFileRecordsArgs {
  repoRoot: string;
  repository: string;
}

const tryCollectFileRecords = async ({
  repoRoot,
  repository,
}: TryCollectFileRecordsArgs): Promise<CollectFileRecordsOutcome> => {
  try {
    const records = await collectFileRecords({ repoRoot, repository });
    return { ok: true, records };
  } catch (e: unknown) {
    const errorMessage = getErrorMessage(e);
    console.error(`[tryCollectFileRecords]: walk/read failed: ${errorMessage}`, e);
    return {
      ok: false,
      result: buildMcpErrorResponse(`Failed to scan repository files: ${errorMessage}`),
    };
  }
};

interface RunWorkspaceSemanticQueryArgs {
  nResults: number;
  queryText: string;
  repository?: string;
}

const runWorkspaceSemanticQuery = async ({
  nResults,
  queryText,
  repository,
}: RunWorkspaceSemanticQueryArgs): Promise<QueryOutcome> => {
  const { embeddings, errorMessage } = await embedTextsWithLanguageModel([queryText]);

  if (isNotBlank(errorMessage)) {
    return { error: errorMessage };
  }

  const queryEmbedding = embeddings[0];
  if (isNullish(queryEmbedding)) {
    return { error: "Query embedding produced no vector" };
  }

  try {
    return workspaceSemanticIndexStore.queryNearest({
      nResults,
      queryEmbedding,
      repository,
    });
  } catch (e: unknown) {
    const queryError = getErrorMessage(e);
    console.error(`[runWorkspaceSemanticQuery]: query failed: ${queryError}`, e);
    return { error: queryError };
  }
};

const runExampleQueryForRepository = async ({ repository }: { repository: string }): Promise<QueryOutcome> =>
  runWorkspaceSemanticQuery({
    nResults: 5,
    queryText: EXAMPLE_QUERY_TEXT,
    repository,
  });

type UpsertFileRecordsOutcome = { ok: true; indexedChunkCount: number } | { ok: false; result: CallToolResult };

interface PendingEmbedChunk {
  chunkId: string;
  chunkIndex: number;
  embedText: string;
  endLine: number;
  fileRecord: FileIndexRecord;
  startLine: number;
}

const buildPendingChunksForRecords = (records: FileIndexRecord[]): PendingEmbedChunk[] => {
  const pending: PendingEmbedChunk[] = [];

  for (const fileRecord of records) {
    const { pathRelative, repository } = fileRecord.metadata;
    const chunks = buildSemanticChunks(fileRecord.document);

    chunks.forEach((chunk, i) => {
      pending.push({
        chunkId: `${fileRecord.id}#${i}`,
        chunkIndex: i,
        embedText: `File: ${pathRelative}\nRepo: ${repository}\n\n${chunk.body}`,
        endLine: chunk.endLine,
        fileRecord,
        startLine: chunk.startLine,
      });
    });
  }
  return pending;
};

interface TryUpsertFileRecordsToSemanticIndexArgs {
  records: FileIndexRecord[];
  repository: string;
}

type FileChunksBucket = { chunks: SemanticIndexChunkRow[]; file: FileIndexMetadata };

const buildEmptyFileChunksBuckets = (records: FileIndexRecord[]): Map<string, FileChunksBucket> => {
  const chunksByFile = new Map<string, FileChunksBucket>();
  for (const fileRecord of records) {
    chunksByFile.set(fileRecord.id, { file: fileRecord.metadata, chunks: [] });
  }
  return chunksByFile;
};

interface PendingChunkToSemanticIndexRowArgs {
  pendingChunk: PendingEmbedChunk;
  embedding: Float32Array;
}

const pendingChunkToSemanticIndexRow = ({
  pendingChunk,
  embedding,
}: PendingChunkToSemanticIndexRowArgs): SemanticIndexChunkRow => ({
  chunkByteLength: Buffer.byteLength(pendingChunk.embedText, "utf8"),
  chunkId: pendingChunk.chunkId,
  chunkIndex: pendingChunk.chunkIndex,
  document: pendingChunk.embedText,
  embedding,
  endLine: pendingChunk.endLine,
  startLine: pendingChunk.startLine,
});

interface EmbedPendingIntoFileChunkBucketsArgs {
  chunksByFileId: Map<string, FileChunksBucket>;
  pendingChunks: PendingEmbedChunk[];
  repository: string;
}

type EmbedPendingIntoFileChunkBucketsOutcome = { ok: true } | { ok: false; result: CallToolResult };

const embedPendingIntoFileChunkBuckets = async ({
  chunksByFileId,
  pendingChunks,
  repository,
}: EmbedPendingIntoFileChunkBucketsArgs): Promise<EmbedPendingIntoFileChunkBucketsOutcome> => {
  let upsertBatchOrdinal = 0;

  for (let i = 0; i < pendingChunks.length; i += EMBED_BATCH_SIZE) {
    const slice = pendingChunks.slice(i, i + EMBED_BATCH_SIZE);
    const texts = slice.map((p) => p.embedText);
    const { embeddings, errorMessage } = await embedTextsWithLanguageModel(texts);
    if (isNotBlank(errorMessage)) {
      return { ok: false, result: buildMcpErrorResponse(`Semantic embedding error: ${errorMessage}`) };
    }

    upsertBatchOrdinal += 1;
    for (let j = 0; j < slice.length; j += 1) {
      const pendingChunk = slice[j];
      const embedding = embeddings[j];

      if (isNullish(pendingChunk) || isNullish(embedding)) {
        throw new Error(`Missing embedding for chunk ${pendingChunk?.chunkId ?? j}`);
      }

      const bucket = chunksByFileId.get(pendingChunk.fileRecord.id);
      if (isNullish(bucket)) {
        throw new Error(`Missing file bucket for ${pendingChunk.fileRecord.id}`);
      }

      bucket.chunks.push(pendingChunkToSemanticIndexRow({ pendingChunk, embedding }));
    }

    console.info(
      toString([
        `[${repository}] embed batch ${upsertBatchOrdinal}: +${slice.length} chunk(s)`,
        `(${Math.min(i + slice.length, pendingChunks.length)}/${pendingChunks.length})`,
      ])
    );
  }

  return { ok: true };
};

interface PersistSortedFileChunksToSemanticIndexArgs {
  chunksByFileId: Map<string, FileChunksBucket>;
  fileRecords: FileIndexRecord[];
}

const persistSortedFileChunksToSemanticIndex = ({
  chunksByFileId,
  fileRecords,
}: PersistSortedFileChunksToSemanticIndexArgs): void => {
  for (const fileRecord of fileRecords) {
    const fileChunksBucket = chunksByFileId.get(fileRecord.id);
    if (isNullish(fileChunksBucket)) {
      throw new Error(`Missing file chunks bucket for file ${fileRecord.id}`);
    }

    fileChunksBucket.chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
    workspaceSemanticIndexStore.replaceIndexedFile(fileChunksBucket);
  }
};

interface LogSemanticIndexUpsertProgressArgs {
  chunkCount: number;
  fileCount: number;
  repository: string;
}

const logSemanticIndexUpsertStart = ({
  chunkCount,
  fileCount,
  repository,
}: LogSemanticIndexUpsertProgressArgs): void => {
  if (fileCount === 0) {
    return;
  }

  console.info(
    toString([
      `[${repository}] semantic index: ${fileCount} file(s) → ${chunkCount} chunk(s);`,
      `embedding batches of up to ${EMBED_BATCH_SIZE}…`,
    ])
  );
};

const logSemanticIndexUpsertComplete = ({
  chunkCount,
  fileCount,
  repository,
}: LogSemanticIndexUpsertProgressArgs): void => {
  if (fileCount === 0) {
    return;
  }
  console.info(
    toString([`[${repository}] semantic index upsert complete: ${fileCount} file(s),`, `${chunkCount} chunk(s).`])
  );
};

const tryUpsertFileRecordsToSemanticIndex = async ({
  records,
  repository,
}: TryUpsertFileRecordsToSemanticIndexArgs): Promise<UpsertFileRecordsOutcome> => {
  const pendingChunks = buildPendingChunksForRecords(records);
  const chunkCount = pendingChunks.length;

  try {
    logSemanticIndexUpsertStart({ chunkCount, fileCount: records.length, repository });

    const chunksByFileId = buildEmptyFileChunksBuckets(records);
    const embedOutcome = await embedPendingIntoFileChunkBuckets({ chunksByFileId, pendingChunks, repository });
    if (!embedOutcome.ok) {
      return embedOutcome;
    }

    persistSortedFileChunksToSemanticIndex({ chunksByFileId, fileRecords: records });

    logSemanticIndexUpsertComplete({ chunkCount, fileCount: records.length, repository });
    return { ok: true, indexedChunkCount: chunkCount };
  } catch (e: unknown) {
    const errorMessage = getErrorMessage(e);
    console.error(`[tryUpsertFileRecordsToSemanticIndex]: upsert failed: ${errorMessage}`, e);
    return { ok: false, result: buildMcpErrorResponse(`Semantic index upsert error: ${errorMessage}`) };
  }
};

interface BuildPrepareRepositoryForSemanticSearchSuccessResponseArgs {
  exampleMatches: QueryOutcome;
  indexedChunkCount: number;
  indexedFileCount: number;
  repository: string;
}

const buildPrepareRepositoryForSemanticSearchSuccessResponse = ({
  exampleMatches,
  indexedChunkCount,
  indexedFileCount,
  repository,
}: BuildPrepareRepositoryForSemanticSearchSuccessResponseArgs): CallToolResult => {
  const payload = {
    collectionName: WORKSPACE_REPOSITORIES_FILES_COLLECTION,
    exampleQuery: {
      matches: exampleMatches,
      queryText: EXAMPLE_QUERY_TEXT,
    },
    indexedChunkCount,
    indexedFileCount,
    repository,
  };

  return buildMcpTextResponse(JSON.stringify(payload, null, 2));
};

interface RunRepositoryIndexingFlowArgs {
  repoRoot: string;
  repository: string;
}

type CollectIndexableFileRecordsOrErrorOutcome =
  | { ok: true; records: FileIndexRecord[] }
  | { ok: false; result: CallToolResult };

const collectIndexableFileRecordsOrError = async ({
  repoRoot,
  repository,
}: RunRepositoryIndexingFlowArgs): Promise<CollectIndexableFileRecordsOrErrorOutcome> => {
  const collectOutcome = await tryCollectFileRecords({ repoRoot, repository });
  if (!collectOutcome.ok) {
    return { ok: false, result: collectOutcome.result };
  }

  const { records } = collectOutcome;
  return { ok: true, records };
};

type UpsertRecordsAndRunExampleQueryOutcome =
  | { indexedChunkCount: number; ok: true; exampleMatches: QueryOutcome }
  | { ok: false; result: CallToolResult };

interface UpsertRecordsAndRunExampleQueryArgs {
  records: FileIndexRecord[];
  repository: string;
}

const upsertRecordsAndRunExampleQuery = async ({
  records,
  repository,
}: UpsertRecordsAndRunExampleQueryArgs): Promise<UpsertRecordsAndRunExampleQueryOutcome> => {
  const upsertOutcome = await tryUpsertFileRecordsToSemanticIndex({ records, repository });
  if (!upsertOutcome.ok) {
    return { ok: false, result: upsertOutcome.result };
  }

  const exampleMatches = await runExampleQueryForRepository({ repository });
  return { indexedChunkCount: upsertOutcome.indexedChunkCount, ok: true, exampleMatches };
};

type IndexRepositoryFlowOutcome =
  | { ok: true; indexedChunkCount: number; indexedFileCount: number; exampleMatches: QueryOutcome }
  | { ok: false; result: CallToolResult };

const runRepositoryIndexingFlow = async ({
  repoRoot,
  repository,
}: RunRepositoryIndexingFlowArgs): Promise<IndexRepositoryFlowOutcome> => {
  const collected = await collectIndexableFileRecordsOrError({ repoRoot, repository });

  if (!collected.ok) {
    return { ok: false, result: collected.result };
  }

  if (collected.records.length === 0) {
    return { indexedChunkCount: 0, indexedFileCount: 0, ok: true, exampleMatches: [] };
  }

  const indexed = await upsertRecordsAndRunExampleQuery({ records: collected.records, repository });
  if (!indexed.ok) {
    return { ok: false, result: indexed.result };
  }

  return {
    indexedChunkCount: indexed.indexedChunkCount,
    indexedFileCount: collected.records.length,
    ok: true,
    exampleMatches: indexed.exampleMatches,
  };
};

const resolveParentDirectoryForSemanticWorkspace = async (
  rootDir?: string
): Promise<{ parentDirectory: string } | { error: string }> => {
  const trimmedRoot = rootDir?.trim();

  if (trimmedRoot) {
    try {
      const parentDirectory = resolve(expandUserDirectory(trimmedRoot));
      const stats = await stat(parentDirectory);
      if (!stats.isDirectory()) {
        return { error: `rootDir is not a directory: ${parentDirectory}` };
      }
      return { parentDirectory };
    } catch (e: unknown) {
      const errorMessage = getErrorMessage(e);
      console.error(`[resolveParentDirectoryForSemanticWorkspace]: invalid rootDir ${trimmedRoot}: ${errorMessage}`, e);
      return { error: `Cannot access rootDir: ${errorMessage}` };
    }
  }

  const parentDirectory = resolveCodeCrawlerParentPath();
  if (!parentDirectory) {
    return { error: CODE_CRAWLER_ROOT_CONFIGURATION_ERROR_MESSAGE };
  }

  return { parentDirectory };
};

const textFromCallToolResult = (result: CallToolResult): string => {
  const block = result.content[0];
  if (block?.type === "text" && typeof block.text === "string") {
    return block.text;
  }

  return "Indexing failed (no message)";
};

export const prepareRepositoryForSemanticSearch = async (
  input: PrepareRepositoryForSemanticSearchInput
): Promise<CallToolResult> => {
  const { repository, rootDir } = input;

  const resolved = await resolveRepositoryUnderCodeCrawlerRoot(repository, rootDir);
  if ("error" in resolved) {
    return buildMcpErrorResponse(resolved.error);
  }

  const { absolutePath: repoRoot } = resolved;

  const flowOutcome = await runRepositoryIndexingFlow({ repoRoot, repository });
  if (!flowOutcome.ok) {
    return flowOutcome.result;
  }

  return buildPrepareRepositoryForSemanticSearchSuccessResponse({
    exampleMatches: flowOutcome.exampleMatches,
    indexedChunkCount: flowOutcome.indexedChunkCount,
    indexedFileCount: flowOutcome.indexedFileCount,
    repository,
  });
};

type RepoPrepareOk = { ok: true; indexedChunkCount: number; indexedFileCount: number; repository: string };
type RepoPrepareFail = { ok: false; error: string; repository: string };
type RepoPrepareResult = RepoPrepareOk | RepoPrepareFail;

export const prepareWorkspaceRepositoriesForSemanticSearch = async (
  input: PrepareWorkspaceRepositoriesForSemanticSearchInput
): Promise<CallToolResult> => {
  const { rootDir } = input;

  const parentResolved = await resolveParentDirectoryForSemanticWorkspace(rootDir);
  if ("error" in parentResolved) {
    return buildMcpErrorResponse(parentResolved.error);
  }
  const { parentDirectory } = parentResolved;

  const { repos, error } = await listGitRepoRootsUnderParent(parentDirectory);
  if (isNotBlank(error)) {
    return buildMcpErrorResponse(error);
  }

  const perRepoResults: RepoPrepareResult[] = [];

  for (const rel of repos) {
    const repoRoot = resolve(parentDirectory, rel);
    const repository = rel.split(/[/\\]/).join("/");

    const flowOutcome = await runRepositoryIndexingFlow({ repoRoot, repository });
    if (!flowOutcome.ok) {
      perRepoResults.push({ repository, ok: false, error: textFromCallToolResult(flowOutcome.result) });
      continue;
    }

    perRepoResults.push({
      repository,
      ok: true,
      indexedChunkCount: flowOutcome.indexedChunkCount,
      indexedFileCount: flowOutcome.indexedFileCount,
    });
  }

  const preparedCount = perRepoResults.filter((r) => r.ok).length;
  const failedCount = perRepoResults.filter((r) => !r.ok).length;
  const indexedFileCount = perRepoResults.reduce((sum, r) => sum + (r.ok ? r.indexedFileCount : 0), 0);
  const indexedChunkCount = perRepoResults.reduce((sum, r) => sum + (r.ok ? r.indexedChunkCount : 0), 0);

  const exampleMatches = await runWorkspaceSemanticQuery({ nResults: 5, queryText: EXAMPLE_QUERY_TEXT });

  const payload = {
    collectionName: WORKSPACE_REPOSITORIES_FILES_COLLECTION,
    exampleQuery: { matches: exampleMatches, queryText: EXAMPLE_QUERY_TEXT },
    parentDirectory,
    repositories: perRepoResults,
    totals: {
      failedCount,
      indexedChunkCount,
      indexedFileCount,
      preparedCount,
      repositoryCount: repos.length,
    },
  };

  return buildMcpTextResponse(JSON.stringify(payload, null, 2));
};

export const semanticSearchWorkspaceFiles = async (
  input: SemanticSearchWorkspaceFilesInput
): Promise<CallToolResult> => {
  const { nbResults, queryText, repository } = input;

  const outcome = await runWorkspaceSemanticQuery({ nResults: nbResults, queryText, repository });

  return buildMcpTextResponse(JSON.stringify({ queryText, outcome }, null, 2));
};

export const clearWorkspaceSemanticSearchIndex = async (): Promise<CallToolResult> => {
  workspaceSemanticIndexStore.clear();
  return buildMcpTextResponse("Workspace semantic index cleared");
};
