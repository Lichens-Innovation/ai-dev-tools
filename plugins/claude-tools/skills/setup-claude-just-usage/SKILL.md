---
name: setup-claude-just-usage
description: "Reads the justfiles of a repository and, for each level that has one (root, apps/frontend, packages/ui, ...), writes a .claude/rules/use-just-commands.md listing the available just recipes and telling Claude to always use them, plus a per-level PreToolUse hook config that denies the non-just equivalents (uv, docker, ruff, pnpm test, ...). Use when the user wants Claude to use the project's just commands instead of raw tools, or invokes /setup-claude-just-usage."
disable-model-invocation: true
---

# Setup Claude Just Usage

Make Claude run the repo's `just` recipes instead of the tools they wrap. Per level (a directory holding a justfile):

| File | Role |
| ---- | ---- |
| `<level>/.claude/rules/use-just-commands.md` | Lists the recipes and says to always use them (from `assets/use-just-commands.md`) |
| `<level>/.claude/hooks/use-just-commands.json` | The non-just commands the hook denies at that level, each with a message pointing at the recipe |

Once per repository:

| File | Role |
| ---- | ---- |
| `.claude/hooks/use-just-commands.mjs` | The hook, from this skill's `scripts/use-just-commands.mjs`. Reads the level configs; same script for every level |
| `.claude/settings.json` | Registers the hook (`PreToolUse`, `Bash`) |

These are shared, so they are committed (unlike the guardrails skill): the justfile is a team convention. Use `.claude/settings.local.json` instead if the user asks for a personal setup.

How the hook decides: for each command in a Bash call (split on `;`, `&&`, `|`, newlines, subshells; quoted text and heredocs are ignored) it takes the directory the command runs in (the session `cwd`, moved by a leading `cd <dir> &&`), loads the configs from that directory up to the project root, and denies the command if it starts with a blocked `command`. It sees through env assignments, `sudo`/`env`/`time`, and runners (`uv run`, `uvx`, `npx`, `pnpm exec`, ...), so blocking `ruff` also blocks `uvx ruff`. A level's recipes therefore bind everything under it, and a parent's bind its children too (`just` itself finds a parent justfile).

## Workflow

1. **Prerequisites.** `just --version` and `node --version` >= 18; stop and say what is missing otherwise. Work from the git root (`git rev-parse --show-toplevel`).

2. **Find the levels.** `git ls-files` for files named `justfile`, `Justfile` or `.justfile` (any depth; ignore vendored dirs like `node_modules`). Each parent directory is a level. If none is tracked, `find` the same names, skipping `node_modules`, `.git`, `.venv`, `target`, `dist`. No justfile at all: if the repo uses pnpm, offer to create a root `justfile` from `assets/pnpm-recipes.just` (step 3); otherwise stop and say so.

3. **Read each level.** In that directory run `just --list --unsorted` (shows imports and `mod` recipes with doc comments) and `just --dump --dump-format json` for the bodies, parameters and `[private]` flags. Skip private recipes and the `default` recipe that only lists. For every recipe note: name, parameters, doc comment, and the program(s) its body runs. Note shared programs across recipes (`uv`, `docker`, `pnpm`).

   **Offer missing pnpm recipes.** For a level that uses pnpm (`pnpm-lock.yaml` or `pnpm-workspace.yaml` at or above it, or `"packageManager": "pnpm@..."`), compare its recipes with `assets/pnpm-recipes.just`: `install`, `dev`, `build`, `lint`, `check`, `typecheck`, `test`, `format` and `audit`. Propose a recipe only if it is missing (by name, or by another recipe already running the same `pnpm` command) and its script exists in that level's `package.json` (`audit` and `install` need none). Keep the user's existing recipes and names untouched. Show the proposed recipes in step 5; once accepted, append them to the level's justfile (copied from the asset, doc comments included) before step 4 reads it, and re-run `just --list --unsorted`. `just audit -i` runs `pnpm audit --fix=update --interactive`, plain `just audit` the same without `--interactive`. Needs `just` >= 1.46 (option arguments); if older, write `audit *args` with `pnpm audit --fix=update {{args}}` and tell the user to call `just audit --interactive`.

