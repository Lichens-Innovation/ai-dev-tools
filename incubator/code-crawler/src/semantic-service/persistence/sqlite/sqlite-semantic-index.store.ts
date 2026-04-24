import { isBlank, isNullish } from "@lichens-innovation/ts-common";
import Database from "better-sqlite3";
import { Buffer } from "node:buffer";
import { mkdirSync } from "node:fs";
import path from "node:path";
import * as sqliteVec from "sqlite-vec";
import { EnvNames, getEmbeddingDimensions, resolveSemanticIndexDbPath } from "../../../utils/env.utils";
import { buildSafeFts5MatchQuery } from "../../search/fts5-query-sanitize.utils";
import type { FileIndexMetadata } from "../../types/index-domain.types";
import type { SourceLanguageId } from "../../types/source-language.types";
import type { QueryMatchSummary } from "../../types/search.types";
import type {
  QueryLexicalChunksArgs,
  QueryNearestArgs,
  ReplaceIndexedFilePayload,
  SemanticIndexStore,
} from "../../types/store.types";
import {
  FILE_INDEX_CHUNK_FTS_NAME,
  FILE_INDEX_CHUNK_VEC_NAME,
  FILE_INDEX_CHUNK_VEC_SOURCE_LANGUAGE,
  META_KEY_EMBEDDING_DIM,
  SQL_FTS_CHUNK_REBUILD,
  SQL_INDEX_FILE_INDEX_CHUNK_FILE_CHUNK_INDEX,
  SQL_INDEX_FILE_INDEX_METADATA_SOURCE_LANGUAGE,
  SQL_TABLE_FILE_INDEX_CHUNK,
  SQL_TABLE_FILE_INDEX_CHUNK_FTS,
  SQL_TABLE_FILE_INDEX_METADATA,
  SQL_TABLE_FILE_INDEX_STORE_META,
  SQL_TABLE_NAME_FILE_INDEX_CHUNK,
  SQL_TABLE_NAME_FILE_INDEX_METADATA,
  SQL_TABLE_NAME_FILE_INDEX_STORE_META,
  SQL_TRIGGERS_FILE_INDEX_CHUNK_FTS,
  buildFileIndexChunkVecDdl,
  type DbFileIndexKnnRow,
  type DbFileIndexLexicalRow,
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
  ["", ":memory:"].includes(dbPath) || dbPath.startsWith("file::memory:");

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
const writeMetaValue = ({ db, key, value }: WriteMetaValueArgs): void => {
  db.prepare(`INSERT OR REPLACE INTO ${SQL_TABLE_NAME_FILE_INDEX_STORE_META} (KEY, VALUE) VALUES (?, ?)`).run(
    key,
    value
  );
};

const countSemanticChunks = (db: Database.Database): number => {
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
  type DbCountRow = { n: number };
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${FILE_INDEX_CHUNK_FTS_NAME}`).get() as DbCountRow;
  return row?.n ?? 0;
};

/**
 * Creates FTS5 + triggers when missing; `rebuild` when chunks exist but the FTS index is empty
 * (e.g. reused local DB file). Idempotent.
 */
const ensureFts5SchemaOnDb = (db: Database.Database): void => {
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

const dbMetadataRowToFileIndexMetadata = (row: DbFileIndexMetadataRow): FileIndexMetadata => ({
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

interface SqliteSemanticIndexStoreArgs {
  dbPath: string;
  embeddingDimensions: number;
}

interface ResolveLexicalRowsArgs {
  matchQuery: string;
  nResults: number;
  repository?: string;
  hasLang: boolean;
  jsonLangs: string;
}

interface ResolveKnnRowsArgs {
  queryEmbedding: Float32Array;
  nResults: number;
  repository?: string;
  /** Non-empty = filter with `v.source_language` OR-of-equals on vec0 (sqlite-vec metadata KNN). */
  languages: readonly string[];
}

export class SqliteSemanticIndexStore implements SemanticIndexStore {
  private readonly db: Database.Database;
  private readonly embeddingDimensions: number;
  /** KNN SELECT … FROM vec JOIN chunk JOIN metadata (no WHERE). */
  private readonly knnSelectBase: string;
  private readonly knnLangStmtAllRepos = new Map<string, Database.Statement>();
  private readonly knnLangStmtByRepo = new Map<string, Database.Statement>();
  private readonly stmtSelectChunkRowidsByFileId: Database.Statement<[string], { ID: number }>;
  private readonly stmtDeleteVecByRowid: Database.Statement<[number], unknown>;
  private readonly stmtDeleteChunksByFileId: Database.Statement<[string], unknown>;
  private readonly stmtDeleteFileById: Database.Statement<[string], unknown>;
  private readonly stmtInsertFile: Database.Statement<
    [string, string, string, string, string, string, string, number, string],
    Database.RunResult
  >;
  private readonly stmtInsertChunk: Database.Statement<
    [number, string, number, string, string, number, number, number],
    Database.RunResult
  >;
  private readonly stmtInsertVec: Database.Statement<[Buffer, string, string], Database.RunResult>;
  private readonly stmtKnnAllRepos: Database.Statement<[Float32Array, number], DbFileIndexKnnRow>;
  private readonly stmtKnnByRepository: Database.Statement<[Float32Array, number, string], DbFileIndexKnnRow>;
  private readonly stmtDeleteAllVec: Database.Statement<[], unknown>;
  private readonly stmtDeleteAllChunks: Database.Statement<[], unknown>;
  private readonly stmtDeleteAllFiles: Database.Statement<[], unknown>;
  private readonly stmtSelectFileMetadataByFileId: Database.Statement<[string], DbFileIndexMetadataRow>;
  private readonly stmtLexicalAll: Database.Statement<[string, number], DbFileIndexLexicalRow>;
  private readonly stmtLexicalAllWithLanguages: Database.Statement<[string, string, number], DbFileIndexLexicalRow>;
  private readonly stmtLexicalByRepository: Database.Statement<[string, string, number], DbFileIndexLexicalRow>;
  private readonly stmtLexicalByRepositoryWithLanguages: Database.Statement<
    [string, string, string, number],
    DbFileIndexLexicalRow
  >;

  constructor({ dbPath, embeddingDimensions }: SqliteSemanticIndexStoreArgs) {
    ensureDbParentDirectory(dbPath);

    this.embeddingDimensions = embeddingDimensions;

    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    sqliteVec.load(this.db);

    this.db.exec(SQL_TABLE_FILE_INDEX_STORE_META);
    this.db.exec(SQL_TABLE_FILE_INDEX_METADATA);
    this.db.exec(SQL_INDEX_FILE_INDEX_METADATA_SOURCE_LANGUAGE);
    this.db.exec(SQL_TABLE_FILE_INDEX_CHUNK);
    this.db.exec(SQL_INDEX_FILE_INDEX_CHUNK_FILE_CHUNK_INDEX);

    this.ensureVecSchema();
    ensureFts5SchemaOnDb(this.db);

    this.knnSelectBase = `
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
        f.SOURCE_LANGUAGE,
        v.distance AS distance
      FROM ${FILE_INDEX_CHUNK_VEC_NAME} AS v
      INNER JOIN ${SQL_TABLE_NAME_FILE_INDEX_CHUNK} AS c ON c.ID = v.rowid
      INNER JOIN ${SQL_TABLE_NAME_FILE_INDEX_METADATA} AS f ON f.FILE_ID = c.FILE_ID`;

    this.stmtSelectChunkRowidsByFileId = this.db.prepare(
      `SELECT ID FROM ${SQL_TABLE_NAME_FILE_INDEX_CHUNK} WHERE FILE_ID = ?`
    );
    this.stmtDeleteVecByRowid = this.db.prepare(`DELETE FROM ${FILE_INDEX_CHUNK_VEC_NAME} WHERE rowid = ?`);
    this.stmtDeleteChunksByFileId = this.db.prepare(`DELETE FROM ${SQL_TABLE_NAME_FILE_INDEX_CHUNK} WHERE FILE_ID = ?`);
    this.stmtDeleteFileById = this.db.prepare(`DELETE FROM ${SQL_TABLE_NAME_FILE_INDEX_METADATA} WHERE FILE_ID = ?`);
    this.stmtInsertFile = this.db.prepare(
      `INSERT INTO ${SQL_TABLE_NAME_FILE_INDEX_METADATA} (FILE_ID, REPOSITORY, PATH_RELATIVE, FILENAME, FULL_PATH, CONTENT_SHA256, LAST_MODIFIED_AT_ISO, SIZE_BYTES, SOURCE_LANGUAGE)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    this.stmtInsertChunk = this.db.prepare(
      `INSERT INTO ${SQL_TABLE_NAME_FILE_INDEX_CHUNK} (ID, FILE_ID, CHUNK_INDEX, CHUNK_ID, DOCUMENT, START_LINE, END_LINE, CHUNK_BYTE_LENGTH)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    this.stmtInsertVec = this.db.prepare(
      `INSERT INTO ${FILE_INDEX_CHUNK_VEC_NAME} (embedding, repository, ${FILE_INDEX_CHUNK_VEC_SOURCE_LANGUAGE}) VALUES (?, ?, ?)`
    );

    this.stmtKnnAllRepos = this.db.prepare<[Float32Array, number], DbFileIndexKnnRow>(`${this.knnSelectBase}
      WHERE v.embedding MATCH ?
        AND k = ?
      ORDER BY v.distance`);

    this.stmtKnnByRepository = this.db.prepare<[Float32Array, number, string], DbFileIndexKnnRow>(`${this.knnSelectBase}
      WHERE v.embedding MATCH ?
        AND k = ?
        AND v.repository = ?
      ORDER BY v.distance`);

    this.stmtDeleteAllVec = this.db.prepare(`DELETE FROM ${FILE_INDEX_CHUNK_VEC_NAME}`);
    this.stmtDeleteAllChunks = this.db.prepare(`DELETE FROM ${SQL_TABLE_NAME_FILE_INDEX_CHUNK}`);
    this.stmtDeleteAllFiles = this.db.prepare(`DELETE FROM ${SQL_TABLE_NAME_FILE_INDEX_METADATA}`);
    this.stmtSelectFileMetadataByFileId = this.db.prepare(
      `SELECT FILE_ID, REPOSITORY, PATH_RELATIVE, FILENAME, FULL_PATH, CONTENT_SHA256, LAST_MODIFIED_AT_ISO, SIZE_BYTES, SOURCE_LANGUAGE
       FROM ${SQL_TABLE_NAME_FILE_INDEX_METADATA}
       WHERE FILE_ID = ?`
    );

    const lexicalSelectBase = `
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
        f.SOURCE_LANGUAGE,
        bm25(${FILE_INDEX_CHUNK_FTS_NAME}) AS bm25_score
      FROM ${FILE_INDEX_CHUNK_FTS_NAME}
      INNER JOIN ${SQL_TABLE_NAME_FILE_INDEX_CHUNK} AS c ON c.ID = ${FILE_INDEX_CHUNK_FTS_NAME}.rowid
      INNER JOIN ${SQL_TABLE_NAME_FILE_INDEX_METADATA} AS f ON f.FILE_ID = c.FILE_ID`;

    this.stmtLexicalAll = this.db.prepare<[string, number], DbFileIndexLexicalRow>(`${lexicalSelectBase}
      WHERE ${FILE_INDEX_CHUNK_FTS_NAME} MATCH ?
      ORDER BY bm25_score ASC
      LIMIT ?`);

    this.stmtLexicalByRepository = this.db.prepare<
      [string, string, number],
      DbFileIndexLexicalRow
    >(`${lexicalSelectBase}
      WHERE ${FILE_INDEX_CHUNK_FTS_NAME} MATCH ?
        AND f.REPOSITORY = ?
      ORDER BY bm25_score ASC
      LIMIT ?`);

    this.stmtLexicalAllWithLanguages = this.db.prepare<
      [string, string, number],
      DbFileIndexLexicalRow
    >(`${lexicalSelectBase}
      WHERE ${FILE_INDEX_CHUNK_FTS_NAME} MATCH ?
        AND f.SOURCE_LANGUAGE IN (SELECT value FROM json_each(?))
      ORDER BY bm25_score ASC
      LIMIT ?`);

    this.stmtLexicalByRepositoryWithLanguages = this.db.prepare<
      [string, string, string, number],
      DbFileIndexLexicalRow
    >(`${lexicalSelectBase}
      WHERE ${FILE_INDEX_CHUNK_FTS_NAME} MATCH ?
        AND f.REPOSITORY = ?
        AND f.SOURCE_LANGUAGE IN (SELECT value FROM json_each(?))
      ORDER BY bm25_score ASC
      LIMIT ?`);
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

    const run = (): void => {
      const existingRows = this.stmtSelectChunkRowidsByFileId.all(file.fileId);
      for (const row of existingRows) {
        this.stmtDeleteVecByRowid.run(row.ID);
      }
      this.stmtDeleteChunksByFileId.run(file.fileId);
      this.stmtDeleteFileById.run(file.fileId);

      if (chunks.length === 0) {
        return;
      }

      this.stmtInsertFile.run(
        file.fileId,
        file.repository,
        file.pathRelative,
        file.filename,
        file.fullPath,
        file.contentSha256,
        file.lastModifiedAtISO,
        file.sizeBytes,
        file.sourceLanguage
      );

      for (const ch of chunks) {
        if (ch.embedding.length !== this.embeddingDimensions) {
          throw new Error(`[Store] embedding length ${ch.embedding.length} !== ${this.embeddingDimensions}`);
        }

        const vecInsert = this.stmtInsertVec.run(
          float32ToSqliteBlob(ch.embedding),
          file.repository,
          file.sourceLanguage
        );
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

  queryLexicalChunks({ queryText, nResults, repository, languages }: QueryLexicalChunksArgs): QueryMatchSummary[] {
    if (nResults < 1) {
      return [];
    }

    const matchQuery = buildSafeFts5MatchQuery(queryText);
    if (isBlank(matchQuery)) {
      return [];
    }

    const langList = languages ?? [];
    const hasLang = langList.length > 0;
    const jsonLangs = JSON.stringify(langList);

    const rows = this.resolveLexicalRows({ matchQuery, nResults, repository, hasLang, jsonLangs });

    return rows.map(
      (row): QueryMatchSummary => ({
        chunkIndex: row.CHUNK_INDEX,
        distance: row.bm25_score,
        documentPreview: row.DOCUMENT,
        fileId: row.FILE_ID,
        id: row.CHUNK_ID,
        startLine: row.START_LINE,
        endLine: row.END_LINE,
        metadata: dbMetadataRowToFileIndexMetadata(row),
      })
    );
  }

  queryNearest(params: QueryNearestArgs): QueryMatchSummary[] {
    const { nResults, queryEmbedding, repository, languages } = params;
    if (nResults < 1) {
      return [];
    }

    if (queryEmbedding.length !== this.embeddingDimensions) {
      throw new Error(`[queryNearest] query embedding length ${queryEmbedding.length} !== ${this.embeddingDimensions}`);
    }

    const langList = languages ?? [];

    const rows = this.resolveKnnRows({ queryEmbedding, nResults, repository, languages: langList });

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

  private resolveLexicalRows({
    matchQuery,
    nResults,
    repository,
    hasLang,
    jsonLangs,
  }: ResolveLexicalRowsArgs): DbFileIndexLexicalRow[] {
    if (isBlank(repository)) {
      return hasLang
        ? this.stmtLexicalAllWithLanguages.all(matchQuery, jsonLangs, nResults)
        : this.stmtLexicalAll.all(matchQuery, nResults);
    }

    return hasLang
      ? this.stmtLexicalByRepositoryWithLanguages.all(matchQuery, repository!, jsonLangs, nResults)
      : this.stmtLexicalByRepository.all(matchQuery, repository, nResults);
  }

  private resolveKnnRows({ queryEmbedding, nResults, repository, languages }: ResolveKnnRowsArgs): DbFileIndexKnnRow[] {
    const sortedUniqueLangs = [...new Set(languages)].sort((a, b) => a.localeCompare(b));
    const hasLang = sortedUniqueLangs.length > 0;

    if (isBlank(repository)) {
      if (!hasLang) {
        return this.stmtKnnAllRepos.all(queryEmbedding, nResults);
      }

      const stmt = this.getOrCreateKnnLangAllReposStatement(sortedUniqueLangs);
      return stmt.all(queryEmbedding, nResults, ...sortedUniqueLangs) as DbFileIndexKnnRow[];
    }

    if (!hasLang) {
      return this.stmtKnnByRepository.all(queryEmbedding, nResults, repository!);
    }

    const stmt = this.getOrCreateKnnLangByRepositoryStatement(sortedUniqueLangs);
    return stmt.all(queryEmbedding, nResults, repository!, ...sortedUniqueLangs) as DbFileIndexKnnRow[];
  }

  // Example: "… AND (v.source_language = ? OR v.source_language = ?)" → .all(queryEmbedding, k, "typescript", "javascript").
  /** sqlite-vec metadata KNN: use `=` / `OR` only (not `IN` on `v`) per vec0 docs. */
  private getOrCreateKnnLangAllReposStatement(sortedUniqueLangs: readonly string[]): Database.Statement {
    const key = sortedUniqueLangs.join("\0");
    let stmt = this.knnLangStmtAllRepos.get(key);
    if (!isNullish(stmt)) {
      return stmt;
    }

    const orPred = sortedUniqueLangs.map(() => `v.${FILE_INDEX_CHUNK_VEC_SOURCE_LANGUAGE} = ?`).join(" OR ");
    stmt = this.db.prepare(
      `${this.knnSelectBase}
       WHERE v.embedding MATCH ?
         AND k = ?
         AND (${orPred})
       ORDER BY v.distance`
    );
    this.knnLangStmtAllRepos.set(key, stmt);
    return stmt;
  }

  // Example: "… AND v.repository = ? AND (v.source_language = ? OR …)" → .all(queryEmbedding, k, "my-repo", "typescript", "javascript").
  private getOrCreateKnnLangByRepositoryStatement(sortedUniqueLangs: readonly string[]): Database.Statement {
    const key = sortedUniqueLangs.join("\0");
    let stmt = this.knnLangStmtByRepo.get(key);
    if (!isNullish(stmt)) {
      return stmt;
    }

    const orPred = sortedUniqueLangs.map(() => `v.${FILE_INDEX_CHUNK_VEC_SOURCE_LANGUAGE} = ?`).join(" OR ");
    stmt = this.db.prepare(
      `${this.knnSelectBase}
       WHERE v.embedding MATCH ?
         AND k = ?
         AND v.repository = ?
         AND (${orPred})
       ORDER BY v.distance`
    );
    this.knnLangStmtByRepo.set(key, stmt);
    return stmt;
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
  new SqliteSemanticIndexStore({ dbPath: resolveSemanticIndexDbPath(), embeddingDimensions: getEmbeddingDimensions() });

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
    queryLexicalChunks: (args) => get().queryLexicalChunks(args),
    queryNearest: (params) => get().queryNearest(params),
    replaceIndexedFile: (payload) => get().replaceIndexedFile(payload),
  };
};

export const workspaceSemanticIndexStore: SemanticIndexStore = createLazyWorkspaceSemanticIndexStore();
