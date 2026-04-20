import type { FileIndexMetadata, QueryMatchSummary } from "./semantic-search.types";

/**
 * All reads/writes of the semantic search index should go through {@link SemanticIndexStore}.
 *
 * **Persistence:** `SqliteSemanticIndexStore` / `workspaceSemanticIndexStore` in `sqlite-semantic-index.store.ts` (SQLite + sqlite-vec).
 * CRUD: {@link SemanticIndexStore.clear}, {@link SemanticIndexStore.replaceIndexedFile}, {@link SemanticIndexStore.queryNearest},
 * {@link SemanticIndexStore.getFileMetadataByFileId}.
 */
export interface SemanticIndexChunkRow {
  chunkByteLength: number;
  chunkId: string;
  chunkIndex: number;
  document: string;
  embedding: Float32Array;
  endLine: number;
  startLine: number;
}

export interface ReplaceIndexedFilePayload {
  chunks: SemanticIndexChunkRow[];
  file: FileIndexMetadata;
}

export interface QueryNearestArgs {
  nResults: number;
  queryEmbedding: Float32Array;
  repository?: string;
}

export interface SemanticIndexStore {
  clear(): void;

  getFileMetadataByFileId(fileId: string): FileIndexMetadata | null;

  queryNearest(queryNearestArgs: QueryNearestArgs): QueryMatchSummary[];

  replaceIndexedFile(payload: ReplaceIndexedFilePayload): void;
}