4. **Derive the blocked commands** per level, from the recipe bodies. These are the proposal; show it in step 5.
   - Block a **program** (`docker`, `uv`, `atlas`, `ruff`) when the recipes cover its usage in this project. Block a **program + subcommand** (`pnpm test`, `cargo clippy`, `uv run pytest`) when the program is also used for other things that have no recipe (`pnpm install`, `cargo add`).
   - Runner forms are matched automatically from `X`: don't list them separately. Known runners: `uv run|tool run`, `uvx`, `poetry|pipenv|pdm|hatch|rye run`, `npx`, `bunx`, `bun x`, `pnpm exec|dlx`, `npm|yarn exec`, `yarn dlx`, `bundle|bundler exec`, `gem|composer exec`, `mise exec|x`, `asdf|rbenv exec`, `devbox run`. For any other wrapper in the recipe bodies (`nix develop -c`, `direnv exec`, ...), list the wrapped form as its own entry (`nix develop -c cargo`), since the hook can't unwrap it.
   - Never block programs recipes merely call on the side: `git`, `cd`, `echo`, `cat`, `ls`, `sh`, `bash`, `just`, `node`, `python` (unless every recipe use is a wrapper), `curl`.
   - Skip programs that no recipe runs. This is about redirecting to existing recipes, not forbidding tools.
   - Each entry gets a `message`: the recipe(s) to use, in a few words (`Use just lint or just lint-fix.`). If several recipes map to one blocked command, name them all.
   - If the existing rules or hooks say something different for a recipe (e.g. an LSP replaces `just check-types`), keep that: add a `just check-types` entry whose message says what to use instead, and mention it in the rule.

5. **Ask** in one `AskUserQuestion` call, showing per level the recipes and the blocked commands (compact, one line each):
   - "Install these levels and blocked commands?" (with any pnpm recipes to add to a justfile, listed per level): yes (recommended), or adjust (user edits the list; apply and show the result again).
   - If `.claude/settings.json` is untracked or gitignored: "Where to register the hook?": `settings.json` (recommended if tracked) or `settings.local.json`.

6. **Write the files.**
   - Hook: copy `scripts/use-just-commands.mjs` to `<root>/.claude/hooks/use-just-commands.mjs`. If a copy exists and differs, show the diff and ask first.
   - Per level, `.claude/hooks/use-just-commands.json`:

     ```json
     {
       "justfile": "justfile",
       "blocked": [
         { "command": "uvx ruff", "message": "Use `just lint` or `just lint-fix`." },
         { "command": "docker", "message": "Use `just up`, `just down` or `just logs`." }
       ]
     }
     ```

     Use 2-space indentation. If the file exists, merge by `command`: update messages, keep entries the user added.
   - Per level, `.claude/rules/use-just-commands.md` from `assets/use-just-commands.md`: the real recipe table (recipe, what it does, what it replaces), the `Run just from <dir>` line, and only the notes that apply. Drop the template comment and any unused placeholder bullets. A sub-level rule lists **its own** recipes only (the parent's are already loaded or reachable). If the file exists, show what changes and ask first.
   - `<root>/.claude/settings.json` (`{}` if absent): merge, never replace; keep other keys and hooks, 2-space indentation. Skip if an entry with the same `command` exists.

     ```json
     {
       "hooks": {
         "PreToolUse": [
           {
             "matcher": "Bash",
             "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/use-just-commands.mjs\"" }]
           }
         ]
       }
     }
     ```

7. **Verify.**
   - `bash scripts/test-use-just-commands.sh <root>/.claude/hooks/use-just-commands.mjs` from this skill's directory (always `bash`). It builds a throwaway project under `$TMPDIR`; report failures verbatim. `rm:` errors outside `$TMPDIR`: stop and tell the user.
   - For each level, check its config against the real project: pipe a `{"tool_name":"Bash","cwd":"<level dir>","tool_input":{"command":"<blocked command>"}}` JSON to the hook with `CLAUDE_PROJECT_DIR=<root>` and confirm it denies, and that `just <recipe>` is allowed. Check every blocked command once.

8. **Report** the levels with their recipe counts and blocked commands, the files written (tracked or not), and the limits below. Hooks load at session start: restart Claude Code.

## Limits: tell the user

- The hook reads command text: `bash -c '...'`, `eval`, `$VAR` as a program and scripts that call the raw tools get past it. It nudges Claude; it is not enforcement.
- Rules and the hook config are written from the justfile as it is today. Re-run the skill after recipes are added, renamed or removed; it merges.
- Claude Code loads the project's root `.claude/rules/` at session start. Whether a rule in a sub-level `.claude/rules/` loads when Claude works in that directory depends on the Claude Code version: check with `/memory` after starting a session in the sub-level, and if it is missing, tell the user the hook still enforces that level and the deny message names the recipes.
- Tools used for things no recipe covers stay allowed unless blocked on purpose (step 4).
- If the user's session also has the guardrails hook, `.claude/settings.json` edits ask for confirmation: expect a prompt.
