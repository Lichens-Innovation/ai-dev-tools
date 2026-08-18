# Shared reference for the create-\* skills

This doc holds what the four create flows (`create-skill`, `create-subagent`, `create-plugin`,
`create-marketplace`) have in common **for a reader** — the reference docs, and the three entries a
flow can be reached from.

It is **not** the guidance a session follows. Since `026` that lives in exactly one place per flow:
`plugins/ai-tools-manager/skills/<flow>/SKILL.md`. The desktop app's confirmation prompt carries the
facts (the path the scaffold wrote, the form's own words, the repository state) and names the skill
for the rest; a terminal invocation loads the same file. Anything written here that a session is
supposed to obey would be a second copy, which is the drift `026` removed.

## References

Consult the relevant doc(s) before generating content, or before making structural decisions
(paths relative to this `docs/` directory):

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

## The three entries

A create flow reaches a model one of three ways, and they differ in what is already on disk and in
whether anybody is there to answer a question. Each `SKILL.md` opens by working out which one it is
on; this is the same table from the outside.

| Entry | What exists | Who is there |
| --- | --- | --- |
| **App — headless run** | The artifact, scaffolded before any model was involved | Nobody. A refused write is final; there is no `AskUserQuestion` and no `Bash` |
| **App — session pane** | The same artifact, plus a seeded context block naming it | The user. A write outside the scope, or a read outside the boundary, becomes a prompt they can allow |
| **Terminal** | Nothing | The user, through whatever their CLI offers |

On both app entries the form captured the name, the description and the triggers, and the user
approved the exact frontmatter on screen — so none of it is re-asked, and the frontmatter is not
rewritten. On the terminal entry all of it is still to be gathered.

## The scaffold, and why the ordering matters

When the flow came from the desktop app, the artifact is **already on disk**: the route calls
`scaffoldSkill` / `scaffoldSubagent` / `scaffoldPlugin` / `scaffoldMarketplace` in
`apps/maestro/src/core` *before* Claude is mentioned, so cancelling the confirmation still leaves the
user with the thing they asked for. What is left for a session is the part that genuinely needs a
model: a body, a README, a `CLAUDE.md`.

`create-marketplace` is the sharp case. `git init` and the first commit are steps in that same
all-or-nothing scaffold, so the repository question is settled before a session starts, and the
session is **told which of three states it left** — created here, already inside one, or no `git` on
the machine. A session reads that rather than probing for it, and runs no `git` itself; on the
terminal entry, where no scaffold ran, the repository is the user's to create and the commands are
offered rather than run.

There is no form-and-result-file round trip. Nothing writes `/tmp/result.json`, nothing blocks on
it, and no `UserPromptExpansion` hook launches a UI — if you find a skill or doc still describing
that, it is stale.
