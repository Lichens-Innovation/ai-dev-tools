# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

**code-crawler** is a NestJS MCP server that indexes local Git repositories and serves semantic code search. It runs as a single process exposing:
- `/mcp` — Streamable HTTP MCP endpoint
- `/api` — REST API (mirrors MCP tools)
- `/` — Static search UI (served from `public/`)

### Indexing flow

```
Git repos (CODE_CRAWLER_ROOT)
  → walk source files → build FileRecords (path + SHA-256)
  → skip unchanged files (SHA-256 idempotency)
  → AST-aligned chunking (tree-sitter, per-language graph chunks)
  → embed chunks (Transformers.js, Jina embeddings, L2-normalized)
  → persist to SQLite (FILE_INDEX_METADATA, FILE_INDEX_CHUNK, FILE_INDEX_CHUNK_VEC, FILE_INDEX_CHUNK_FTS)
```

### Search flow

```
Query text (+ optional multi-query variants for vector only)
  → Vector: embed each variant → sqlite-vec KNN per variant
      If multiple variants: RRF across vector ranked lists (equal weight per list)
  → Hybrid: one FTS5 BM25 run on the original query text only, then one RRF fuse
      (weightSemantic=0.7, rrfK=60) between fused vector ranks and BM25 ranks
  → Lexical-only: BM25 on the original query only (variants do not add BM25 calls)
  → optional Cross-Encoder reranking (once, on the primary query text)
  → File Consolidation: collapse per-chunk matches → one result per file,
    boosting files with multiple close-distance chunks (Effective Distance)
  → optional RAG: Qwen2.5-Coder generates a natural-language answer from top hits
```

### Persistence

See `docs/DATABASE.md` for full schema and ER diagram.

### Chunking

Language-specific tree-sitter chunkers in `src/semantic-service/chunking/`. Supported languages examples: `typescript`, `javascript`, `python`, `cpp`, `csharp`. Chunks align to AST symbol boundaries (functions, methods, classes, etc.) and include graph hints (intra-file call relationships) in their embed text.

### Embedded models (Transformers.js)

All models run in-process via `@huggingface/transformers`. They are lazy-loaded on first use and cached under `CODE_CRAWLER_TRANSFORMERS_MODELS_PATH`. The embedding dimension **must** match the vec0 table schema; a mismatch is caught at store open via `META_KEY_EMBEDDING_DIM`.

## Domain vocabulary

Use these canonical terms (see `UBIQUITOUS_LANGUAGE.md` for full reference):

| Term                   | Meaning                                                                        |
|------------------------|--------------------------------------------------------------------------------|
| **Workspace**          | Directory containing Git repos; resolved from `CODE_CRAWLER_ROOT`              |
| **Repository**         | A single Git repo identified by its folder basename                            |
| **File ID**            | `repository::pathRelative` (POSIX) — stable unique key                         |
| **Chunk**              | Atomic indexed unit: AST-aligned source excerpt + embed text + float vector    |
| **Embed Text**         | The string sent to the embedding model (source excerpt + optional graph hints) |
| **Semantic Index**     | The SQLite database; single source of truth for all search                     |
| **Hybrid Search**      | RRF fusion: weightSemantic=0.7 (vector), weightLexical=0.3 (lexical), rrfK=60 |
| **File Consolidation** | Collapsing chunk-level hits into one result row per file                       |
| **Effective Distance** | File-level score after consolidation boost                                     |
| **RAG Response**       | Natural-language answer generated from consolidated search hits                |

Prefer **vector search** (not "semantic search") when contrasting with lexical search inside the pipeline.
