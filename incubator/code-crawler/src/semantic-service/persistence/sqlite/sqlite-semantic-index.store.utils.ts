import { isNullish } from "@lichens-innovation/ts-common";
import type Database from "better-sqlite3";
import { Buffer } from "node:buffer";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { FileIndexMetadata } from "../../types/index-domain.types";
import type { SourceLanguageId } from "../../types/source-language.types";
import {
  FILE_INDEX_CHUNK_FTS_NAME,
  FILE_INDEX_CHUNK_VEC_NAME,
  SQL_FTS_CHUNK_REBUILD,
  SQL_TABLE_FILE_INDEX_CHUNK_FTS,
  SQL_TABLE_NAME_FILE_INDEX_CHUNK,
  SQL_TABLE_NAME_FILE_INDEX_STORE_META,
  SQL_TRIGGERS_FILE_INDEX_CHUNK_FTS,
  type DbFileIndexMetadataRow,
} from "./semantic-index-sqlite.schema";

/**
 * sqlite-vec KNN returns L2 distance for float embeddings. With L2-normalized model outputs,
 * cosine distance (1 − dot) equals L2²/2 — same ranking as exact cosine distance on L2-normalized vectors.
 */
export const sqliteVecDistanceToCosineDistance = (l2: number): number => (l2 * l2) / 2;

/** Compact float32 payload for sqlite-vec (avoids binding bugs when mixing integers and vectors in one INSERT). */
export const float32ToSqliteBlob = (floatArray: Float32Array): Buffer =>
  Buffer.from(floatArray.buffer, floatArray.byteOffset, floatArray.byteLength);

export const toIntegerRowId = (lastInsertRowid: number | bigint): number => {
  if (typeof lastInsertRowid === "bigint") {
    const min = BigInt(Number.MIN_SAFE_INTEGER);
    const max = BigInt(Number.MAX_SAFE_INTEGER);

    if (lastInsertRowid < min || lastInsertRowid > max) {
      throw new RangeError(`lastInsertRowid ${lastInsertRowid.toString()} is outside Number safe integer range`);
    }

    return Number(lastInsertRowid);
  }

  return lastInsertRowid;
};

const isMemoryDbPath = (dbPath: string): boolean =>
  ["", ":memory:"].includes(dbPath) || dbPath.startsWith("file::memory:");

export const ensureDbParentDirectory = (dbPath: string): void => {
  if (isMemoryDbPath(dbPath)) {
    return;
  }

  const dir = path.dirname(dbPath);
  if (dir.length > 0) {
    mkdirSync(dir, { recursive: true });
  }
};

export const vecTableExists = (db: Database.Database): boolean => {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(FILE_INDEX_CHUNK_VEC_NAME) as { name: string } | undefined;
  return !isNullish(row);
};

interface ReadMetaValueArgs {
  db: Database.Database;
  key: string;
}

export const readMetaValue = ({ db, key }: ReadMetaValueArgs): string => {
  interface DbMetaRow {
    VALUE: string;
  }
  const row = db
    .prepare(`SELECT VALUE FROM ${SQL_TABLE_NAME_FILE_INDEX_STORE_META} WHERE KEY = ?`)
    .get(key) as DbMetaRow;

  return row?.VALUE ?? "";
};

interface WriteMetaValueArgs {
  db: Database.Database;
  key: string;
  value: string;
}

export const writeMetaValue = ({ db, key, value }: WriteMetaValueArgs): void => {
  db.prepare(`INSERT OR REPLACE INTO ${SQL_TABLE_NAME_FILE_INDEX_STORE_META} (KEY, VALUE) VALUES (?, ?)`).run(
    key,
    value
  );
};

export const countSemanticChunks = (db: Database.Database): number => {
  interface DbCountRow {
    n: number;
  }
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${SQL_TABLE_NAME_FILE_INDEX_CHUNK}`).get() as DbCountRow;
  return row?.n ?? 0;
};

const ftsChunkTableExists = (db: Database.Database): boolean => {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(FILE_INDEX_CHUNK_FTS_NAME) as { name: string } | undefined;
  return !isNullish(row);
};

const countFtsIndexedRows = (db: Database.Database): number => {
  interface DbCountRow {
    n: number;
  }
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${FILE_INDEX_CHUNK_FTS_NAME}`).get() as DbCountRow;
  return row?.n ?? 0;
};

/**
 * Creates FTS5 + triggers when missing; `rebuild` when chunks exist but the FTS index is empty
 * (e.g. reused local DB file). Idempotent.
 */
export const ensureFts5SchemaOnDb = (db: Database.Database): void => {
  if (!ftsChunkTableExists(db)) {
    db.exec(SQL_TABLE_FILE_INDEX_CHUNK_FTS);
    db.exec(SQL_TRIGGERS_FILE_INDEX_CHUNK_FTS);
    if (countSemanticChunks(db) > 0) {
      db.exec(SQL_FTS_CHUNK_REBUILD);
    }
    return;
  }

  db.exec(SQL_TRIGGERS_FILE_INDEX_CHUNK_FTS);
  const n = countSemanticChunks(db);
  if (n > 0 && countFtsIndexedRows(db) === 0) {
    db.exec(SQL_FTS_CHUNK_REBUILD);
  }
};

export const dbMetadataRowToFileIndexMetadata = (row: DbFileIndexMetadataRow): FileIndexMetadata => ({
  contentSha256: row.CONTENT_SHA256,
  fileId: row.FILE_ID,
  filename: row.FILENAME,
  fullPath: row.FULL_PATH,
  lastModifiedAtISO: row.LAST_MODIFIED_AT_ISO,
  pathRelative: row.PATH_RELATIVE,
  repository: row.REPOSITORY,
  sizeBytes: row.SIZE_BYTES,
  sourceLanguage: row.SOURCE_LANGUAGE as SourceLanguageId,
});
