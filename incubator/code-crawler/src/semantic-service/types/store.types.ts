import type { FileIndexMetadata } from "./index-domain.types";
import type { QueryMatchSummary } from "./search.types";

/**
 * All reads/writes of the semantic search index should go through {@link SemanticIndexStore}.
 *
 * **Persistence:** `SqliteSemanticIndexStore` / `workspaceSemanticIndexStore` (SQLite + sqlite-vec).
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

/** Lexical full-text search over indexed chunk bodies (FTS5 BM25). */
export interface QueryLexicalChunksArgs {
  /** Raw user query; sanitized to an FTS5 `MATCH` string inside the store. */
  queryText: string;
  nResults: number;
  repository?: string;
}

export interface SemanticIndexStore {
  clear(): void;

  getFileMetadataByFileId(fileId: string): FileIndexMetadata | null;

  queryLexicalChunks(args: QueryLexicalChunksArgs): QueryMatchSummary[];

  queryNearest(queryNearestArgs: QueryNearestArgs): QueryMatchSummary[];

  replaceIndexedFile(payload: ReplaceIndexedFilePayload): void;
}
