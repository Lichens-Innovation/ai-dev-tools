# Changelog

Notable changes, newest first. This file starts at maestro task `018`; everything before it is in
`.claude/maestro-tasks/` and `docs/plans/`.

## Unreleased

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
