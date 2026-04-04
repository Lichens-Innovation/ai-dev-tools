import type { FileIndexMetadata, QueryMatchSummary } from "./semantic-search.types";

/**
 * All reads/writes of the semantic search index should go through {@link SemanticIndexStore}.
 *
 * **Persistence:** `SqliteSemanticIndexStore` / `workspaceSemanticIndexStore` in `sqlite-semantic-index.store.ts` (SQLite + sqlite-vec).
 * CRUD: {@link SemanticIndexStore.clear}, {@link SemanticIndexStore.replaceIndexedFile}, {@link SemanticIndexStore.queryNearest}.
 */
export type SemanticIndexChunkRow = {
  chunkByteLength: number;
  chunkId: string;
  chunkIndex: number;
  document: string;
  embedding: Float32Array;
  endLine: number;
  startLine: number;
};

export type ReplaceIndexedFilePayload = {
  chunks: SemanticIndexChunkRow[];
  file: FileIndexMetadata;
};

export interface SemanticIndexStore {
  clear(): void;

  queryNearest(params: { nResults: number; queryEmbedding: Float32Array; repository?: string }): QueryMatchSummary[];

  replaceIndexedFile(payload: ReplaceIndexedFilePayload): void;
}
