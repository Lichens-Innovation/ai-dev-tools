# code-crawler

MCP server (Model Context Protocol) for crawling local Git repositories and **semantic search** over file contents using [**@huggingface/transformers**](https://www.npmjs.com/package/@huggingface/transformers) (Transformers.js) in-process. This package exposes **Streamable HTTP** at `/mcp` (no stdio transport). The same process also serves a **REST API** under `/api` and static files (hub, demos, search UI) at `/`.

The semantic index is persisted in **SQLite** (see `SemanticIndexStore` / `src/semantic-service/persistence/sqlite/sqlite-semantic-index.store.ts`).

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

Models are loaded from `CODE_CRAWLER_TRANSFORMERS_MODELS_PATH` (Hub-style folders). To prefetch weights (useful offline or to avoid first-run downloads), from this package run `yarn download:models:embeddings` and/or `yarn download:models:rag` (see `package.json`).

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

All index **CRUD** goes through `SemanticIndexStore` (`src/semantic-service/types/store.types.ts`), implemented by `SqliteSemanticIndexStore` / `workspaceSemanticIndexStore` in `src/semantic-service/persistence/sqlite/sqlite-semantic-index.store.ts` (SQLite + sqlite-vec + **FTS5 BM25** for hybrid workspace search: 70 % vector / 30 % lexical in `fuseHybridChunkMatches`; FTS schema is ensured when the store opens — see `docs/DATABASE.md`).

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

## Example prompts (MCP)

- Using code-crawler MCP: find date and time helpers for formatting dates.
- Using code-crawler MCP: find date and time helpers for formatting time.
- use code-crawler MCP to find water pump test result pdf generation
- use code-crawler MCP to find service to remove latin accents from strings
- use code-crawler MCP to find code examples to present options to user through a drop down list
- Use code-crawler MCP to find TanStack Query usage for a data mutation (update) with an error handler showing a snackbar type message.
- Use code-crawler MCP to find bonjour service usage to detect a device
- Use code-crawler MCP to find how to cache data retrieved from an http api call for a specific period of time
- Use code-crawler MCP to find REST API controller definitions.
- Use code-crawler MCP to find form validation examples with a schema and rules (e.g. Zod).

## TODOs

* TODO-001: generateRagAnswerFromMatches should use a streaming API to return the answer progressively (usage of @microsoft/fetch-event-source on client side instead of SSE.js)
* TODO-002: extend `public/search/search-codebase` (HTML, CSS, JS) to call `/api/semantic-search-workspace-files-rag` in streaming mode and render the answer incrementally as chunks arrive
* TODO-003: let users filter searches by source-code / file types (e.g. checkboxes for extensions or language groups)
* TODO-004: stop loading scripts or assets from `cdn.jsdelivr.net`; ship pinned versions locally and reference them from HTML (no CDN dependency for the search UI)
* ~~TODO-006~~: semantic indexing uses **tree-sitter** (`tree-sitter-typescript`) for AST-aware chunks with intra-file call hints (`calls` / `calledBy`); see `src/semantic-service/chunking/`.
* TODO-007: add a **reranker** after ANN retrieval to boost precision; `jinaai/jina-reranker-v1-tiny-en` is Transformers.js–compatible for a second-stage score on candidate chunks
* TODO-008: document and plan beyond sqlite-vec limits: it is **not** an approximate ANN index and stays strong up to roughly **100k–1M** vectors; for larger corpora evaluate dedicated ANN / vector stores
* TODO-009: skip re-embedding / re-indexing a file when the persisted **content SHA** used for its stored semantic vectors matches the **current file SHA** (unchanged source → reuse existing chunks and vectors)

