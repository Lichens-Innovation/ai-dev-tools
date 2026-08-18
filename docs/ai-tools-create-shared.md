# Shared reference for the create-* skills

This doc holds the parts the four create flows (`create-skill`, `create-subagent`,
`create-plugin`, `create-marketplace`) have in common, so each `SKILL.md` can link here instead of
repeating them. The flow-specific bits — target dispatch, auto/manual rules, skeletons, report
steps — stay in each skill.

## References

Consult the relevant doc(s) before generating content in auto mode or before making structural
decisions in manual mode (paths relative to this `docs/` directory):

- [`skills.md`](skills.md) — skill format, popular repositories, skills CLI
- [`plugins.md`](plugins.md) — plugin structure, manifest, hooks and relative paths
- [`hooks.md`](hooks.md) — hook lifecycle, PreToolUse / PostToolUse, hook scripts
- [`marketplace.md`](marketplace.md) — marketplace structure, registration, publishing, versioning, auto-updates
- [`subagents.md`](subagents.md) — subagent usage, AGENTS.md format, coordination tips
- [`rules.md`](rules.md) — rules format and scope
- [`mcp.md`](mcp.md) — MCP server configuration
- [`memory.md`](memory.md) — memory system, persistent memory for subagents
- [`skills-cli.md`](skills-cli.md) — skills CLI commands
- [`claude-code.md`](claude-code.md) — Claude Code settings, commands, IDE integrations

## Where the payload comes from

The flow's inputs are a JSON object (`mode`, `target`, and the per-flow fields). It reaches you one
of two ways:

- **From the Maestro desktop app.** `apps/maestro`'s four `create-*` routes are the forms now. On
  submit the route scaffolds deterministically in-process, then builds a prose prompt carrying the
  payload and the scaffold result, shows it in full in a confirmation dialog, and — once the user
  confirms — runs it through `claude -p`. If you are reading this inside such a run, the payload is
  already inlined above.
- **From the conversation.** A user can invoke the skill directly (`/create-skill`) with no app
  involved. There is no form and nothing is pre-scaffolded: gather the same fields by asking, then
  do every step yourself.

Either way, the flow-specific shape is documented in that flow's own `SKILL.md`.

There is no form-and-result-file round trip any more. Nothing writes `/tmp/result.json`, nothing
blocks on it, and no `UserPromptExpansion` hook launches a UI — if you find a skill or doc still
describing that, it is stale.

## Finishing a scaffold

When the run came from the desktop app, the artifact is **already on disk**: the route calls
`scaffoldSkill` / `scaffoldSubagent` / `scaffoldPlugin` / `scaffoldMarketplace` in
`@repo/maestro-core` *before* Claude is mentioned, so cancelling the confirmation still leaves the
user with the thing they asked for. The payload therefore carries a `Deterministic scaffold` object
`{ scaffolded, path, remaining, reason? }`:

- **`scaffolded: true`** — the artifact exists at `path` with its frontmatter/manifest written (the
  description was already computed by core's `buildDesc`, the single implementation the app's live
  preview also renders). **Do not recreate it.** Do only the `remaining` work, **in place** — for an
  auto-mode body that means `Edit` the placeholder at `path`; a manual-mode skeleton or a
  plugin/marketplace manifest is usually already complete, so verify and report.
- **`scaffolded: false`** — the scaffold could not write and `reason` says why (a bad path, a
  permission error, an existing file it refused to clobber). Create the artifact from scratch at
  `path` following the flow's normal rules below.
- **No `scaffold` object at all** — you were invoked conversationally. Nothing exists yet; do
  everything.
