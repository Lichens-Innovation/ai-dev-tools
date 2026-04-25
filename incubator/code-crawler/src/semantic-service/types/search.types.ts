import type { FileIndexMetadata } from "./index-domain.types";

export interface QueryMatchSummary {
  chunkIndex: number;
  distance: number;
  documentPreview: string;
  /** Stable file id (same as metadata.fileId). */
  fileId: string;
  /** Unique chunk row id (e.g. fileId + "#" + chunkIndex). */
  id: string;
  metadata: FileIndexMetadata;
  endLine: number;
  startLine: number;
  /** When consolidating by file: how many chunk hits from the raw KNN list contributed to this row. */
  relatedChunkCount?: number;
}

export interface QueryOutcomeError {
  error: string;
}

export type QueryOutcome = QueryMatchSummary[] | QueryOutcomeError;
