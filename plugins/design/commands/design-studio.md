---
allowed-tools: Bash(docker:*), Bash(claude mcp:*), Bash(curl:*), Bash(open:*), Bash(xdg-open:*), Bash(git rev-parse:*), Bash(id:*), Bash(test:*), Bash(ls:*), Bash(node:*)
description: Start or open this project's local design studio container and register its MCP server
argument-hint: "[rebuild]"
---

## Your task

Start (or just open) the **design studio** for the current project: one Docker container per
project, serving the project's `design/` folder. Used by the design plugin's `local` backend
([`local-studio.md`](${CLAUDE_PLUGIN_ROOT}/references/local-studio.md)).

### 1. The project

- Repo root: `git rev-parse --show-toplevel`. It must hold `design.manifest.json`; without it, tell
  the user to run `/design-init` and stop.
- It must have a `design/` folder (the studio mounts the project and needs `design/index.json` to
  list pages). If missing, say `/design-init` creates it, and stop.
- `<name>`: the repo folder's name, lowercase, anything but letters and digits turned into `-`.
- `<port>`: the manifest's `studio.port`. Without one, take 3009 and, if something already
  listens on it (`curl -s -o /dev/null http://localhost:3009/` answers) and it is not this
  project's container, the next free port after it. Write the chosen port to the manifest as
  `"studio": { "port": <port> }` so the MCP URL and the skills agree on it.

### 2. Find the ai-dev-tools checkout

The studio's source is `apps/design-studio` in the ai-dev-tools checkout; its compose file builds
from the checkout's root. Resolve `<checkout>`, first match wins:

1. `$AI_DEV_TOOLS_DIR`, when set.
2. The plugin's own location, walking up from `${CLAUDE_PLUGIN_ROOT}` to the first folder that
   holds `apps/design-studio/docker-compose.yml` (the plugin is loaded from the checkout, or from
   the marketplace clone of it).
3. A marketplace clone: `ls -d ~/.claude/plugins/marketplaces/*/apps/design-studio` (the folder two
   levels up from the match).

None found: ask the user for the path of their ai-dev-tools checkout, and suggest they set
`AI_DEV_TOOLS_DIR` so it is found next time. Never hardcode a path, and never write one into the
project's files.

### 3. Start or open

Run from `<checkout>/apps/design-studio`, with the project's environment on every `docker compose`
call: `PROJECT_DIR=<repo root> STUDIO_PORT=<port> HOST_UID=$(id -u) HOST_GID=$(id -g)`, and always
`-p design-<name>`.

- `docker compose -p design-<name> ps --format "{{.State}}"`.
- Output contains `running` and `$ARGUMENTS` is not `rebuild`: already up, go to step 5.
- Otherwise `docker compose -p design-<name> up -d --build` (the image holds the app and has no
  source mount, so `--build` also picks up an updated checkout; it takes a while the first time).
- Then wait until `curl -sf http://localhost:<port>/` answers (poll for up to 60 seconds, a few
  seconds apart). If it never does, show `docker compose -p design-<name> logs --tail 40` and stop.

### 4. Register the MCP server, once

`claude mcp list` shows the servers. If there is no `design-studio`:

```bash
claude mcp add --scope project --transport http design-studio http://localhost:<port>/mcp
```

This writes the project's `.mcp.json`: tell the user to commit it, and that teammates run the
studio on the same `studio.port` (a different port means editing that URL). If `design-studio`
exists with another URL, show both and ask before changing it. A new MCP server connects at the
start of a session: tell the user to run `/mcp` → reconnect, or restart, to get its tools
(`list_pages`, `get_page`, `create_proposal`, `write_page`, `get_selection`, `get_palette`,
`set_palette`, `open_page`).

### 5. Open the studio

`open http://localhost:<port>` (`xdg-open` on Linux). If the sandbox blocks it, give the URL.

Report which case applied (already running / started / rebuilt and started), the URL, and whether the
MCP server was registered now or already was.
