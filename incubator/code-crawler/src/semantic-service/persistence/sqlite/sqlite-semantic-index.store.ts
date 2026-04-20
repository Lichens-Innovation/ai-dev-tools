import { isBlank, isNullish } from "@lichens-innovation/ts-common";
import Database from "better-sqlite3";
import { Buffer } from "node:buffer";
import { mkdirSync } from "node:fs";
import path from "node:path";
import * as sqliteVec from "sqlite-vec";
import { EnvNames, getEmbeddingDimensions, resolveSemanticIndexDbPath } from "../../../utils/env.utils";
import type { FileIndexMetadata } from "../../types/index-domain.types";
import type { QueryMatchSummary } from "../../types/search.types";
import type { QueryNearestArgs, ReplaceIndexedFilePayload, SemanticIndexStore } from "../../types/store.types";
import {
  FILE_INDEX_CHUNK_VEC_NAME,
  META_KEY_EMBEDDING_DIM,
  SQL_INDEX_FILE_INDEX_CHUNK_FILE_CHUNK_INDEX,
  SQL_TABLE_FILE_INDEX_CHUNK,
  SQL_TABLE_FILE_INDEX_METADATA,
  SQL_TABLE_FILE_INDEX_STORE_META,
  SQL_TABLE_NAME_FILE_INDEX_CHUNK,
  SQL_TABLE_NAME_FILE_INDEX_METADATA,
  SQL_TABLE_NAME_FILE_INDEX_STORE_META,
  buildFileIndexChunkVecDdl,
  type DbFileIndexKnnRow,
  type DbFileIndexMetadataRow,
} from "./semantic-index-sqlite.schema";

/**
 * sqlite-vec KNN returns L2 distance for float embeddings. With L2-normalized model outputs,
 * cosine distance (1 − dot) equals L2²/2 — same ranking as exact cosine distance on L2-normalized vectors.
 */
const sqliteVecDistanceToCosineDistance = (l2: number): number => (l2 * l2) / 2;

/** Compact float32 payload for sqlite-vec (avoids binding bugs when mixing integers and vectors in one INSERT). */
const float32ToSqliteBlob = (v: Float32Array): Buffer => Buffer.from(v.buffer, v.byteOffset, v.byteLength);

