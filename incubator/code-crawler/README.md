# code-crawler

MCP server (Model Context Protocol) for crawling local Git repositories and **semantic search** over file contents using [**@huggingface/transformers**](https://www.npmjs.com/package/@huggingface/transformers) (Transformers.js) in-process. This package exposes **Streamable HTTP** at `/mcp` (no stdio transport). The same process also serves a **REST API** under `/api` and static files (hub, demos, search UI) at `/`.

The semantic index is persisted in **SQLite** (see `SqliteSemanticIndexStore` / `src/semantic-service/persistence/sqlite/sqlite-semantic-index.store.ts`; the store interface is `SemanticIndexStore` in `src/semantic-service/types/store.types.ts`).

## Database schema

Tables, indexes, the sqlite-vec virtual table, and how chunk `ID` lines up with vector `rowid` are summarized in [docs/DATABASE.md](docs/DATABASE.md) (includes a Mermaid ER diagram).

## Prerequisites

- Node.js 22+
- First embedding use may **download model weights** (cached by Transformers.js / Hugging Face conventions).

## Configuration

Environment variables are documented in [`.env.example`](.env.example); all are **required** except `CODE_CRAWLER_CORS_ORIGIN`, which may be left blank (see [`src/utils/env.utils.ts`](src/utils/env.utils.ts)).

From this package directory:

```bash
cp .env.example .env
```

Edit `.env` and set all required keys (e.g. `CODE_CRAWLER_ROOT`, `CODE_CRAWLER_SEMANTIC_INDEX_DB_PATH`, `CODE_CRAWLER_TRANSFORMERS_MODELS_PATH`, `CODE_CRAWLER_RAG_TEXT_MODEL`). Leave `CODE_CRAWLER_CORS_ORIGIN` unset or blank to mirror the browser Origin; set it to a URL for a fixed CORS origin.

### Embeddings, RAG, and models

`.env.example` uses **Jina** for embeddings (`jinaai/jina-embeddings-v2-base-code`, 768-dim, long context, heavier RAM) and **Qwen2.5 Coder** for RAG answers (`CODE_CRAWLER_RAG_TEXT_MODEL`, e.g. `onnx-community/Qwen2.5-Coder-1.5B-Instruct`). **MiniLM** (`Xenova/all-MiniLM-L6-v2` or `onnx-community/all-MiniLM-L6-v2-ONNX`) is lighter (384-dim) if you change the embedding model id and matching `CODE_CRAWLER_EMBEDDING_DIM`. Changing embedding width requires a **new** semantic index database (or wiping the old one) so vec0 stays consistent. For large models, reduce `CODE_CRAWLER_EMBED_BATCH_SIZE` if indexing runs out of memory.

Models are loaded from `CODE_CRAWLER_TRANSFORMERS_MODELS_PATH` (Hub-style folders). To prefetch weights (useful offline or to avoid first-run downloads), from this package run `yarn download:models:embeddings`, `yarn download:models:reranker`, and/or `yarn download:models:rag` (see `package.json`).

Upgrading the `@huggingface/transformers` dependency can change floating-point embeddings for the same model id; if search quality degrades after an upgrade, **rebuild the semantic index** (new `CODE_CRAWLER_SEMANTIC_INDEX_DB_PATH` or delete the existing DB and re-index).

## Install and run

```bash
yarn install
yarn build
yarn start:prod
```

Development with reload:

```bash
yarn start
```

The `yarn start` script runs Nest in watch mode and **sets `CODE_CRAWLER_ROOT` to `$HOME/git/lichens`** for that process (see `package.json`). Other variables still come from your environment / `.env`. To use a different crawl root without editing the script, prefer `yarn build` then `yarn start:prod` with `.env` only, or invoke `nest start --watch` yourself with the env you need.

MCP endpoint: `http://<host>:<port>/mcp` (defaults from `.env.example`: `127.0.0.1:3333`). REST API base: `http://<host>:<port>/api`.

## Extending persistence

All index **CRUD** goes through `SemanticIndexStore` (`src/semantic-service/types/store.types.ts`), implemented by `SqliteSemanticIndexStore` / `workspaceSemanticIndexStore` in `src/semantic-service/persistence/sqlite/sqlite-semantic-index.store.ts` (SQLite + sqlite-vec + **FTS5 BM25** for hybrid workspace search: 70 % vector / 30 % lexical fused via `fuseChunkMatchesWithRRF` in `src/semantic-service/search/hybrid-chunk-fusion.utils.ts`; FTS schema is ensured when the store opens — see `docs/DATABASE.md`).

## Consumers: Cursor and Claude Code

Point your MCP client at the **full URL** including the path `/mcp`.

### Cursor

Edit your MCP config (e.g. project `.cursor/mcp.json` or user-level MCP settings) and add a server entry:

```json
{
  "mcpServers": {
    "code-crawler": {
      "url": "http://127.0.0.1:3333/mcp"
    }
  }
}
```

Start the server separately with the right environment (see `.env` / `.env.example`, especially `CODE_CRAWLER_ROOT`). Client config does not replace server env vars.

### Claude Code

Use the same `url` shape in your Claude Code MCP configuration file for this server.

## MCP Inspector

Run these commands from **`incubator/code-crawler`** (this package’s `package.json` lives there; the repo root has no Yarn scripts).

1. Start the server in another terminal: `yarn start:prod` (or `yarn start`) so `http://127.0.0.1:3333/mcp` is listening.
2. Run `yarn inspector`. It starts the inspector with **Streamable HTTP** and URL `http://127.0.0.1:3333/mcp` already set (via `--transport http --server-url …`).

**Port already in use:** The code-crawler HTTP port defaults to **3333** (`CODE_CRAWLER_PORT`). The MCP Inspector (started via `yarn inspector`) uses **its own** ports for the web UI and MCP proxy; the inspector reads **`CLIENT_PORT`** and **`SERVER_PORT`** from the environment if you need to avoid clashes. If either the app or the inspector fails to bind, stop the conflicting process (on macOS: `lsof -nP -iTCP:<port> -sTCP:LISTEN` then `kill <pid>`) or pick free ports, for example:

```bash
CLIENT_PORT=6280 SERVER_PORT=6281 yarn inspector
```

Change `CODE_CRAWLER_PORT` in `.env` if **3333** is taken by something other than this server.

## Indexing flow

Repository indexing centers on `runRepositoryIndexingFlow` in [`src/semantic-service/indexing/repository-indexing.flow.ts`](src/semantic-service/indexing/repository-indexing.flow.ts) (single repo or workspace-wide via [`runWorkspaceRepositoriesIndexing`](src/semantic-service/indexing/repository-indexing.flow.ts) from the same module). MCP/REST entry points live in [`src/semantic-service/semantic-workspace.tools.ts`](src/semantic-service/semantic-workspace.tools.ts). The flow walks files, chunks text, embeds batches, and persists via `workspaceSemanticIndexStore`.

## Security

The server has **no authentication**. Binding to `127.0.0.1` limits exposure to the local machine. Do not expose the port on untrusted networks without adding your own auth and TLS.

## Example config

See [`assets/examples/mcp.json`](assets/examples/mcp.json).

## Example prompts (MCP or API)

Prefix each bullet with:

    use code-crawler MCP to find <query-here>

### Lexical search only

- isAlphanumeric removeDiacriticalMarks
- interceptors InternalAxiosRequestConfig
  (play with the plural, remove the 's')

### How ranking is affected by adding rare lexical word(s)

- interceptor axios for authorization bearer
- interceptor axios for authorization bearer MSAL
- sanitize a string remove unwanted characters helper
- sanitize a string remove unwanted characters helper NFD

### Programming point of view

- interceptor axios for authorization bearer
- helpers for formatting dates and time values
- helper for removing latin special accents (normalize a string)
- code examples to present options through a drop down list (menu like)
- TanStack useMutation usage showing a snackbar message on error
- REST API controller definitions
- form fields validation with a schema and rules (e.g. Zod)

### Feature (business domain) point of view

- REST API controller returning list of pump motors
- REST API controller returning list of semantic search results
- water pump test result pdf generation
- service to remove latin accents from strings
- bonjour service usage to detect a device
- place where we consolidate segments and junctions for 3D

### Merged use case and technology

- modal webapp component displaying the version of both the frontend and backend systems
- visual component allowing to select the backend environment

## TODOs

* TODO-002: generateRagAnswerFromMatches should use a streaming API to return the answer progressively (usage of @microsoft/fetch-event-source on client side instead of SSE.js)
* TODO-003: extend `public/search/search-codebase` (HTML, CSS, JS) to call `/api/semantic-search-workspace-files-rag` in streaming mode and render the answer incrementally as chunks arrive
* TODO-004: API to show database state statistics
* TODO-005: Multi-queries variations (generate 2 new queries from original)
* TODO-008: document and plan beyond sqlite-vec limits: it is **not** an approximate ANN index and stays strong up to roughly **100k–1M** vectors; for larger corpora evaluate dedicated ANN / vector stores
* TODO-009: use LSP / tree-sitter static analysis to extract symbols and relations as first-class terms, so **semantic retrieval** (lean RAG: “find code similar to X”) and **dependency / call graph** reasoning (“what else is affected by X”) can evolve separately and be **combined** later (semantic search plus impact analysis)
* TODO-010: explore **ontology RAG**: ground truth in an **RDF graph** queried with **SPARQL**; layer an **LLM on top** only for natural-language access (translate intent to structured queries, explain results). The **ontology is the source of truth**; the LLM **assists**, it does not replace the triple store.
* TODO-011: when query variants are generated (e.g. multi-query expansion), expose them on the search response as extra metadata: add a `queryVariants: string[]` field listing the variant strings used for retrieval.
* TODO-012: when several chunks contribute to the same consolidated hit, surface every contributing span: add `allChunkLines: { startLine: number; endLine: number }[]` so clients can see all chunk line ranges behind that hit, not only a single range.

## Ontology

This section summarizes the **ontology / RDF** direction referenced in TODO-010. It does **not** describe the running product today: live search still uses the [Semantic Index](UBIQUITOUS_LANGUAGE.md#semantic-index-and-storage) (SQLite, [Vec0](UBIQUITOUS_LANGUAGE.md#semantic-index-and-storage), [FTS Table](UBIQUITOUS_LANGUAGE.md#semantic-index-and-storage)), [Chunks](UBIQUITOUS_LANGUAGE.md#chunking), and [Vector Search](UBIQUITOUS_LANGUAGE.md#search) / [Lexical Search](UBIQUITOUS_LANGUAGE.md#search) / [Hybrid Search](UBIQUITOUS_LANGUAGE.md#search) as documented in [UBIQUITOUS_LANGUAGE.md](UBIQUITOUS_LANGUAGE.md).

**[RDF](UBIQUITOUS_LANGUAGE.md#ontology-and-rdf)** (Resource Description Framework) models facts as **[triples](UBIQUITOUS_LANGUAGE.md#ontology-and-rdf)**—subject, predicate, object—so many statements form an **[RDF graph](UBIQUITOUS_LANGUAGE.md#ontology-and-rdf)**. **[SPARQL](UBIQUITOUS_LANGUAGE.md#ontology-and-rdf)** is the standard language to query that graph declaratively (patterns, filters, joins), much like SQL for tables but for linked data.

A **[triple store](UBIQUITOUS_LANGUAGE.md#ontology-and-rdf)** persists the graph and executes SPARQL. An **[ontology](UBIQUITOUS_LANGUAGE.md#ontology-and-rdf)** defines the shared vocabulary (classes and properties) so facts stay consistent. **[Ontology RAG](UBIQUITOUS_LANGUAGE.md#ontology-and-rdf)** here means: the graph is the **authoritative** representation for structured questions; a large language model **assists** with natural-language access (e.g. intent → SPARQL sketch, result explanation) instead of replacing the store.

**Relationship to chunk-based search.** [Indexing Flow](UBIQUITOUS_LANGUAGE.md#indexing) still produces [File Records](UBIQUITOUS_LANGUAGE.md#indexing) and [Graph Chunks](UBIQUITOUS_LANGUAGE.md#chunking) with [Embed Text](UBIQUITOUS_LANGUAGE.md#chunking); [Repository](UBIQUITOUS_LANGUAGE.md#workspace-and-repositories) and [Source Language](UBIQUITOUS_LANGUAGE.md#indexing) remain natural filter dimensions—today in SQL/sqlite-vec, tomorrow as RDF literals or links if the graph is introduced. Fuzzy, natural-language prompts (such as the example queries earlier in this README) lean on **semantic similarity** over [Documents](UBIQUITOUS_LANGUAGE.md#chunking) / embeddings; a graph alone does not replace that, so a practical design often **combines** a triple store for precise structure and relations with **retrieval over chunk text** (or literals attached to graph nodes) for “find something like this phrase”. [File Consolidation](UBIQUITOUS_LANGUAGE.md#search) and optional [RAG Response](UBIQUITOUS_LANGUAGE.md#search) stay relevant whichever backend stores the hits.
