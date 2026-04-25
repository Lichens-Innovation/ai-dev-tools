# Ubiquitous Language

## Workspace and repositories

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Workspace** | The filesystem directory that contains one or more Git repositories and whose path is resolved from `CODE_CRAWLER_ROOT` or the `rootDir` tool parameter. | project root, crawl root, base directory |
| **Repository** | A single Git repository identified by its folder basename (e.g. `my-app`); acts as a scoping namespace in the index so queries can be filtered per repo. | repo, project, codebase |
| **Repository Root** | The absolute filesystem path of a repository's top-level directory. | repo path, base path |

## Indexing

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **File Record** | A source file's full text content combined with its metadata, collected during the indexing walk and used as the unit passed into the upsert pipeline. | file entry, source record |
| **File Metadata** | The structural identity fields of an indexed file: file ID, relative path, filename, SHA-256 hash, source language, size, and last-modified timestamp. | file info, file properties |
| **File ID** | The stable, unique identifier for a file in the index, formed as `repository::pathRelative` (POSIX-style). | id, path key, file key |
| **Source Language** | The programming language assigned to a file for tree-sitter parsing and search filtering; one of `typescript`, `javascript`, `python`, `cpp`, `csharp`. | language, language id, file type |
| **Indexing Flow** | The full pipeline for one repository: walk source files → build file records → skip unchanged files → produce chunks → embed → persist to the semantic index. | indexing pipeline, crawl, sync |
| **Upsert** | The idempotent operation that replaces all chunks of a file in the semantic index; skipped when the file's SHA-256 is unchanged since the last index run. | insert, update, re-index |
| **Skipped File** | A file whose SHA-256 matches the already-indexed entry, causing it to be excluded from the current upsert batch. | unchanged file, cached file |

## Chunking

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Chunk** | The atomic indexed unit: a contiguous excerpt of a source file aligned to an AST symbol boundary, carrying line spans, embed text, and (after embedding) a float vector. | segment, snippet, block |
| **Chunk Index** | The ordinal position of a chunk within its file (0-based); combined with the file ID to form the chunk ID. | chunk number, chunk position |
| **Chunk ID** | The unique identifier for a chunk row, formed as `fileId#chunkIndex`. | chunk key, row id |
| **Embed Text** | The text string sent to the embedding model for a given chunk; may include context hints (path prefix, calls/calledBy) in addition to the raw source excerpt. | chunk text, raw text |
| **Document** | The stored text body of a chunk as persisted in the index (equal to its embed text). | content, body |
| **Graph Chunk** | A chunk produced after AST extraction and graph enrichment, where symbol boundaries and intra-file call relationships are used to shape the excerpt. | semantic chunk, AST chunk |
| **Raw AST Chunk** | Intermediate representation extracted directly from a tree-sitter parse, before graph enrichment or size splitting. | AST node, parse node |
| **Symbol Kind** | The classification of a code symbol extracted during chunking: `Function`, `Method`, `Class`, `Interface`, `Const`, `Let`, `Enum`, or `Type`. | node type, declaration kind |

## Semantic index and storage

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Semantic Index** | The SQLite database (via sqlite-vec + FTS5) that persists all file metadata, chunk rows, embeddings, and the FTS table; the single source of truth for all search operations. | vector store, search index, semantic search index, workspace index |
| **Embedding** | A dense float vector (`Float32Array`) produced by the embedding model to represent the semantic content of a chunk's embed text. | vector, float vector |
| **Embedding Dimension** | The width N of the embedding vector; must match the model in use and the `vec0` virtual table schema; validated at store open via `META_KEY_EMBEDDING_DIM`. | vector size, dim, embedding size |
| **Vec0** | The sqlite-vec virtual table (`FILE_INDEX_CHUNK_VEC`) that stores chunk embeddings and enables KNN queries over them. | vector table, embedding table |
| **FTS Table** | The SQLite FTS5 virtual table (`FILE_INDEX_CHUNK_FTS`) with external content from chunk rows, used for lexical BM25 search. | full-text index, text search table |

