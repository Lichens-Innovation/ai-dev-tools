# Abbreviations and terms (semantic search & indexing)

Short reference for acronyms and technical terms used around **embeddings**, **hybrid search**, **SQLite**, and **RAG** in this package. Explanations are in English.

| Term | Stands for / full name | Meaning in code-crawler |
| --- | --- | --- |
| **KNN** | k-nearest neighbors | Vector retrieval: given a query embedding, SQLite returns the *k* closest stored embeddings (by distance) via **sqlite-vec** on the `vec0` virtual table (e.g. `stmtKnnByRepository`, `resolveKnnRows`). |
| **BM25** | Best Matching 25 (Okapi BM25) | Probabilistic **lexical** ranking function exposed by SQLite **FTS5** as `bm25()`; lower scores mean better keyword matches on chunk `DOCUMENT` text. Used as the lexical branch of hybrid search. |
| **FTS5** | Full-Text Search 5 | SQLite’s fifth-generation full-text extension; `FILE_INDEX_CHUNK_FTS` is an `fts5` virtual table with **external content** on `FILE_INDEX_CHUNK`, kept in sync by triggers. |
| **FTS** | Full-text search | Generic term for keyword search over indexed text; here implemented with FTS5 and sanitized `MATCH` queries (`buildSafeFts5MatchQuery`). |
| **vec0** | sqlite-vec virtual table module | Declares the vector column layout (`embedding float[N]` plus metadata such as `repository`, `source_language`) for **sqlite-vec** KNN; chunk row `ID` aligns with the vector table **rowid**. |
| **sqlite-vec** | SQLite vector extension | Loadable extension that powers approximate/exact nearest-neighbor-style queries over `float[N]` embeddings stored in `FILE_INDEX_CHUNK_VEC`. |
| **ANN** | approximate nearest neighbors | Family of algorithms that trade exactness for speed on large vector sets; README notes **sqlite-vec is not** a dedicated ANN index and suggests evaluating ANN stores for very large corpora. |
| **L2** | Euclidean distance (L2 norm) | Distance metric returned by sqlite-vec KNN for float embeddings; with **L2-normalized** vectors, ranking relates to **cosine** distance via the identity used in `sqliteVecDistanceToCosineDistance`. |
| **cosine** | cosine similarity / distance | Angular similarity between vectors; for normalized embeddings, **dot product** equals cosine similarity; codebase maps L2 distance to a cosine-style distance for ranking consistency. |
| **hybrid (search)** | — | Combines **vector KNN** and **lexical BM25** ranked lists, then fuses them with **RRF** in `fuseChunkMatchesWithRRF` (`hybrid-chunk-fusion.utils.ts`): default **70%** weight on vector ranks, **30%** on lexical, **`rrfK = 60`**. |
| **RRF** | reciprocal rank fusion | Rank-based merge: `weightSemantic/(rrfK + rank_vector) + weightLexical/(rrfK + rank_lexical)`; used by `fuseChunkMatchesWithRRF` for hybrid chunk lists. |
| **min–max (normalization)** | min–max scaling | Used when mapping **cross-encoder** classification scores to distance-like values after reranking (`cross-encoder-rerank.utils.ts`); not used in the vector/lexical RRF fusion step. |
| **RAG** | retrieval-augmented generation | After **retrieving** semantic hits, a **causal language model** generates an answer from consolidated context (`code-text-generation.pipeline.ts`, `CODE_CRAWLER_RAG_TEXT_MODEL`). |
| **embedding** | — | Dense **float** vector representing chunk text for similarity search; produced by Transformers.js and stored as `Float32Array` / blob in `FILE_INDEX_CHUNK_VEC`. |
| **EMBEDDING_DIM** / **dim** | embedding dimension | Width *N* of vectors; must match the model and `vec0` schema (`META_KEY_EMBEDDING_DIM`, `CODE_CRAWLER_EMBEDDING_DIM`). |
| **AST** | abstract syntax tree | Parsed syntax tree; chunks are **AST-aligned** (via **tree-sitter**) before graph enrichment and embedding. |
| **chunk** | — | Indexed text unit (lines + `DOCUMENT` body) with its own embedding and FTS row; several chunks may map to one file. |
| **ONNX** | Open Neural Network Exchange | Common model serialization format; many Hugging Face / `onnx-community` model ids refer to ONNX-backed weights under `CODE_CRAWLER_TRANSFORMERS_MODELS_PATH`. |
| **UTF-8** | 8-bit Unicode Transformation Format | Byte encoding used for length limits (`maxEmbedUtf8Bytes`, `chunkByteLength`) when splitting text for the embedder. |
| **SHA-256** | Secure Hash Algorithm 256-bit | `CONTENT_SHA256` fingerprints file contents for change detection on re-index. |
| **WAL** | write-ahead logging | SQLite journal mode set on store open (`journal_mode = WAL`) for safer concurrent access patterns. |
| **DDL** | data definition language | SQL that defines tables/virtual tables/indexes (`semantic-index-sqlite.schema.ts`). |
| **lexical** | — | Keyword / token-based relevance (FTS5 branch), as opposed to **semantic** / **vector** similarity from embeddings. |
| **semantic** | — | Meaning-based similarity via embeddings and KNN (and “semantic index” / `SemanticIndexStore` naming). |
| **MCP** | Model Context Protocol | Wire protocol used by tools such as `semantic-search-workspace-files`; not a vector term, but primary surface for **semantic** queries from IDEs. |
| **REST** | Representational State Transfer | HTTP `/api` endpoints mirroring some workspace operations alongside MCP. |
| **CRUD** | create, read, update, delete | README shorthand for index mutations going through `SemanticIndexStore`. |
| **JSON-RPC** | JSON remote procedure call | MCP request/response shape over HTTP in `mcp.controller.ts`. |
| **CORS** | cross-origin resource sharing | Browser security header configuration (`CODE_CRAWLER_CORS_ORIGIN`) for the HTTP server that serves search UI and APIs. |

## Related symbols (not acronyms)

| Symbol | Meaning in this codebase |
| --- | --- |
| **`bm25()`** | SQLite FTS5 built-in returning a BM25 rank for a matched row (lexical branch distance input to hybrid fusion). |
| **`rowid`** | SQLite internal row identifier; links `FILE_INDEX_CHUNK.ID` to the corresponding row in `FILE_INDEX_CHUNK_VEC`. |
| **`MATCH`** | FTS5 query operator; user text is sanitized before building the `MATCH` string. |
