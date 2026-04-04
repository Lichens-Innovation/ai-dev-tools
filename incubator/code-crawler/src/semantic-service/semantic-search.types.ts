/** Shared types for semantic indexing and MCP tool payloads (kept separate from store/utils to avoid circular imports). */

export type FileIndexMetadata = {
  contentSha256: string;
  /** Stable id: repository + "::" + path relative POSIX. */
  fileId: string;
  filename: string;
  fullPath: string;
  lastModifiedAtISO: string;
  /** Path relative to repository root (POSIX). */
  pathRelative: string;
  repository: string;
  /** Full file size on disk in bytes. */
  sizeBytes: number;
};

export type FileIndexRecord = {
  document: string;
  id: string;
  metadata: FileIndexMetadata;
};

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
}

export type QueryOutcome = QueryMatchSummary[] | { error: string };