## Search

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Vector Search** | Retrieval of the k nearest chunk embeddings to a query embedding using sqlite-vec KNN; returns chunk matches ordered by L2 distance. | semantic search (overloaded), ANN search, similarity search |
| **Lexical Search** | Retrieval of chunk matches using FTS5 BM25 keyword scoring over chunk documents; returns chunks ordered by BM25 rank. | full-text search, keyword search, FTS |
| **Hybrid Search** | The combined retrieval strategy that fuses vector and lexical matches with fixed 70%/30% weights after min–max normalization per branch. | combined search, mixed search |
| **Query Match** | A single chunk-level search result before file consolidation, carrying the chunk's file metadata, line span, a document preview, and a distance score. | hit, result, match |
| **File Consolidation** | The step that collapses multiple per-chunk query matches into one result row per file, boosting files with several nearby-distance chunk hits. | deduplication, grouping by file, result aggregation |
| **Effective Distance** | The distance assigned to a file result after consolidation, reduced (boosted) when multiple chunks from that file fall within a proximity band. | consolidated distance, boosted score |
| **Cross-encoder Reranking** | A second-stage scoring pass applied to hybrid matches, using a cross-encoder model to re-score query/chunk pairs for improved precision. | reranking, second-stage scoring |
| **RAG Response** | The natural-language answer generated by a causal language model over consolidated semantic hits as context. | generated answer, LLM answer, AI answer |

## Relationships

- A **Workspace** contains one or more **Repositories**.
- A **Repository** contains one or more **File Records** discovered during the **Indexing Flow**.
- A **File Record** is split into one or more **Chunks** (via **Graph Chunks**) before embedding.
- Each **Chunk** has exactly one **Embedding** stored in the **Semantic Index**.
- A **Semantic Index** holds all chunks and embeddings from all indexed **Repositories**.
- A **Hybrid Search** produces **Query Matches** at chunk level, which are passed to **File Consolidation** to yield one result row per file.
- A **RAG Response** is produced from consolidated **Query Matches** and is optional (only when the RAG tool is called).

## Example dialogue

> **Dev:** "When I call `prepare-repository-for-semantic-search`, what exactly ends up in the **semantic index**?"

> **Domain expert:** "The **indexing flow** walks all source files in the **repository root**, builds a **file record** per file, skips any whose SHA-256 hasn't changed, then splits each changed file into **chunks** via AST-aligned **graph chunking**. Each chunk's **embed text** is sent to the embedding model, producing an **embedding**. The **chunk** row plus its **embedding** are persisted together in the **semantic index**."

> **Dev:** "So the **document** stored per chunk is the same as the **embed text** that went into the model?"

> **Domain expert:** "Exactly. The **embed text** is what the model sees; the **document** is that same string stored for retrieval and display. They're the same string at rest."

> **Dev:** "When I search, I get back one row per file — but you said there are multiple **chunks** per file. Where did the rest go?"

> **Domain expert:** "**Hybrid search** retrieves chunk-level **query matches** from both **vector search** and **lexical search**, fuses them, then **file consolidation** collapses them into one result per file. Files with several close-distance chunks get a lower **effective distance**, so they rank higher."

> **Dev:** "And if I also want a prose answer, not just file hits?"

> **Domain expert:** "Use the RAG tool. After consolidation the top matches become context for a causal language model, which generates a **RAG response** grounded in the retrieved code."

## Flagged ambiguities

- **"document"** appears in two distinct contexts: (1) `FileIndexRecord.document` is the *full source file content* as a UTF-8 string; (2) `SemanticIndexChunkRow.document` and the database column `DOCUMENT` are the *chunk body* (embed text). These are different scopes of the same word. Prefer **file content** or **source text** when referring to the full file, and **document** (or **chunk document**) only for the indexed chunk body.
- **"semantic search"** is used both as a product-level label (e.g. the tool name `semantic-search-workspace-files`) and to contrast specifically with *lexical search* inside hybrid retrieval. When distinguishing the two retrieval branches, use **vector search** (not "semantic search") to avoid confusion with the overall feature name.
- **"workspace"** is used both as the top-level directory concept and as a prefix in identifiers like `workspaceSemanticIndexStore` or `prepare-workspace-repositories`. The canonical term for the directory is **workspace**; the store prefix is an implementation detail, not a separate concept.
- **"repository"** vs **"repo"**: the codebase uses both in identifiers. Canonical term is **repository**; avoid **repo** in domain discussions.
