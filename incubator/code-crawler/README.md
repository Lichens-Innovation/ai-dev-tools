# code-crawler

MCP server (Model Context Protocol) for crawling local Git repositories and **semantic search** over file contents using **Transformers.js** (default: `Xenova/all-MiniLM-L6-v2`) in-process. This package exposes **Streamable HTTP** at `/mcp` (no stdio transport).

The semantic index is **in memory only** (v1): restarting the server clears it; run `prepare-repository-for-semantic-search` again (or `yarn index:all-local-repositories`) to rebuild.

## Prerequisites

- Node.js 22+
- First embedding use may **download model weights** (cached by Transformers.js / Hugging Face conventions).

## Install and run

```bash
yarn install
yarn build
CODE_CRAWLER_ROOT="$HOME/git/your-workspace" yarn start:prod
```

Defaults:

- Listen address: `127.0.0.1` (override with `CODE_CRAWLER_HOST`, e.g. `0.0.0.0` in containers)
- Port: `3333` (override with `CODE_CRAWLER_PORT` or `PORT`)

Optional:

- `CODE_CRAWLER_EMBEDDING_MODEL` — override the embedding model id (default `Xenova/all-MiniLM-L6-v2`).

Development with reload:

```bash
yarn start
```

MCP endpoint: `http://<host>:<port>/mcp`

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

Start the server separately with the right environment (especially `CODE_CRAWLER_ROOT`). Client config does not replace server env vars.

### Claude Code

Use the same `url` shape in your Claude Code MCP configuration file for this server.

## MCP Inspector

Run these commands from **`incubator/code-crawler`** (this package’s `package.json` lives there; the repo root has no Yarn scripts).

1. Start the server in another terminal: `yarn start:prod` (or `yarn start`) so `http://127.0.0.1:3333/mcp` is listening.
2. Run `yarn inspector`. It starts the inspector with **Streamable HTTP** and URL `http://127.0.0.1:3333/mcp` already set (via `--transport http --server-url …`).

**`MCP Inspector PORT IS IN USE` (3333):** Another inspector (or app) is still bound to the default UI port. Close that terminal or tab, or stop the process (on macOS: `lsof -nP -iTCP:3333 -sTCP:LISTEN` then `kill <pid>`). You can also use alternate ports: `CLIENT_PORT=3334 SERVER_PORT=6278 yarn server:inspect`.

## Security

The server has **no authentication**. Binding to `127.0.0.1` limits exposure to the local machine. Do not expose the port on untrusted networks without adding your own auth and TLS.

## Example config

See [`assets/examples/mcp.json`](assets/examples/mcp.json).
