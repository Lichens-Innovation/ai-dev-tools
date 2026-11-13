---
name: claude-tools-manager
description: "Sets up a project with the claude-tools setup skills: detects which are installed, missing or outdated, runs the chosen ones in order, then suggests other lichens-ai-dev-tools plugins that fit the project. Use when the user sets up Claude Code in a new project, wants to update the installed claude-tools setup, or invokes /claude-tools-manager."
disable-model-invocation: true
---

# Claude Tools Manager

Install and update the four claude-tools project setups (`claude-light`, `setup-claude-guardrails`, `setup-claude-just-usage`, `setup-claude-auto-lint-format`) in the current project, one after another, then suggest marketplace plugins that match the stack. This skill only orchestrates: each setup's real work is done by following its own `SKILL.md`.

**The setup skills can't be called with the Skill tool**: they are `disable-model-invocation: true`. Run each one by reading `${CLAUDE_SKILL_DIR}/../<skill>/SKILL.md` with Read and following its workflow in this session, questions included. Never reimplement a step from memory.

## The setups, in run order

| # | Skill | Applies when | Installed when | Compare with the plugin (`${CLAUDE_SKILL_DIR}/../<skill>/`) |
| - | ----- | ------------ | -------------- | ------------------------------------------------------- |
| 1 | `claude-light` | always | `.claude/settings.local.json` `permissions.deny` holds `CronCreate` and `disableBundledSkills` is `true` | each `deny` entry and `disable*` key of its "Target configuration" block is present |
| 2 | `setup-claude-auto-lint-format` | a linter/formatter config or dependency exists (ruff, eslint, prettier, biome, ...) | `.claude/hooks/auto-lint-format.mjs` exists | `scripts/auto-lint-format.mjs` |
| 3 | `setup-claude-just-usage` | a `justfile` (or `Justfile`, `.justfile`) at the root or below, outside `node_modules` | `.claude/hooks/use-just-commands.mjs` exists | `scripts/use-just-commands.mjs` |
| 4 | `setup-claude-guardrails` | always | `.claude/hooks/guardrails.mjs` exists | `scripts/guardrails.mjs`, `assets/guardrails.md` vs `.claude/rules/guardrails.md` |

Why this order: auto-lint-format can add just recipes and then asks for a just-usage re-run, so it goes first. Guardrails goes last because its hook asks before every edit to settings and hook files, which would prompt through the other three.

## Workflow

1. **Locate.** Work from the main checkout: the parent of `git rev-parse --path-format=absolute --git-common-dir`. Not a git repository: say guardrails and just-usage need one, and continue with the others. Read the plugin version from `${CLAUDE_SKILL_DIR}/../../.claude-plugin/plugin.json`.

2. **Check the plugin itself is current.** Comparisons are against this installed copy of claude-tools, so a stale plugin reports everything as up to date. Suggest the user run `! claude plugin marketplace update lichens-ai-dev-tools` and `! claude plugin update claude-tools@lichens-ai-dev-tools` first (the sandbox can't write `~/.claude/plugins`), then restart and re-run this skill. Continue if they decline.

3. **Detect** each row of the table. Use `ls`/`find` (one directory per command, no `cd`) and Read; compare files with `cmp -s <plugin copy> <installed copy>` (exit 1 = differs). Read `.claude/claude-tools.json` (missing = `{}`): it maps each setup skill to the claude-tools version that last ran it. Status per row:

   | Status | When |
   | ------ | ---- |
   | not applicable | the "Applies when" check fails: don't offer it, say why in one line |
   | missing | applicable, not installed |
   | outdated | installed, and a compared file differs or a claude-light target entry is missing |
   | re-run recommended | installed, files match, but its `claude-tools.json` version is older than the plugin's, or absent. Plugin versions are per plugin, so this means "may have changed", not "has changed" |
   | up to date | installed, files match, recorded version equals the plugin's |

   A hook script that differs may hold the user's own edits: say so, and remember the setup skill shows the diff and asks before overwriting.

4. **Ask** with one `AskUserQuestion`, `multiSelect: true`: one option per missing, outdated or re-run-recommended setup, labelled with the skill and status, the description saying what it installs (one line from the skill's frontmatter). Pre-recommend missing and outdated ones. Everything up to date: say so and go to step 6.

5. **Run the chosen setups in table order**, one at a time: Read its `SKILL.md`, follow it to its end (its own questions, writes, verification), then before the next one:
   - Record it: merge `"<skill>": "<plugin version>"` into `.claude/claude-tools.json` (2-space indentation). The setup skill normally does this as its last step; write it here if it didn't.
   - Give a one-line result. If a setup stopped (a prerequisite missing, the user declined), record nothing for it, say why and carry on with the next.
   - Don't repeat the per-setup "restart Claude Code" advice: say it once in step 7.

6. **Suggest plugins.** Read `~/.claude/plugins/installed_plugins.json` (unreadable: say so and suggest without filtering) and drop plugins already installed from `lichens-ai-dev-tools`. Match the project with `package.json` dependencies (every `package.json` outside `node_modules`):

   | Plugin | Suggest when |
   | ------ | ------------ |
   | `git` | always (commit, create-pr, release report) |
   | `dev` | a `package.json` exists (exact dependency pinning, code review) |
   | `react`, `react-stack` | `react` |
   | `react-mobile` | `react-native`, `expo` or `@gluestack-ui/*` |
   | `react-testing` | `@testing-library/react` or `@testing-library/react-native` |
   | `react-forms` | `react-hook-form` |
   | `react-dnd` | `@atlaskit/pragmatic-drag-and-drop` |
   | `react-diagrams` | `@xyflow/react` or `reactflow` |
   | `design-studio` | `react` or `react-native`, and a `.storybook/` folder or `storybook` dependency |

   Ask with `AskUserQuestion` (`multiSelect: true`, each option with the reason it matched). Never install them yourself: plugin installs write `~/.claude/plugins`, which the sandbox blocks. Give the user one `!` line per chosen plugin, plus the marketplace line if it isn't in `~/.claude/plugins/known_marketplaces.json`:

   ```bash
   ! claude plugin marketplace add lichens-ai/ai-dev-tools
   ! claude plugin install react@lichens-ai-dev-tools
   ```

   Plugins load at session start: a restart is needed before their skills appear.

7. **Report** a table: each setup with its status before and after, plus skipped ones and why; the plugin commands handed over. Then: restart Claude Code (hooks, sandbox and plugins load at session start), and re-run `/claude-tools-manager` after a claude-tools update, a fresh clone, or a new `git worktree add`.

## `.claude/claude-tools.json`

```json
{
  "claude-light": "0.5.0",
  "setup-claude-guardrails": "0.5.0"
}
```

Per checkout, not committed: on first write add `.claude/claude-tools.json` to `.git/info/exclude` (the shared one, under `--git-common-dir`). A teammate's clone has none, so committed setups (auto-lint-format, just-usage) show as "re-run recommended" there until it is re-run once: say that, it is expected.

## Out of scope

- Never edits the plugin's own files, `~/.claude/settings.json` or `~/.claude.json`.
- Doesn't uninstall setups or plugins: point to the setup skill's README or `/manage-marketplace`.
- Doesn't run `super-help`, `manage-marketplace` or `/help-server`: they are reference tools, not project setups.
