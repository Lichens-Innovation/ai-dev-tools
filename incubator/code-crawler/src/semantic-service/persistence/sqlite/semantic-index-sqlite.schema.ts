/**
 * SQLite schema for persistent semantic index (file index metadata + chunk rows, sqlite-vec KNN).
 * Vector dimension in {@link FILE_INDEX_CHUNK_VEC_NAME} is set at creation via {@link buildFileIndexChunkVecDdl}.
 */

/** Table of persisted file index metadata rows (one row per indexed file). */
export const SQL_TABLE_NAME_FILE_INDEX_METADATA = "FILE_INDEX_METADATA";

/** Chunk text + line spans; embeddings live in {@link FILE_INDEX_CHUNK_VEC_NAME}. */
export const SQL_TABLE_NAME_FILE_INDEX_CHUNK = "FILE_INDEX_CHUNK";

/**
 * SQLite table name for store-level key/value metadata (not per-file index rows).
 *
 * Persists global index invariants so reopening the database can validate configuration. Today
 * {@link META_KEY_EMBEDDING_DIM} records the embedding width used when the sqlite-vec virtual table
 * was created, so a mismatched model dimension fails fast instead of corrupting search. Values are
 * TEXT for simplicity. For new keys, add a `META_KEY_*` constant and handle it in the store layer.
 */
export const SQL_TABLE_NAME_FILE_INDEX_STORE_META = "FILE_INDEX_STORE_META";

/** vec0 virtual table name (must match {@link buildFileIndexChunkVecDdl}). */
export const FILE_INDEX_CHUNK_VEC_NAME = "FILE_INDEX_CHUNK_VEC";

/** FTS5 (BM25) over chunk `DOCUMENT`; external content keyed by chunk `ID`. */
export const FILE_INDEX_CHUNK_FTS_NAME = "FILE_INDEX_CHUNK_FTS";

/** Rebuild FTS index from `FILE_INDEX_CHUNK` (one-shot after creating FTS on a non-empty DB). */
export const SQL_FTS_CHUNK_REBUILD = `INSERT INTO ${FILE_INDEX_CHUNK_FTS_NAME}(${FILE_INDEX_CHUNK_FTS_NAME}) VALUES('rebuild');`;

export const SQL_TABLE_FILE_INDEX_CHUNK_FTS = `CREATE VIRTUAL TABLE IF NOT EXISTS ${FILE_INDEX_CHUNK_FTS_NAME} USING fts5(
  DOCUMENT,
  content='${SQL_TABLE_NAME_FILE_INDEX_CHUNK}',
  content_rowid='ID'
);`;

/**
 * Keeps FTS5 in sync when `content=` is used (SQLite FTS5 external content).
 * See SQLite FTS5 « external content » triggers — use `INSERT INTO fts(rowid, …)` on insert, and `'delete'` rows on delete/update.
 */
export const SQL_TRIGGERS_FILE_INDEX_CHUNK_FTS = [
  `CREATE TRIGGER IF NOT EXISTS TRG_${FILE_INDEX_CHUNK_FTS_NAME}_AI
   AFTER INSERT ON ${SQL_TABLE_NAME_FILE_INDEX_CHUNK}
   BEGIN
     INSERT INTO ${FILE_INDEX_CHUNK_FTS_NAME}(rowid, DOCUMENT) VALUES (NEW.ID, NEW.DOCUMENT);
   END;`,
  `CREATE TRIGGER IF NOT EXISTS TRG_${FILE_INDEX_CHUNK_FTS_NAME}_AD
   AFTER DELETE ON ${SQL_TABLE_NAME_FILE_INDEX_CHUNK}
   BEGIN
     INSERT INTO ${FILE_INDEX_CHUNK_FTS_NAME}(${FILE_INDEX_CHUNK_FTS_NAME}, rowid, DOCUMENT) VALUES('delete', OLD.ID, OLD.DOCUMENT);
   END;`,
  `CREATE TRIGGER IF NOT EXISTS TRG_${FILE_INDEX_CHUNK_FTS_NAME}_AU
   AFTER UPDATE ON ${SQL_TABLE_NAME_FILE_INDEX_CHUNK}
   BEGIN
     INSERT INTO ${FILE_INDEX_CHUNK_FTS_NAME}(${FILE_INDEX_CHUNK_FTS_NAME}, rowid, DOCUMENT) VALUES('delete', OLD.ID, OLD.DOCUMENT);
     INSERT INTO ${FILE_INDEX_CHUNK_FTS_NAME}(rowid, DOCUMENT) VALUES (NEW.ID, NEW.DOCUMENT);
   END;`,
].join("\n");

