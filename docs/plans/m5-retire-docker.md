# M5 — Retire the Docker path

## Context

Once M3 and M4 land, `apps/maestro` does everything `apps/ai-tools-manager` did. What remains is
the delivery mechanism: a Docker image, a per-project container with a port allocated from
3010–3099, a state file, a session-marker refcount directory, a `SessionEnd` teardown hook, two
`/tmp` channel files, and roughly 470 lines of bash whose only job was to show a window.

That machinery is not merely redundant — it is **actively misleading**. Four skills, two
architecture docs, and a CLAUDE.md describe a lifecycle that no longer exists. An agent reading
`maestro-architecture` today will be told to launch a container and wait on a result file.

This milestone is mostly deletion, and the risk is entirely in deleting the wrong thing: the
*runtime* hooks live in the same plugin as the *launcher* scripts, and they must survive.

---

## Delete

### Container and channel plumbing

```
apps/ai-tools-manager/                          (the whole app)
plugins/ai-tools-manager/scripts/ensure-ai-tools-app.sh
plugins/ai-tools-manager/scripts/wait-ai-tools-result.sh
plugins/ai-tools-manager/scripts/launch-ai-tools-manager-app.sh
plugins/ai-tools-manager/scripts/maestro-app-session-register.sh
plugins/ai-tools-manager/scripts/lib/maestro-app-paths.sh
```

### Hook entries in `plugins/ai-tools-manager/hooks/hooks.json`

- the four `create-*` `UserPromptExpansion` entries;
- the `SessionStart` → `maestro-app-session-register.sh` entry.

### Skills

- `skills/ai-tools/` — the `/ai-tools` dispatcher listen-loop exists only to route `aiToolsAction`
  results off a container;
- `skills/maestro-app/` — its Steps 1–5 are what `saveConfig()` now does.

`/maestro-install`, `/maestro-update`, `/maestro-uninstall` are judgement calls. After M3 the app
does all three, but they still work standalone from a terminal and cost nothing to keep. **Keep
them, rewritten** to drop the form-launching step — a user without the desktop app installed still
needs a path in.

### Partial edit, not deletion

`maestro-session-cleanup.sh` — remove the container-teardown half (the `docker compose -p
ai-tools-<key> down`, the state file check, the marker directory sweep). **Keep** the part that
deletes `maestro_session.json`, `maestro_session.log.jsonl`, and `maestro_session_tasks.json`. This
is the single most dangerous edit in the milestone: deleting the whole script silently leaves
ephemeral session state behind forever, and nothing fails loudly when it does.

---

## Must survive

Everything under `plugins/ai-tools-manager/scripts/` that is not in the delete list, in particular:

| Script | Event |
|---|---|
| `maestro-inject-agent-context.js` | SubagentStart |
| `maestro-subagent-log.js` | SubagentStart / SubagentStop |
| `maestro-session-log.js` | PreToolUse |
| `maestro-validate-tasks.js` | PostToolUse |
| `maestro-session-cleanup.sh` (trimmed) | SessionEnd |
| `bash-validation.sh` | PreToolUse |
| `maestro-set-session-workflow.cjs` | orchestrator Step 0 |
| `maestro-render-orchestrator.cjs` | `/maestro-update` |
| `maestro-apply-rules.js` | `/maestro-update` |
| `maestro-post-mortem.js` | `/maestro-post-mortem` |
| `maestro-task-status.cjs`, `lib/maestro-tasks.cjs` | task tracking |
| `lib/maestro-session.cjs`, `lib/maestro-skill-regions.cjs` | **generated** — see `core-absorption.md` |

The plugin keeps existing. It is the runtime half, and it is not going anywhere.

---

## Rewrite the documentation

This is the larger half of the work and the easier half to skimp on.

| File | What is now wrong |
|---|---|
| `apps/ai-tools-manager/CLAUDE.md` | Deleted with the app — but its content must be re-homed, not lost. `apps/maestro/CLAUDE.md` already covers the new shape; port anything still true (form architecture, per-route notes) |
| `.claude/skills/maestro-architecture/SKILL.md` | The install pipeline diagram, the `launch-ai-tools-manager-app.sh` row, the whole "app container is per-project" bullet, the `UserPromptExpansion` hook row |
| `.claude/skills/workflow-view/SKILL.md` | The `mountedProjectPath` / `/project` mount references, the "Persistence (submitMaestroConfig)" section, the `aiToolsAction` dispatcher paragraph |
| `.claude/skills/rule-view/SKILL.md` | Same — the Docker path resolution and the save→skill handoff |
| `.claude/skills/log-view/SKILL.md` | The SSE route it describes no longer exists |
| `.claude/skills/updating-maestro/SKILL.md` | After M3 registers hooks project-locally, the marketplace-cache trap it warns about no longer applies the same way. Rewrite or retire |
| `README.md`, `docs/ai-tools-create-shared.md` | Launch instructions, the result-file contract |

The `.claude/skills/` directory currently lives under `apps/ai-tools-manager/`, which is being
deleted. **Move it to `apps/maestro/.claude/skills/` first**, before deleting anything, or six
architecture docs vanish with the app.

## Verification

1. **Move the skills directory first**, in its own commit, and confirm the six skills still resolve.
2. `grep -rn "ai-tools-result\|ai-tools-marketplace\|RUNNING_IN_DOCKER\|aiToolsAction\|launch-ai-tools-manager\|mountedProjectPath\|/tmp/result.json"` across the repo returns **only** hits in
   historical docs you have deliberately left.
3. **A real Claude Code session in a Maestro project still works end to end**: `/maestro` classifies,
   dispatches a subagent, the SubagentStart injection lands, the session log fills, `SessionEnd`
   deletes all three ephemeral files. This is the regression that matters — run it before and after.
4. **`SessionEnd` leaves no orphans.** After the trimmed cleanup script runs, confirm no
   `maestro_session*` files remain and no `/tmp/ai-tools-app.*` files are created in the first place.
5. `docker ps -a` and `/tmp` are clean of `ai-tools-*` after a full session, on a machine that
   previously ran the container.
6. Every skill under `plugins/ai-tools-manager/skills/` that survives is re-read start to finish
   for references to the form, the dispatcher, or the result file.
