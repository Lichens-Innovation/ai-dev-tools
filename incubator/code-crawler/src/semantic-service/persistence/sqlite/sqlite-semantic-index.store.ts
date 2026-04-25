import { isBlank, isNullish } from "@lichens-innovation/ts-common";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { EnvNames, getEmbeddingDimensions, resolveSemanticIndexDbPath } from "../../../utils/env.utils";
import { buildSafeFts5MatchQuery } from "../../search/fts5-query-sanitize.utils";
import type { FileIndexMetadata } from "../../types/index-domain.types";
import type { QueryMatchSummary } from "../../types/search.types";
import type {
  QueryLexicalChunksArgs,
  QueryNearestArgs,
  ReplaceIndexedFilePayload,
  SemanticIndexStore,
} from "../../types/store.types";
import {
  FILE_INDEX_CHUNK_VEC_NAME,
  FILE_INDEX_CHUNK_VEC_SOURCE_LANGUAGE,
  META_KEY_EMBEDDING_DIM,
  SQL_INDEX_FILE_INDEX_CHUNK_FILE_CHUNK_INDEX,
  SQL_INDEX_FILE_INDEX_METADATA_SOURCE_LANGUAGE,
  SQL_TABLE_FILE_INDEX_CHUNK,
  SQL_TABLE_FILE_INDEX_METADATA,
  SQL_TABLE_FILE_INDEX_STORE_META,
  SQL_TABLE_NAME_FILE_INDEX_CHUNK,
  buildFileIndexChunkVecDdl,
  type DbFileIndexKnnRow,
  type DbFileIndexLexicalRow,
  type DbFileIndexMetadataRow,
} from "./semantic-index-sqlite.schema";
import { KNN_SELECT_BASE_SQL, prepareSqliteSemanticIndexStatements } from "./sqlite-semantic-index.store-statements";
import {
  countSemanticChunks,
  dbMetadataRowToFileIndexMetadata,
  ensureDbParentDirectory,
  ensureFts5SchemaOnDb,
  float32ToSqliteBlob,
  readMetaValue,
  sqliteVecDistanceToCosineDistance,
  toIntegerRowId,
  vecTableExists,
  writeMetaValue,
} from "./sqlite-semantic-index.store.utils";

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

    this.knnSelectBase = KNN_SELECT_BASE_SQL;
    const stmts = prepareSqliteSemanticIndexStatements(this.db);
    this.stmtSelectChunkRowidsByFileId = stmts.stmtSelectChunkRowidsByFileId;
    this.stmtDeleteVecByRowid = stmts.stmtDeleteVecByRowid;
    this.stmtDeleteChunksByFileId = stmts.stmtDeleteChunksByFileId;
    this.stmtDeleteFileById = stmts.stmtDeleteFileById;
    this.stmtInsertFile = stmts.stmtInsertFile;
    this.stmtInsertChunk = stmts.stmtInsertChunk;
    this.stmtInsertVec = stmts.stmtInsertVec;
    this.stmtKnnAllRepos = stmts.stmtKnnAllRepos;
    this.stmtKnnByRepository = stmts.stmtKnnByRepository;
    this.stmtDeleteAllVec = stmts.stmtDeleteAllVec;
    this.stmtDeleteAllChunks = stmts.stmtDeleteAllChunks;
    this.stmtDeleteAllFiles = stmts.stmtDeleteAllFiles;
    this.stmtSelectFileMetadataByFileId = stmts.stmtSelectFileMetadataByFileId;
    this.stmtLexicalAll = stmts.stmtLexicalAll;
    this.stmtLexicalAllWithLanguages = stmts.stmtLexicalAllWithLanguages;
    this.stmtLexicalByRepository = stmts.stmtLexicalByRepository;
    this.stmtLexicalByRepositoryWithLanguages = stmts.stmtLexicalByRepositoryWithLanguages;
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
    const sortedUniqueLangs = [...new Set(languages)].sort((langA, langB) => langA.localeCompare(langB));
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
