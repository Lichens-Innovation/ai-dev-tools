# Maestro skill fails when `$CLAUDE_PROJECT_DIR` is unset in the Bash tool

## The problem

`plugins/ai-tools-manager/templates/maestro/SKILL.md` (the template that gets
rendered into a consuming project's `.claude/skills/maestro/SKILL.md`) tells the
orchestrator to invoke its session-management scripts like this:

```bash
node "$CLAUDE_PROJECT_DIR/.claude/scripts/maestro-set-session-workflow.cjs" "<workflow name>"
```

and

```bash
node "$CLAUDE_PROJECT_DIR/.claude/scripts/maestro-task-status.cjs" done
```

Both call sites (lines 20, 26, 79 of the template) assume `$CLAUDE_PROJECT_DIR` is
set in whatever shell runs the command.

When Claude Code (the orchestrator) executes this via its Bash tool, that
assumption doesn't hold. Checking `env` in a live session shows Claude-specific
variables are present (`CLAUDE_CODE_SESSION_ID`, `CLAUDE_PID`, `CLAUDECODE`,
`CLAUDE_CODE_EXECPATH`, `CLAUDE_EFFORT`, ...) but **`CLAUDE_PROJECT_DIR` is absent
entirely** — not just unset in a subshell, it's never exported into the Bash
tool's environment in the first place.

`$CLAUDE_PROJECT_DIR/.claude/scripts/...` then expands to `/.claude/scripts/...`
(empty variable + literal path), which resolves from filesystem root and fails
with `MODULE_NOT_FOUND`:

```
node:internal/modules/cjs/loader:1424
  throw err;
Error: Cannot find module '/.claude/scripts/maestro-set-session-workflow.cjs'
```

## Why it happened

`CLAUDE_PROJECT_DIR` is a real Claude Code environment variable, but it's
documented/guaranteed for **hook scripts** (which Claude Code invokes with their
own controlled environment), not for arbitrary commands run through the
interactive Bash tool during a normal agent turn. The maestro skill template was
written assuming hook-like env availability everywhere, but Step 0 and Step 6 of
the orchestrator's instructions run as ordinary Bash tool calls in the main
session — a context where that variable simply isn't guaranteed to exist.

This is a latent bug that only surfaces the first time a project's maestro
orchestrator actually tries to run one of these two scripts — which is every
`/maestro` invocation. The workaround in the moment was to hardcode the absolute
project path instead of relying on the variable.

## How to fix it properly

Don't depend on `$CLAUDE_PROJECT_DIR` inside the skill's own script invocations.
Options, in order of preference:

1. **Resolve the project root from inside the `.cjs` scripts themselves**, e.g.
   `maestro-set-session-workflow.cjs` and `maestro-task-status.cjs` should locate
   their own directory via `__dirname` (they already live at
   `<project>/.claude/scripts/`) and derive the project root as
   `path.resolve(__dirname, '..', '..')` rather than expecting the caller to pass
   a correct absolute path via an env var. This makes the scripts callable
   correctly regardless of cwd or environment.

2. **Have the SKILL.md template invoke them with a relative path**, since the
   orchestrator's Bash tool cwd is already the project root in normal operation:
   ```bash
   node .claude/scripts/maestro-set-session-workflow.cjs "<workflow name>"
   ```
   This sidesteps the env var question entirely for the common case, at the cost
   of breaking if the orchestrator ever `cd`s elsewhere first.

3. If `$CLAUDE_PROJECT_DIR` must be kept (e.g. because some call sites are also
   reused from actual hooks where it *is* set), guard it with a fallback in the
   template's bash snippet:
   ```bash
   node "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}/.claude/scripts/maestro-set-session-workflow.cjs" "<workflow name>"
   ```
   This is more defensive but adds a `git` dependency and a second failure mode
   (not being in a git repo).

Option 1 is the most robust since it fixes the scripts themselves rather than
every call site that invokes them, and it removes the dependency on an
environment variable whose availability is inconsistent across the contexts the
maestro skill actually runs in (main-session Bash tool calls vs. hook
invocations).

## Where to apply the fix

- `plugins/ai-tools-manager/scripts/maestro-set-session-workflow.cjs`
- `plugins/ai-tools-manager/scripts/maestro-task-status.cjs`
- `plugins/ai-tools-manager/templates/maestro/SKILL.md` (lines 20, 26, 79 — update
  the documented invocation once the scripts no longer need the env var, so the
  rendered per-project `SKILL.md` files stay consistent after `/maestro-update`)

Any project that has already run `/maestro-install` has a rendered copy of the
template in its own `.claude/skills/maestro/SKILL.md`; those need `/maestro-update`
re-run after this fix lands to pick up the corrected invocation.