const toIntegerRowId = (lastInsertRowid: number | bigint): number => {
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
  dbPath === ":memory:" || dbPath === "" || dbPath.startsWith("file::memory:");

const ensureDbParentDirectory = (dbPath: string): void => {
  if (isMemoryDbPath(dbPath)) {
    return;
  }

  const dir = path.dirname(dbPath);
  if (dir.length > 0) {
    mkdirSync(dir, { recursive: true });
  }
};

const vecTableExists = (db: Database.Database): boolean => {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(FILE_INDEX_CHUNK_VEC_NAME) as { name: string } | undefined;
  return !isNullish(row);
};

interface ReadMetaValueArgs {
  db: Database.Database;
  key: string;
}
const readMetaValue = ({ db, key }: ReadMetaValueArgs): string => {
  type DbMetaRow = { VALUE: string };
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
const writeMetaValue = ({ db, key, value }: WriteMetaValueArgs): void => {
  db.prepare(`INSERT OR REPLACE INTO ${SQL_TABLE_NAME_FILE_INDEX_STORE_META} (KEY, VALUE) VALUES (?, ?)`).run(
    key,
    value
  );
};

const countSemanticChunks = (db: Database.Database): number => {
  type DbCountRow = { n: number };
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${SQL_TABLE_NAME_FILE_INDEX_CHUNK}`).get() as DbCountRow;
  return row?.n ?? 0;
};

const dbMetadataRowToFileIndexMetadata = (row: DbFileIndexMetadataRow): FileIndexMetadata => ({
  contentSha256: row.CONTENT_SHA256,
  fileId: row.FILE_ID,
  filename: row.FILENAME,
  fullPath: row.FULL_PATH,
  lastModifiedAtISO: row.LAST_MODIFIED_AT_ISO,
  pathRelative: row.PATH_RELATIVE,
  repository: row.REPOSITORY,
  sizeBytes: row.SIZE_BYTES,
});

export class SqliteSemanticIndexStore implements SemanticIndexStore {
  private readonly db: Database.Database;
  private readonly embeddingDimensions: number;
  private readonly stmtSelectChunkRowidsByFileId: Database.Statement<[string], { ID: number }>;
  private readonly stmtDeleteVecByRowid: Database.Statement<[number], unknown>;
  private readonly stmtDeleteChunksByFileId: Database.Statement<[string], unknown>;
  private readonly stmtDeleteFileById: Database.Statement<[string], unknown>;
  private readonly stmtInsertFile: Database.Statement<
    [string, string, string, string, string, string, string, number],
    Database.RunResult
  >;
  private readonly stmtInsertChunk: Database.Statement<
    [number, string, number, string, string, number, number, number],
    Database.RunResult
  >;
  private readonly stmtInsertVec: Database.Statement<[Buffer, string], Database.RunResult>;
  private readonly stmtKnnAllRepos: Database.Statement<[Float32Array, number], DbFileIndexKnnRow>;
  private readonly stmtKnnByRepository: Database.Statement<[Float32Array, number, string], DbFileIndexKnnRow>;
  private readonly stmtDeleteAllVec: Database.Statement<[], unknown>;
  private readonly stmtDeleteAllChunks: Database.Statement<[], unknown>;
  private readonly stmtDeleteAllFiles: Database.Statement<[], unknown>;
  private readonly stmtSelectFileMetadataByFileId: Database.Statement<[string], DbFileIndexMetadataRow>;

  constructor(dbPath: string, embeddingDimensions: number) {
    ensureDbParentDirectory(dbPath);

    this.embeddingDimensions = embeddingDimensions;

    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    sqliteVec.load(this.db);

    this.db.exec(SQL_TABLE_FILE_INDEX_STORE_META);
    this.db.exec(SQL_TABLE_FILE_INDEX_METADATA);
    this.db.exec(SQL_TABLE_FILE_INDEX_CHUNK);
    this.db.exec(SQL_INDEX_FILE_INDEX_CHUNK_FILE_CHUNK_INDEX);

    this.ensureVecSchema();

    this.stmtSelectChunkRowidsByFileId = this.db.prepare(
      `SELECT ID FROM ${SQL_TABLE_NAME_FILE_INDEX_CHUNK} WHERE FILE_ID = ?`
    );
    this.stmtDeleteVecByRowid = this.db.prepare(`DELETE FROM ${FILE_INDEX_CHUNK_VEC_NAME} WHERE rowid = ?`);
    this.stmtDeleteChunksByFileId = this.db.prepare(`DELETE FROM ${SQL_TABLE_NAME_FILE_INDEX_CHUNK} WHERE FILE_ID = ?`);
    this.stmtDeleteFileById = this.db.prepare(`DELETE FROM ${SQL_TABLE_NAME_FILE_INDEX_METADATA} WHERE FILE_ID = ?`);
    this.stmtInsertFile = this.db.prepare(
      `INSERT INTO ${SQL_TABLE_NAME_FILE_INDEX_METADATA} (FILE_ID, REPOSITORY, PATH_RELATIVE, FILENAME, FULL_PATH, CONTENT_SHA256, LAST_MODIFIED_AT_ISO, SIZE_BYTES)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    this.stmtInsertChunk = this.db.prepare(
      `INSERT INTO ${SQL_TABLE_NAME_FILE_INDEX_CHUNK} (ID, FILE_ID, CHUNK_INDEX, CHUNK_ID, DOCUMENT, START_LINE, END_LINE, CHUNK_BYTE_LENGTH)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    this.stmtInsertVec = this.db.prepare(
      `INSERT INTO ${FILE_INDEX_CHUNK_VEC_NAME} (embedding, repository) VALUES (?, ?)`
    );

    const knnSelectBase = `
      SELECT
        c.ID,
        c.FILE_ID,
        c.CHUNK_INDEX,
        c.CHUNK_ID,
        c.DOCUMENT,
        c.START_LINE,
        c.END_LINE,
        c.CHUNK_BYTE_LENGTH,
        f.REPOSITORY,
        f.PATH_RELATIVE,
        f.FILENAME,
        f.FULL_PATH,
        f.CONTENT_SHA256,
        f.LAST_MODIFIED_AT_ISO,
        f.SIZE_BYTES,
        v.distance AS distance
      FROM ${FILE_INDEX_CHUNK_VEC_NAME} AS v
      INNER JOIN ${SQL_TABLE_NAME_FILE_INDEX_CHUNK} AS c ON c.ID = v.rowid
      INNER JOIN ${SQL_TABLE_NAME_FILE_INDEX_METADATA} AS f ON f.FILE_ID = c.FILE_ID`;

    this.stmtKnnAllRepos = this.db.prepare<[Float32Array, number], DbFileIndexKnnRow>(`${knnSelectBase}
      WHERE v.embedding MATCH ?
        AND k = ?
      ORDER BY v.distance`);

    this.stmtKnnByRepository = this.db.prepare<[Float32Array, number, string], DbFileIndexKnnRow>(`${knnSelectBase}
      WHERE v.embedding MATCH ?
        AND k = ?
        AND v.repository = ?
      ORDER BY v.distance`);

    this.stmtDeleteAllVec = this.db.prepare(`DELETE FROM ${FILE_INDEX_CHUNK_VEC_NAME}`);
    this.stmtDeleteAllChunks = this.db.prepare(`DELETE FROM ${SQL_TABLE_NAME_FILE_INDEX_CHUNK}`);
    this.stmtDeleteAllFiles = this.db.prepare(`DELETE FROM ${SQL_TABLE_NAME_FILE_INDEX_METADATA}`);
    this.stmtSelectFileMetadataByFileId = this.db.prepare(
      `SELECT FILE_ID, REPOSITORY, PATH_RELATIVE, FILENAME, FULL_PATH, CONTENT_SHA256, LAST_MODIFIED_AT_ISO, SIZE_BYTES
       FROM ${SQL_TABLE_NAME_FILE_INDEX_METADATA}
       WHERE FILE_ID = ?`
    );
  }

  private ensureVecSchema(): void {
    const dim = this.embeddingDimensions;
    const hasVectorTable = vecTableExists(this.db);
    const storedDimRaw = readMetaValue({ db: this.db, key: META_KEY_EMBEDDING_DIM });
    const storedDim = isBlank(storedDimRaw) ? undefined : Number.parseInt(storedDimRaw, 10);

    if (hasVectorTable) {
      if (!isNullish(storedDim) && storedDim !== dim) {
        throw new Error(
          `[Store] stored ${META_KEY_EMBEDDING_DIM}=${storedDim} conflicts with configured ${dim}; use a new DB file or matching ${EnvNames.embeddingDim}.`
        );
      }

      if (isNullish(storedDim)) {
        const n = countSemanticChunks(this.db);
        if (n > 0) {
          throw new Error(
            `[Store] ${FILE_INDEX_CHUNK_VEC_NAME} exists without ${META_KEY_EMBEDDING_DIM} meta and ${SQL_TABLE_NAME_FILE_INDEX_CHUNK} is non-empty; repair or delete the database file.`
          );
        }
        writeMetaValue({ db: this.db, key: META_KEY_EMBEDDING_DIM, value: String(dim) });
      }

      return;
    }

    if (!isNullish(storedDim) && storedDim !== dim) {
      throw new Error(`[Store] meta ${META_KEY_EMBEDDING_DIM}=${storedDim} conflicts with configured ${dim}.`);
    }

    const chunkCount = countSemanticChunks(this.db);
    if (chunkCount > 0) {
      throw new Error(
        `[Store] ${SQL_TABLE_NAME_FILE_INDEX_CHUNK} has ${chunkCount} row(s) but ${FILE_INDEX_CHUNK_VEC_NAME} is missing; cannot auto-repair.`
      );
    }

    this.db.exec(buildFileIndexChunkVecDdl(dim));
    writeMetaValue({ db: this.db, key: META_KEY_EMBEDDING_DIM, value: String(dim) });
  }

  clear(): void {
    const run = (): void => {
      this.stmtDeleteAllVec.run();
      this.stmtDeleteAllChunks.run();
      this.stmtDeleteAllFiles.run();
    };

    this.db.transaction(run)();
  }

  replaceIndexedFile(payload: ReplaceIndexedFilePayload): void {
    const { file, chunks } = payload;
    if (chunks.length === 0) {
      throw new Error("[Store.replaceIndexedFile] chunks must not be empty");
    }

    const run = (): void => {
      const existingRows = this.stmtSelectChunkRowidsByFileId.all(file.fileId);
      for (const row of existingRows) {
        this.stmtDeleteVecByRowid.run(row.ID);
      }
      this.stmtDeleteChunksByFileId.run(file.fileId);
      this.stmtDeleteFileById.run(file.fileId);

      this.stmtInsertFile.run(
        file.fileId,
        file.repository,
        file.pathRelative,
        file.filename,
        file.fullPath,
        file.contentSha256,
        file.lastModifiedAtISO,
        file.sizeBytes
      );

      for (const ch of chunks) {
        if (ch.embedding.length !== this.embeddingDimensions) {
          throw new Error(`[Store] embedding length ${ch.embedding.length} !== ${this.embeddingDimensions}`);
        }

        const vecInsert = this.stmtInsertVec.run(float32ToSqliteBlob(ch.embedding), file.repository);
        const rowId = toIntegerRowId(vecInsert.lastInsertRowid);
        this.stmtInsertChunk.run(
          rowId,
          file.fileId,
          ch.chunkIndex,
          ch.chunkId,
          ch.document,
          ch.startLine,
          ch.endLine,
          ch.chunkByteLength
        );
      }
    };

    this.db.transaction(run)();
  }

  getFileMetadataByFileId(fileId: string): FileIndexMetadata | null {
    const row = this.stmtSelectFileMetadataByFileId.get(fileId) as DbFileIndexMetadataRow | undefined;
    if (isNullish(row)) {
      return null;
    }
    return dbMetadataRowToFileIndexMetadata(row);
  }

  queryNearest(params: QueryNearestArgs): QueryMatchSummary[] {
    const { nResults, queryEmbedding, repository } = params;
    if (nResults < 1) {
      return [];
    }

    if (queryEmbedding.length !== this.embeddingDimensions) {
      throw new Error(`[queryNearest] query embedding length ${queryEmbedding.length} !== ${this.embeddingDimensions}`);
    }

    const rows: DbFileIndexKnnRow[] = isBlank(repository)
      ? this.stmtKnnAllRepos.all(queryEmbedding, nResults)
      : this.stmtKnnByRepository.all(queryEmbedding, nResults, repository);

    return rows.map(
      (row): QueryMatchSummary => ({
        chunkIndex: row.CHUNK_INDEX,
        distance: sqliteVecDistanceToCosineDistance(row.distance),
        documentPreview: row.DOCUMENT,
        fileId: row.FILE_ID,
        id: row.CHUNK_ID,
        startLine: row.START_LINE,
        endLine: row.END_LINE,
        metadata: dbMetadataRowToFileIndexMetadata(row),
      })
    );
  }

  close(): void {
    try {
      this.db.close();
    } catch (error) {
      console.error("[SqliteSemanticIndexStore.close] failed:", error);
    }
  }
}

const createDefaultSqliteSemanticIndexStore = (): SqliteSemanticIndexStore =>
  new SqliteSemanticIndexStore(resolveSemanticIndexDbPath(), getEmbeddingDimensions());

const createLazyWorkspaceSemanticIndexStore = (): SemanticIndexStore => {
  let impl: SqliteSemanticIndexStore | null = null;

  const get = (): SqliteSemanticIndexStore => {
    if (isNullish(impl)) {
      impl = createDefaultSqliteSemanticIndexStore();
    }
    return impl;
  };

  return {
    clear: () => get().clear(),
    getFileMetadataByFileId: (fileId) => get().getFileMetadataByFileId(fileId),
    queryNearest: (params) => get().queryNearest(params),
    replaceIndexedFile: (payload) => get().replaceIndexedFile(payload),
  };
};

export const workspaceSemanticIndexStore: SemanticIndexStore = createLazyWorkspaceSemanticIndexStore();
