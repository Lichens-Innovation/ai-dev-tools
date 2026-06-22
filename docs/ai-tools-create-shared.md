# Shared reference for the create-* skills

This doc holds the parts the four ai-tools-manager create flows
(`create-skill`, `create-subagent`, `create-plugin`, `create-marketplace`) have in common, so each
`SKILL.md` can link here instead of repeating them. The flow-specific bits — target dispatch,
auto/manual rules, skeletons, report steps — stay in each skill.

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

The form data is a JSON object, supplied one of two ways:

- The `UserPromptExpansion` hook injected it into your context as `additionalContext` (when the
  flow was launched on its own, e.g. `/create-skill`), or
- The `/ai-tools` dispatcher hands it to you directly (when the user is in a persistent app
  session).

Either way, parse the JSON and proceed. The shape (`mode`, `target`, fields) is documented per
flow in that flow's own `SKILL.md`.

## Finishing a scaffold

The app **pre-scaffolds deterministically** the moment a form is submitted (see
`src/utils/scaffold.ts`), so the payload carries a `Deterministic scaffold` object
`{ scaffolded, path, remaining, reason? }`:

- **`scaffolded: true`** — the artifact already exists at `path` with its frontmatter/manifest
  written (the description was already computed by the app's `buildDesc`). **Do not recreate it.**
  Do only the `remaining` work, **in place** — for an auto-mode body that means `Edit` the
  placeholder at `path`; a manual-mode skeleton or a plugin/marketplace manifest is usually already
  complete, so just verify and report.
- **`scaffolded: false`** — the app couldn't write (e.g. a brand-new marketplace dir outside the
  mounted repo under Docker; `reason` says why). Create the artifact from scratch at `path`
  following the flow's normal rules below.
