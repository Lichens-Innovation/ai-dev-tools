# setup-claude-just-usage

Makes Claude run a repository's `just` recipes instead of the tools they wrap. For every level that has a justfile (root, `apps/frontend`, `packages/ui`, ...) it writes a `.claude/rules/use-just-commands.md` listing the recipes, and a hook config that denies the non-just equivalents. Run with `/setup-claude-just-usage`. Not loaded into Claude's context: only `SKILL.md` (when invoked) and the generated rules are.

Modeled on the `agents.md` rule + `agent_bash_validation.sh` hook of `lichens-ordonnancement-api`, generalized: one shared hook script, one config per level instead of hard-coded regexes.

## Files

| File | Role |
| ---- | ---- |
| `SKILL.md` | Install workflow (read only when the skill runs) |
| `scripts/use-just-commands.mjs` | The hook, copied to `.claude/hooks/use-just-commands.mjs`; reads the per-level configs |
| `assets/use-just-commands.md` | Template for each level's `.claude/rules/use-just-commands.md`; loads every session, so keep it short |
| `scripts/test-use-just-commands.sh` | Regression tests (~40 cases) in a throwaway two-level project; run after every hook change |

## Generated, per repository

- `<level>/.claude/rules/use-just-commands.md`: the recipes, what they replace, "always use just".
- `<level>/.claude/hooks/use-just-commands.json`: `{ "blocked": [{ "command", "message" }] }`.
- `.claude/hooks/use-just-commands.mjs` and the `PreToolUse` `Bash` entry in `.claude/settings.json`, once. Committed: the justfile is a team convention.

## Design choices

- **One hook, many configs.** Sub-level `settings.json` hooks only apply when Claude is started in that directory. A single root registration, which picks the configs from the directory a command runs in (`cwd`, moved by `cd <dir> &&`) up to the root, works from anywhere in the repo.
- **Blocked list is derived, then confirmed.** The skill reads recipe bodies to find the wrapped tools and shows the list before writing. Blocking a program (`docker`) vs program + subcommand (`pnpm test`) is chosen per tool, so `pnpm install` keeps working when only `pnpm test` has a recipe.
- **Runners are automatic.** `uv run X`, `uvx X`, `npx X`, `pnpm exec X` match as `X`.
- **Fails open.** An internal error lets the call through: this is a convenience hook, not a safety one (unlike the guardrails hook, which fails closed).

## Known limits

The hook reads command text, so `bash -c`, `eval`, variables and scripts get past it. Configs and rules reflect the justfile at install time: re-run after recipes change. See `SKILL.md` → Limits.
