# Maestro desktop migration — plans

Turning the containerised `apps/ai-tools-manager` web app into `apps/maestro`, an Electron desktop
app that configures Maestro with no Claude session in the loop.

| Plan | Status | Queued as |
|---|---|---|
| M1 — extract `packages/maestro-core` | **done** | — |
| M2 — Electron shell (`apps/maestro`) | **done** | — |
| [Review of M1 + M2](review-m1-m2.md) | **done** — see [outcome](review-m1-m2-outcome.md) | `001` (done), `002`, `003` |
| [M3 — in-app install / update / uninstall](m3-in-app-install.md) | not started | `004`, `005`, `006` |
| [M4 — the `claude -p` bridge and the create-\* routes](m4-claude-bridge.md) | not started | `007`, `008` |
| [M5 — retire the Docker path](m5-retire-docker.md) | not started | `009` |
| [Core absorption — fold `maestro-core` into the app](core-absorption.md) | after M5, before M6 | `010`, `011` |
| [M6 — fold in help-server](m6-help-server-merge.md) | last | `012`, `013`, `014` |

These plans are the design; `.claude/maestro-tasks/` is the runnable decomposition of them, and
`status.json` there holds the dependency graph and each task's ready/blocked state. The task files
carry the decisions and traps and point back here for the rest — **the plans stay the source of
truth**, so revise them here and let the tasks reference them rather than restating them.

Task numbering is topologically sorted, so running the queue in numeric order is always a valid
path; the `Blocked by` sections record the precise graph, including the two edges this page's
prose only implies — M5 needs M4's marketplace rework (it deletes the last consumer of the Docker
precompute file), and M6's chat must be rebuilt on M4's bridge.

## The split that does not move

The desktop app owns **authoring and observability**. Claude Code owns **execution**. They meet at
`.claude/maestro.json` — the same seam the `maestro-architecture` skill already draws.

The runtime hooks (`maestro-inject-agent-context.js`, the session loggers,
`maestro-validate-tasks.js`, `bash-validation.sh`, `maestro-session-cleanup.sh`) fire inside a
Claude session and have no desktop equivalent. No milestone below removes them.

## Sequencing notes

- **Review before M3.** M1 and M2 landed a lot at once; the review plan lists specific things worth
  scrutinising, including two gaps already known.
- **Core absorption sits between M5 and M6**, not earlier. After M5 the web app is gone, so nothing
  else could plausibly consume the package; before M6 so help-server's node logic lands in the
  final structure instead of being moved twice.
- **M4 before M6.** help-server's chat tab and stats tab both shell out to external processes
  (`claude`, `npx ccusage`); they should reuse M4's spawn + confirmation infrastructure rather
  than grow their own.
