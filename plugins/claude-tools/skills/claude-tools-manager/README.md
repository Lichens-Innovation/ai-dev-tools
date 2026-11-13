# claude-tools-manager

One entry point to set up, and keep up to date, the claude-tools project setups in a repository: `claude-light`, `setup-claude-auto-lint-format`, `setup-claude-just-usage` and `setup-claude-guardrails`. Run with `/claude-tools-manager` (user-invoked only). It checks each setup's status, runs the ones you pick in a fixed order, then suggests other `lichens-ai-dev-tools` plugins that fit the project's dependencies.

## Files

| File | Role |
| ---- | ---- |
| `SKILL.md` | Detection table, run order, plugin suggestions (read only when the skill runs) |

## Generated, per checkout

- `.claude/claude-tools.json`: `{ "<setup skill>": "<claude-tools version>" }`, written by each setup skill at the end of a run (and by this skill if one didn't). Listed in `.git/info/exclude`, not committed.

## Design choices

- **Orchestrates, never reimplements.** The setup skills are `disable-model-invocation: true`, so the Skill tool can't call them. The manager reads each sibling `SKILL.md` and follows it, so the setup skills stay the single source of truth.
- **Fixed order.** claude-light → auto-lint-format (may add just recipes) → just-usage (lists them) → guardrails last (its hook asks before every edit to settings and hooks, which would otherwise prompt through the others).
- **Two outdated signals.** Comparing the installed hook scripts (and the guardrails rule) with the plugin's copies is exact but only covers files. The recorded version also covers settings and rule changes, but plugin versions are per plugin, so a mismatch only means "re-run recommended".
- **Plugins are suggested, not installed.** `claude plugin install` writes `~/.claude/plugins`, which the guardrails sandbox blocks, so the user gets `!` commands instead.

## Known limits

- Comparisons use the installed claude-tools copy: update the plugin first, or everything looks current.
- Clones without `.claude/claude-tools.json` (a teammate's, an older install) show committed setups as "re-run recommended" until they are re-run once.
- Plugin suggestions only read `package.json` dependencies; Python or other stacks only get `git`.
