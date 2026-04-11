# code-crawler

MCP server (Model Context Protocol) for crawling local Git repositories and **semantic search** over file contents using **Transformers.js** in-process. This package exposes **Streamable HTTP** at `/mcp` (no stdio transport).

The semantic index is persisted in **SQLite** (see `SemanticIndexStore` / `sqlite-semantic-index.store.ts`).

## Prerequisites

- Node.js 22+
- First embedding use may **download model weights** (cached by Transformers.js / Hugging Face conventions).

## Configuration

Environment variables are documented in [`.env.example`](.env.example) (defaults and behavior live in [`src/utils/env.utils.ts`](src/utils/env.utils.ts)).

From this package directory:

```bash
cp .env.example .env
```

Edit `.env` (at minimum set `CODE_CRAWLER_ROOT` to the parent folder of your Git repositories if you use the default workspace layout).

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

MCP endpoint: `http://<host>:<port>/mcp` (default bind `127.0.0.1:3333` unless overridden in `.env` — see `.env.example`).

## Extending persistence

All index **CRUD** goes through `SemanticIndexStore` (`semantic-index-store.types.ts`), implemented by `SqliteSemanticIndexStore` / `workspaceSemanticIndexStore` in `sqlite-semantic-index.store.ts` (SQLite + sqlite-vec).

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

**`MCP Inspector PORT IS IN USE` (3333):** Another inspector (or app) is still bound to the default UI port. Close that terminal or tab, or stop the process (on macOS: `lsof -nP -iTCP:3333 -sTCP:LISTEN` then `kill <pid>`). You can also use alternate ports: `CLIENT_PORT=3334 SERVER_PORT=6278 yarn server:inspect`.

## Embeddings creation

Look for method: `runRepositoryIndexingFlow` (could be called for a single repo or inside a loop of repos)

## Security

The server has **no authentication**. Binding to `127.0.0.1` limits exposure to the local machine. Do not expose the port on untrusted networks without adding your own auth and TLS.

## Example config

See [`assets/examples/mcp.json`](assets/examples/mcp.json).
