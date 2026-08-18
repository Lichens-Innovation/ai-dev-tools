# Changelog

Notable changes, newest first. This file starts at maestro task `018`; everything before it is in
`.claude/maestro-tasks/` and `docs/plans/`.

## Unreleased

### maestro — a live Claude session in a right-hand pane, and the help chat is gone

- One live, multi-turn Agent SDK session per open project, in a **resizable right-hand pane that
  shifts the layout** rather than overlaying it. `session-pane.tsx` renders the transcript, composer,
  resize handle and read-scope disclosure; `SessionProvider` in `__root.tsx` owns the state, because
  `TopNav` remounts on every navigation. On the create-\* routes the pane takes the `FilePreview`
  column.
- **The help chat is deleted** — `chat-panel.tsx`, `chat-context.tsx`, the `help-chat` member of
  `ClaudeRequest`, `ChatTurn`, and `buildChat` with its history caps. The pane inherits the
  `super-help` dependency as a **session skill** rather than a name in a prompt string.
- The session lives in main, one per `webContents.id` — the same ownership shape as the log tail.
  `src/main/claude-session.ts` composes no prompt, resolves no CLI path and imports no
  `child_process`; teardown reuses `terminateChildGroup()`, now exported from `claude-run.ts`, so the
  pane performs the identical escalation `cancelClaudeRun` does. A project switch ends every session
  and starts nothing; quitting mid-turn leaves no surviving `claude`.
- New IPC: `session:start`, `session:info`, `session:say`, `session:stop`, `session:end`, and the
  `session:event` push channel. **`session:say` carries user-typed text and nothing else**, stamped
  human-authored — the bridge's invariant restated for a surface with no per-turn confirmation.
- **The pane is read-only.** The write scope is empty and nothing can add to it yet, so a refused
  write carries `decideWrite`'s existing "started to answer, not to author" reason. One permission
  engine, two callers.
- **Reads are bounded for the first time**, by a `PreToolUse` hook over a third scope module:
  `src/core/session-scope.ts` (`decideBoundary`, `boundaryTargetOf`, `BOUNDED_TOOLS`,
  `UNBOUNDED_TOOLS`) — pure, and exhaustively unit-tested. `read-scope.ts` discloses,
  `write-scope.ts` bounds writes, this bounds reads. It returns `"out-of-scope"` rather than
  `"deny"`, so routing it to a prompt in `020` is one word plus a UI.
- The readable set is the open project plus **every** local marketplace, resolved in main by
  `listMarketplaces()`; no name and no path crosses the process boundary. They reach the SDK as
  `additionalDirectories` (a first for this app) and the disclosure as the new `origin: "app"`.
- **`skills` alone loads nothing** — the session also needs a local `plugins` entry pointing at
  `bundledPluginDir()`, or the `Skill` tool answers "Unknown skill" for every name. That is the
  plugin **bundled with the app**, not the user's marketplace cache, so a `SKILL.md` edit in this
  repo reaches the pane with no version bump. The plugin's `hooks.json` does **not** fire in a pane
  session, so its tool calls stay out of `maestro_session.log.jsonl` and `/session-log`.
- `PANE_TOOLS = [...SESSION_TOOLS, "Skill"]`. **`AskUserQuestion` is still offered nowhere**: nothing
  renders a structured question yet, and an unoffered tool costs nothing where an offered-then-refused
  one costs turns. It arrives with `021`.
- `settingSources: []` now appears **four** times in `agent-sdk.ts` (smoke, run session, pane session,
  `resolveEffectiveSettings`); `test/isolation.test.ts` counts four. A pane session therefore
  auto-loads no `CLAUDE.md` either.

### maestro — every Claude run is an Agent SDK session, and nothing pre-accepts edits

- `claude:run` no longer spawns `claude -p --permission-mode acceptEdits <prompt>`. Every run —
  create-\*, `/maestro-tasks`, the help chat — is an Agent SDK session (`startAgentSession()` in
  `src/core/agent-sdk.ts`, still the app's only SDK importer).
- **Edit pre-acceptance exists nowhere in the app.** A session may write only the paths the
  confirmation dialog displayed, carried on the preview token as `ClaudeInvocation.writable`; every
  other write is denied with a reason the model can act on. The decision is `decideWrite` in the new
  `src/core/write-scope.ts` — pure, no `fs`, no spawn, no SDK — reached through the SDK's
  `canUseTool`. `test/isolation.test.ts` fails if `acceptEdits`, `bypassPermissions` or
  `dangerouslySkipPermissions` reappears under `src/`.
- The session is offered no shell and no subagents:
  `SESSION_TOOLS` = `Read, Glob, Grep, TodoWrite, WebSearch, WebFetch, Edit, Write`,
  `SESSION_DISALLOWED_TOOLS` = `Bash, Agent, NotebookEdit`.
  Withholding `Bash` is what makes the path check meaningful, and is affordable because `016` moved
  `git init` into the deterministic scaffold.
- A run loads no filesystem settings (`settingSources: []`), so nothing on disk can widen it and no
  key in a settings file can redirect billing. `resolveEffectiveSettings()` now passes `[]` too, so
  the read disclosure describes the session that actually exists — it narrowed visibly, and
  `CLAUDE.md` files are no longer auto-loaded into a run. The managed (administrator) policy tier
  still applies.
- `CLAUDE_ASK_FLAGS` and `BuiltRequest.flags` are deleted; `CLAUDE_BASE_FLAGS` is `["-p"]`. With
  `acceptEdits` gone there is no flag-level difference between an authoring invocation and an asking
  one — the difference is the write scope, which is a list of paths on screen.
- `ClaudePreview.argv` is now the **equivalent** `claude -p` command line rather than what is
  spawned; the dialog's row is relabelled "Equivalent". `ClaudeRunResult.argv` reports what actually
  went out, `code` is `0` on success and `null` otherwise, and the UI renders `error`.
- The child is still a detached process-group leader (the app supplies `spawnClaudeCodeProcess`), and
  teardown is `query.close()` → SIGTERM to the group → SIGKILL after a grace.
