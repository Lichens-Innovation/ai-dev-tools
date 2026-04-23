import { getErrorMessage, isNotBlank, isNullish } from "@lichens-innovation/ts-common";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { buildMcpErrorResponse } from "../../mcp/mcp-server.utils";
import { toString } from "../../utils/arrays.utils";
import { getCodeCrawlerChunkMaxChars, getCodeCrawlerEmbedBatchSize } from "../../utils/env.utils";
import { buildSemanticGraphChunksForSource } from "../chunking/graph-chunks-for-typescript";
import { embedTextsWithLanguageModel } from "../language-model-embedding.pipeline";
import type { FileIndexMetadata, FileIndexRecord } from "../types/index-domain.types";
import type { SemanticIndexChunkRow, SemanticIndexStore } from "../types/store.types";

interface PendingEmbedChunk {
  chunkId: string;
  chunkIndex: number;
  embedText: string;
  endLine: number;
  fileRecord: FileIndexRecord;
  startLine: number;
}

interface PartitionRecordsNeedingSemanticUpsertArgs {
  records: FileIndexRecord[];
  store: SemanticIndexStore;
}

interface PartitionRecordsNeedingSemanticUpsertResult {
  recordsToUpsert: FileIndexRecord[];
  skippedUnchangedFileCount: number;
}

const partitionRecordsNeedingSemanticUpsert = ({
  records,
  store,
}: PartitionRecordsNeedingSemanticUpsertArgs): PartitionRecordsNeedingSemanticUpsertResult => {
  const recordsToUpsert: FileIndexRecord[] = [];
  let skippedUnchangedFileCount = 0;

  for (const record of records) {
    const existing = store.getFileMetadataByFileId(record.id);
    if (!isNullish(existing) && existing.contentSha256 === record.metadata.contentSha256) {
      skippedUnchangedFileCount += 1;
    } else {
      recordsToUpsert.push(record);
    }
  }

  return { recordsToUpsert, skippedUnchangedFileCount };
};

const buildPendingChunksForRecords = (records: FileIndexRecord[]): PendingEmbedChunk[] => {
  const pending: PendingEmbedChunk[] = [];

  for (const fileRecord of records) {
    const { pathRelative, repository } = fileRecord.metadata;
    const astChunks = buildSemanticGraphChunksForSource({
      maxEmbedUtf8Bytes: getCodeCrawlerChunkMaxChars(),
      pathRelative,
      repository,
      source: fileRecord.document,
    });

    astChunks.forEach((chunk) => {
      pending.push({
        chunkId: `${fileRecord.id}#${chunk.chunkIndex}`,
        chunkIndex: chunk.chunkIndex,
        embedText: chunk.embedText,
        endLine: chunk.endLine,
        fileRecord,
        startLine: chunk.startLine,
      });
    });
  }
  return pending;
};

interface FileChunksBucket {
  chunks: SemanticIndexChunkRow[];
  file: FileIndexMetadata;
}

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

interface EmbedPendingIntoFileChunkBucketsOk {
  ok: true;
}

interface EmbedPendingIntoFileChunkBucketsFail {
  ok: false;
  result: CallToolResult;
}

type EmbedPendingIntoFileChunkBucketsOutcome =
  | EmbedPendingIntoFileChunkBucketsOk
  | EmbedPendingIntoFileChunkBucketsFail;

const embedPendingIntoFileChunkBuckets = async ({
  chunksByFileId,
  pendingChunks,
  repository,
}: EmbedPendingIntoFileChunkBucketsArgs): Promise<EmbedPendingIntoFileChunkBucketsOutcome> => {
  let upsertBatchOrdinal = 0;
  const embedBatchSize = getCodeCrawlerEmbedBatchSize();

  for (let i = 0; i < pendingChunks.length; i += embedBatchSize) {
    const slice = pendingChunks.slice(i, i + embedBatchSize);
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
  store: SemanticIndexStore;
}

const persistSortedFileChunksToSemanticIndex = ({
  chunksByFileId,
  fileRecords,
  store,
}: PersistSortedFileChunksToSemanticIndexArgs): void => {
  for (const fileRecord of fileRecords) {
    const fileChunksBucket = chunksByFileId.get(fileRecord.id);
    if (isNullish(fileChunksBucket)) {
      throw new Error(`Missing file chunks bucket for file ${fileRecord.id}`);
    }

    fileChunksBucket.chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
    store.replaceIndexedFile(fileChunksBucket);
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

  const embedBatchSize = getCodeCrawlerEmbedBatchSize();
  console.info(
    toString([
      `[${repository}] semantic index: ${fileCount} file(s) → ${chunkCount} chunk(s);`,
      `embedding batches of up to ${embedBatchSize}…`,
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

interface TryUpsertFileRecordsToSemanticIndexArgs {
  records: FileIndexRecord[];
  repository: string;
  store: SemanticIndexStore;
}

interface UpsertFileRecordsOk {
  ok: true;
  indexedChunkCount: number;
  skippedUnchangedFileCount: number;
}

interface UpsertFileRecordsFail {
  ok: false;
  result: CallToolResult;
}

type UpsertFileRecordsOutcome = UpsertFileRecordsOk | UpsertFileRecordsFail;

export const tryUpsertFileRecordsToSemanticIndex = async ({
  records,
  repository,
  store,
}: TryUpsertFileRecordsToSemanticIndexArgs): Promise<UpsertFileRecordsOutcome> => {
  const { recordsToUpsert, skippedUnchangedFileCount } = partitionRecordsNeedingSemanticUpsert({
    records,
    store,
  });

  if (skippedUnchangedFileCount > 0) {
    console.info(`[${repository}] skipping ${skippedUnchangedFileCount} unchanged file(s)`);
  }

  if (recordsToUpsert.length === 0) {
    return { indexedChunkCount: 0, ok: true, skippedUnchangedFileCount };
  }

  const pendingChunks = buildPendingChunksForRecords(recordsToUpsert);
  const chunkCount = pendingChunks.length;

  try {
    logSemanticIndexUpsertStart({ chunkCount, fileCount: recordsToUpsert.length, repository });

    const chunksByFileId = buildEmptyFileChunksBuckets(recordsToUpsert);
    const embedOutcome = await embedPendingIntoFileChunkBuckets({ chunksByFileId, pendingChunks, repository });
    if (!embedOutcome.ok) {
      return embedOutcome;
    }

    persistSortedFileChunksToSemanticIndex({ chunksByFileId, fileRecords: recordsToUpsert, store });

    logSemanticIndexUpsertComplete({ chunkCount, fileCount: recordsToUpsert.length, repository });
    return { indexedChunkCount: chunkCount, ok: true, skippedUnchangedFileCount };
  } catch (e: unknown) {
    const errorMessage = getErrorMessage(e);
    console.error(`[tryUpsertFileRecordsToSemanticIndex]: upsert failed: ${errorMessage}`, e);
    return { ok: false, result: buildMcpErrorResponse(`Semantic index upsert error: ${errorMessage}`) };
  }
};
