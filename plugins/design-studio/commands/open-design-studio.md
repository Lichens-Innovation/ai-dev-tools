---
allowed-tools: Bash(open:*), Bash(xdg-open:*), Bash(git rev-parse:*), Bash(id:*), Bash(ls:*), Bash(node:*), Read, Write, Edit, AskUserQuestion
description: Start or open this project's local design studio container and register its MCP server
argument-hint: "[rebuild]"
---

## Your task

Start (or just open) the **design studio** for the current project: one Docker container per
project, serving the project's `design/` folder. Used by the design-studio plugin's `local` backend
([`local-studio.md`](${CLAUDE_PLUGIN_ROOT}/references/local-studio.md)).

Every call below is one command, with no `cd`, no variables before it, no `$(...)`, pipe or `&&`:
that is what lets it leave a Claude Code sandbox (step 4) and match a permission rule. The
`docker compose` calls are not pre-approved: each one goes through the user's permission prompt.

### 1. The project

- Repo root: `git rev-parse --show-toplevel`. It must hold `design.manifest.json`; without it, tell
  the user to run `/init-design-studio` and stop.
- It must have a `design/` folder (the studio mounts the project and needs `design/index.json` to
  list pages). If missing, say `/init-design-studio` creates it, and stop.
- `<name>`: the repo folder's name, lowercase, anything but letters and digits turned into `-`.
- `<port>`: the manifest's `studio.port`, else 3009. Step 5 moves it on when the port is taken.
- `<uid>` and `<gid>`: `id -u` and `id -g`, two calls.

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
project's tracked files (`.claude/settings.local.json` in step 4 is the user's own, untracked).

### 3. The variables file

The compose file reads `PROJECT_DIR`, `STUDIO_PORT`, `HOST_UID` and `HOST_GID`. Write them with
the Write tool to `<env>` = `/tmp/claude-<uid>/design-<name>.compose-vars` (the real path, not
`$TMPDIR`: the calls may run outside the sandbox, where it differs), exactly these four lines. The
name is deliberate: it holds no secrets, and a name ending in `.env` is refused by the guardrails'
env-file block; `--env-file` takes any name. Never name it after an env file:

```
PROJECT_DIR=<repo root>
STUDIO_PORT=<port>
HOST_UID=<uid>
HOST_GID=<gid>
```

Read it back before the first `docker compose` call: it must hold these four lines and nothing
else, `PROJECT_DIR` must be the repo root of step 1. Otherwise rewrite it. Show its content to the
user with the first call, since the call's prompt shows only the file's path.

Every `docker compose` call is `docker compose -f <checkout>/apps/design-studio/docker-compose.yml
-p design-<name> --env-file <env>` followed by the subcommand; `<compose>` below stands for that
prefix. The calls this command makes are exactly these four:

| Call                                                         | For                       |
| ------------------------------------------------------------ | ------------------------- |
| `<compose> ps --status running --quiet`                      | is it running             |
| `<compose> up -d --build`                                    | start or rebuild          |
| `<compose> exec -T app wget -q -O /dev/null http://localhost:<port>/` | does it answer   |
| `<compose> logs --tail 40`                                   | why it does not           |

### 4. A sandboxed session

Docker cannot run inside Claude Code's sandbox: the call fails with `failed to connect to the
docker API` (or a `docker.sock` permission error), and the studio's port cannot be reached from
inside either. The four calls of step 3 have to be listed in `sandbox.excludedCommands`, exactly,
so that they and nothing broader run outside it (a wider rule like `docker compose *` would allow
`run -v /:/host`, a way around the sandbox and the guardrails).

1. Read `.claude/settings.local.json` and `.claude/settings.json` of the repo root (Read tool;
   either may be missing). The sandbox is on when either has `"sandbox": { "enabled": true }`. If
   neither says so, skip this step; a step 5 call that fails with the error above means it is
   on in the user's settings: come back here.
2. The four entries are the four calls of step 3, written out in full: no placeholder, no `*`.
   All present in `excludedCommands` (either file): go on. Entries starting `docker compose -f`
   with `-p design-<name>` but another checkout path, variables file or port are stale (the plugin
   moved, or the port changed): they are replaced, not kept.
3. Otherwise show the change to `.claude/settings.local.json` as a diff (the entries added, the
   stale ones removed) and ask with `AskUserQuestion`: **Add them** (recommended), **I'll add them
   myself**, or **Not now**.
   - **Add them**: edit `.claude/settings.local.json` with Edit (Write when it does not exist):
     keep every other key, append to the array without duplicates, 2-space indentation. Claude
     Code asks the user to confirm edits to settings files: that is expected. If the next call
     still fails on the socket, the session has to be restarted to pick the change up.
   - **I'll add them myself**: print the JSON lines to add, and stop until they say it is done.
   - **Not now**: give the user the calls of step 5 to run themselves with `!` (one per line),
     and do the rest (steps 6 and 7) yourself.

Never edit `settings.json` (tracked), and never add anything broader than these four entries.

### 5. Start or open

- `ps --status running --quiet` prints a container id and `$ARGUMENTS` is not `rebuild`: already
  up, go to the health check.
- Otherwise `up -d --build` (the image holds the app and has no source mount, so `--build` also
  picks up an updated checkout; it takes a while the first time). If it fails with `port is
  already allocated`, take the next port, rewrite the variables file (step 3) and the step 4 entries,
  and run it again.
- Health check: the `exec … wget` call, until it exits 0 (up to 60 seconds, a few seconds
  apart). It runs inside the container, so it works from a sandbox. If it never does, show the
  `logs` call's output and stop.
- Write the port to the manifest as `"studio": { "port": <port> }` when it is not there yet or
  changed, so the MCP URL and the skills agree on it.

### 6. Register the MCP server, once

The server is registered at project scope, in the repo root's `.mcp.json`. Read that file (do not
use `claude mcp list`: it reads `~/.claude.json`, which the guardrails keep out of reach, and
`claude` may not be on the sandbox's `PATH`).

- No `design-studio` entry (or no file): add one with Edit (Write when there is no file), keeping
  the other servers:

  ```json
  "design-studio": { "type": "http", "url": "http://localhost:<port>/mcp" }
  ```

  under `mcpServers`. Tell the user to commit it, and that teammates run the studio on the same
  `studio.port` (a different port means editing that URL).
- An entry with another URL: show both and ask before changing it.
- A new or changed server connects at the start of a session: tell the user to run `/mcp` →
  reconnect, or restart, to get its tools (`list_pages`, `get_page`, `create_proposal`,
  `write_page`, `create_alternate`, `get_selection`, `get_palette`, `set_palette`, `open_page`,
  `list_wireframes`, `get_wireframe`, and for Make real `list_sketch_requests`,
  `get_sketch_request`, `resolve_sketch_request`). With `enabledMcpjsonServers` in the user's
  settings, `design-studio` must be in it, or Claude Code asks to approve it.

**Make real through a channel.** The design-studio plugin's channel pushes the studio's Make real requests into the
session. It is a research preview and needs this flag when Claude Code starts:

```bash
claude --dangerously-load-development-channels plugin:design-studio@lichens-ai-dev-tools
```

Tell the user. Without it, Make real still works: the studio shows **Copy command**
(`/sketch-in-studio <id>`) to paste into the session.

### 7. Open the studio

`open http://localhost:<port>` (`xdg-open` on Linux). If the sandbox blocks it, give the URL.

Report which case applied (already running / started / rebuilt and started), the URL, whether the
sandbox entries were added, already there or left to the user, and whether the MCP server was
registered now or already was.
