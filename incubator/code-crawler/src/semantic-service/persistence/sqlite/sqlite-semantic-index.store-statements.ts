import Database from "better-sqlite3";
import {
  FILE_INDEX_CHUNK_FTS_NAME,
  FILE_INDEX_CHUNK_VEC_NAME,
  FILE_INDEX_CHUNK_VEC_SOURCE_LANGUAGE,
  SQL_TABLE_NAME_FILE_INDEX_CHUNK,
  SQL_TABLE_NAME_FILE_INDEX_METADATA,
  type DbFileIndexKnnRow,
  type DbFileIndexLexicalRow,
  type DbFileIndexMetadataRow,
} from "./semantic-index-sqlite.schema";

export const KNN_SELECT_BASE_SQL = `
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

const LEXICAL_SELECT_BASE_SQL = `
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

export interface SqliteSemanticIndexPreparedStatements {
  stmtSelectChunkRowidsByFileId: Database.Statement<[string], { ID: number }>;
  stmtDeleteVecByRowid: Database.Statement<[number], unknown>;
  stmtDeleteChunksByFileId: Database.Statement<[string], unknown>;
  stmtDeleteFileById: Database.Statement<[string], unknown>;
  stmtInsertFile: Database.Statement<
    [string, string, string, string, string, string, string, number, string],
    Database.RunResult
  >;
  stmtInsertChunk: Database.Statement<
    [number, string, number, string, string, number, number, number],
    Database.RunResult
  >;
  stmtInsertVec: Database.Statement<[Buffer, string, string], Database.RunResult>;
  stmtKnnAllRepos: Database.Statement<[Float32Array, number], DbFileIndexKnnRow>;
  stmtKnnByRepository: Database.Statement<[Float32Array, number, string], DbFileIndexKnnRow>;
  stmtDeleteAllVec: Database.Statement<[], unknown>;
  stmtDeleteAllChunks: Database.Statement<[], unknown>;
  stmtDeleteAllFiles: Database.Statement<[], unknown>;
  stmtSelectFileMetadataByFileId: Database.Statement<[string], DbFileIndexMetadataRow>;
  stmtLexicalAll: Database.Statement<[string, number], DbFileIndexLexicalRow>;
  stmtLexicalAllWithLanguages: Database.Statement<[string, string, number], DbFileIndexLexicalRow>;
  stmtLexicalByRepository: Database.Statement<[string, string, number], DbFileIndexLexicalRow>;
  stmtLexicalByRepositoryWithLanguages: Database.Statement<[string, string, string, number], DbFileIndexLexicalRow>;
}

export const prepareSqliteSemanticIndexStatements = (db: Database.Database): SqliteSemanticIndexPreparedStatements => {
  return {
    stmtSelectChunkRowidsByFileId: db.prepare(`SELECT ID FROM ${SQL_TABLE_NAME_FILE_INDEX_CHUNK} WHERE FILE_ID = ?`),
    stmtDeleteVecByRowid: db.prepare(`DELETE FROM ${FILE_INDEX_CHUNK_VEC_NAME} WHERE rowid = ?`),
    stmtDeleteChunksByFileId: db.prepare(`DELETE FROM ${SQL_TABLE_NAME_FILE_INDEX_CHUNK} WHERE FILE_ID = ?`),
    stmtDeleteFileById: db.prepare(`DELETE FROM ${SQL_TABLE_NAME_FILE_INDEX_METADATA} WHERE FILE_ID = ?`),
    stmtInsertFile: db.prepare(
      `INSERT INTO ${SQL_TABLE_NAME_FILE_INDEX_METADATA} (FILE_ID, REPOSITORY, PATH_RELATIVE, FILENAME, FULL_PATH, CONTENT_SHA256, LAST_MODIFIED_AT_ISO, SIZE_BYTES, SOURCE_LANGUAGE)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ),
    stmtInsertChunk: db.prepare(
      `INSERT INTO ${SQL_TABLE_NAME_FILE_INDEX_CHUNK} (ID, FILE_ID, CHUNK_INDEX, CHUNK_ID, DOCUMENT, START_LINE, END_LINE, CHUNK_BYTE_LENGTH)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ),
    stmtInsertVec: db.prepare(
      `INSERT INTO ${FILE_INDEX_CHUNK_VEC_NAME} (embedding, repository, ${FILE_INDEX_CHUNK_VEC_SOURCE_LANGUAGE}) VALUES (?, ?, ?)`
    ),

    stmtKnnAllRepos: db.prepare<[Float32Array, number], DbFileIndexKnnRow>(`${KNN_SELECT_BASE_SQL}
      WHERE v.embedding MATCH ?
        AND k = ?
      ORDER BY v.distance`),

    stmtKnnByRepository: db.prepare<[Float32Array, number, string], DbFileIndexKnnRow>(`${KNN_SELECT_BASE_SQL}
      WHERE v.embedding MATCH ?
        AND k = ?
        AND v.repository = ?
      ORDER BY v.distance`),

    stmtDeleteAllVec: db.prepare(`DELETE FROM ${FILE_INDEX_CHUNK_VEC_NAME}`),
    stmtDeleteAllChunks: db.prepare(`DELETE FROM ${SQL_TABLE_NAME_FILE_INDEX_CHUNK}`),
    stmtDeleteAllFiles: db.prepare(`DELETE FROM ${SQL_TABLE_NAME_FILE_INDEX_METADATA}`),
    stmtSelectFileMetadataByFileId: db.prepare(
      `SELECT FILE_ID, REPOSITORY, PATH_RELATIVE, FILENAME, FULL_PATH, CONTENT_SHA256, LAST_MODIFIED_AT_ISO, SIZE_BYTES, SOURCE_LANGUAGE
       FROM ${SQL_TABLE_NAME_FILE_INDEX_METADATA}
       WHERE FILE_ID = ?`
    ),

    stmtLexicalAll: db.prepare<[string, number], DbFileIndexLexicalRow>(`${LEXICAL_SELECT_BASE_SQL}
      WHERE ${FILE_INDEX_CHUNK_FTS_NAME} MATCH ?
      ORDER BY bm25_score ASC
      LIMIT ?`),

    stmtLexicalByRepository: db.prepare<[string, string, number], DbFileIndexLexicalRow>(`${LEXICAL_SELECT_BASE_SQL}
      WHERE ${FILE_INDEX_CHUNK_FTS_NAME} MATCH ?
        AND f.REPOSITORY = ?
      ORDER BY bm25_score ASC
      LIMIT ?`),

    stmtLexicalAllWithLanguages: db.prepare<[string, string, number], DbFileIndexLexicalRow>(`${LEXICAL_SELECT_BASE_SQL}
      WHERE ${FILE_INDEX_CHUNK_FTS_NAME} MATCH ?
        AND f.SOURCE_LANGUAGE IN (SELECT value FROM json_each(?))
      ORDER BY bm25_score ASC
      LIMIT ?`),

    stmtLexicalByRepositoryWithLanguages: db.prepare<
      [string, string, string, number],
      DbFileIndexLexicalRow
    >(`${LEXICAL_SELECT_BASE_SQL}
      WHERE ${FILE_INDEX_CHUNK_FTS_NAME} MATCH ?
        AND f.REPOSITORY = ?
        AND f.SOURCE_LANGUAGE IN (SELECT value FROM json_each(?))
      ORDER BY bm25_score ASC
      LIMIT ?`),
  };
};