export const SQL_TABLE_FILE_INDEX_METADATA = `CREATE TABLE IF NOT EXISTS ${SQL_TABLE_NAME_FILE_INDEX_METADATA} (
  FILE_ID TEXT PRIMARY KEY NOT NULL,
  REPOSITORY TEXT NOT NULL,
  PATH_RELATIVE TEXT NOT NULL,
  FILENAME TEXT NOT NULL,
  FULL_PATH TEXT NOT NULL,
  CONTENT_SHA256 TEXT NOT NULL,
  LAST_MODIFIED_AT_ISO TEXT NOT NULL,
  SIZE_BYTES INTEGER NOT NULL,
  UNIQUE(REPOSITORY, PATH_RELATIVE)
);`;

export const SQL_TABLE_FILE_INDEX_CHUNK = `CREATE TABLE IF NOT EXISTS ${SQL_TABLE_NAME_FILE_INDEX_CHUNK} (
  ID INTEGER PRIMARY KEY NOT NULL,
  FILE_ID TEXT NOT NULL,
  CHUNK_INDEX INTEGER NOT NULL,
  CHUNK_ID TEXT NOT NULL UNIQUE,
  DOCUMENT TEXT NOT NULL,
  START_LINE INTEGER NOT NULL,
  END_LINE INTEGER NOT NULL,
  CHUNK_BYTE_LENGTH INTEGER NOT NULL,
  FOREIGN KEY (FILE_ID) REFERENCES ${SQL_TABLE_NAME_FILE_INDEX_METADATA}(FILE_ID) ON DELETE CASCADE
);`;

export const SQL_INDEX_FILE_INDEX_CHUNK_FILE_CHUNK_INDEX = `CREATE UNIQUE INDEX IF NOT EXISTS IDX_FILE_INDEX_CHUNK_FILE_CHUNK_INDEX
  ON ${SQL_TABLE_NAME_FILE_INDEX_CHUNK} (FILE_ID, CHUNK_INDEX);`;

export const SQL_TABLE_FILE_INDEX_STORE_META = `CREATE TABLE IF NOT EXISTS ${SQL_TABLE_NAME_FILE_INDEX_STORE_META} (
  KEY TEXT PRIMARY KEY NOT NULL,
  VALUE TEXT NOT NULL
);`;

export const META_KEY_EMBEDDING_DIM = "EMBEDDING_DIM";

/**
 * Declares float embedding column plus TEXT metadata for
 * repository-scoped KNN (sqlite-vec vec0).
 */
export const buildFileIndexChunkVecDdl = (embeddingDimensions: number): string =>
  `CREATE VIRTUAL TABLE IF NOT EXISTS ${FILE_INDEX_CHUNK_VEC_NAME} USING vec0(
  embedding float[${embeddingDimensions}],
  repository TEXT
);`;

/** Row from {@link SQL_TABLE_NAME_FILE_INDEX_METADATA} (columns align with app `FileIndexMetadata`). */
export interface DbFileIndexMetadataRow {
  CONTENT_SHA256: string;
  FILE_ID: string;
  FILENAME: string;
  FULL_PATH: string;
  LAST_MODIFIED_AT_ISO: string;
  PATH_RELATIVE: string;
  REPOSITORY: string;
  SIZE_BYTES: number;
}

export interface DbFileIndexChunkRow {
  CHUNK_BYTE_LENGTH: number;
  CHUNK_ID: string;
  CHUNK_INDEX: number;
  DOCUMENT: string;
  END_LINE: number;
  FILE_ID: string;
  ID: number;
  START_LINE: number;
}

/** Row shape returned by KNN join queries (distance from sqlite-vec). */
export interface DbFileIndexKnnRow extends DbFileIndexChunkRow {
  CONTENT_SHA256: string;
  FILENAME: string;
  FULL_PATH: string;
  LAST_MODIFIED_AT_ISO: string;
  PATH_RELATIVE: string;
  REPOSITORY: string;
  SIZE_BYTES: number;
  distance: number;
}

/** Row shape returned by FTS5 BM25 join queries. */
export interface DbFileIndexLexicalRow extends DbFileIndexChunkRow {
  CONTENT_SHA256: string;
  FILENAME: string;
  FULL_PATH: string;
  LAST_MODIFIED_AT_ISO: string;
  PATH_RELATIVE: string;
  REPOSITORY: string;
  SIZE_BYTES: number;
  bm25_score: number;
}
