/** Indexed file identity and content envelope (one row per source file before chunking). */

export interface FileIndexMetadata {
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
}

export interface FileIndexRecord {
  document: string;
  id: string;
  metadata: FileIndexMetadata;
}
