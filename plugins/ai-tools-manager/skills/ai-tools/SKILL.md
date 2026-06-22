---
name: ai-tools
description: "Opens the ai-tools-manager app as a persistent session and listens for every submit the user makes on any page — workflow/rules saves, skill/subagent/plugin/marketplace creation — applying each one as it arrives until the user stops. Use when the user wants an interactive AFK/ai-tools editing session, to 'open the app', manage workflows/rules/skills/agents/plugins/marketplaces visually, or work in the canvas while you apply their changes live."
---

# AI Tools (dispatcher)

This is the single entry point for the ai-tools-manager web app. Unlike the per-form skills, it
brings the app up **once** and then **listens in a loop**: each time the user submits something on
any page, the app does the deterministic part (scaffolding files, writing `afk.json`) and hands you
a result; you finish the intelligent part and loop back to listen. The container stays up for the
whole session — it is torn down at `SessionEnd` (or when the user stops it from Docker Desktop).

**This occupies the turn.** While you are listening, the user drives everything through the app UI,
not the chat. The loop ends when: the user clicks **Stop** in the app (a `shutdown` result), you are
interrupted (Esc), or the session ends. Tell the user this up front.

## User's intention

$ARGUMENTS

## Workflow

### 1. Bring the app up (once)

Run the idempotent launcher. If `$ARGUMENTS` names a starting page (e.g. `workflows`, `rules`,
`afk-tasks`, `session-log`, `create-skill`), pass it; otherwise open the home page:

```bash
bash "${CLAUDE_SKILL_DIR}/../../scripts/ensure-ai-tools-app.sh" "<route or '/'>"
```

This starts the container only if it isn't already serving on :3009, refreshes the cwd/marketplace
precompute, opens the browser, and writes the teardown state file. It does **not** block and does
**not** tear anything down. If it prints a `{"decision":"block",...}` line, report the reason and stop.

Tell the user: *"The app is up. Make changes on any page and submit — I'll apply each one as it comes
in. Click **Stop** in the top bar (or end the session) when you're done."*

### 2. Listen loop

Repeat until you break out:

1. **Wait for the next event** (this blocks until the user submits / cancels / stops):

   ```bash
   bash "${CLAUDE_SKILL_DIR}/../../scripts/wait-ai-tools-result.sh"
   ```

   Run this with the **maximum Bash timeout** (600000 ms). The user may take a while between
   submits, so if the call **times out with no output**, that just means nothing was submitted yet —
   simply run it again to keep listening. Only a non-empty result advances to step 2.2.

2. **Parse** the JSON it prints. Read the top-level `aiToolsAction` to route, and `scaffold`
   (when present) to know what the app already wrote.

3. **Route** on `aiToolsAction`:

   | `aiToolsAction` | What to do |
   |---|---|
   | `shutdown` | The user clicked Stop. Break the loop, report a summary of everything handled, and stop. |
   | (any result with `decision: "block"`) | A cancel. Note the `reason` to the user and **continue** listening (do not break). |
   | `create-skill` | Invoke the **create-skill** skill (Skill tool), passing the `additionalContext` payload verbatim. The app already scaffolded — see *Finishing a scaffold* below. |
   | `create-subagent` | Invoke the **create-subagent** skill with the payload. |
   | `create-plugin` | Invoke the **create-plugin** skill with the payload. Usually the scaffold already wrote the manifest + registration; just verify and report. |
   | `create-marketplace` | Invoke the **create-marketplace** skill with the payload. |
   | `afk-config` | Run the **afk** skill's processing path (write `afk.json` from the payload, re-render the orchestrator, apply rules). Tell it the payload is already supplied so it **skips launching the form** (its Step 1). `sliceType` tells you whether the save was workflows or rules. |

4. **Clear the result file**, then loop back to step 2.1 to wait for the next event:

   ```bash
   : > /tmp/ai-tools-result.json
   ```

   This is required because `wait-ai-tools-result.sh` does **not** truncate — clearing here is what
   makes the next `wait` block for a *new* submit instead of re-reading the one you just handled.

### Finishing a scaffold

Each create result carries `scaffold = { scaffolded, path, remaining, reason }`:

- `scaffolded: true` → the file already exists at `path`. **Do not recreate it.** Do only the
  `remaining` work — for an auto-mode skill/subagent that means authoring the body **in place**
  (Edit the placeholder at `path`); for a manual-mode or plugin scaffold it is usually already
  complete, so just verify and report.
- `scaffolded: false` → the app couldn't write (e.g. a brand-new marketplace dir outside the
  mounted repo under Docker; `reason` says why). Create the artifact from scratch at `path`
  following that flow's normal skill rules.

When you invoke a sub-skill, make this explicit, e.g. *"The form payload is supplied below; the
deterministic scaffold is already written at `<path>` — author only the remaining content there,
do not re-scaffold."*

## Principles

- **One app, many events.** Never re-run `ensure` per event — it's called once in step 1. Only
  `wait` repeats.
- **Cancels don't stop the loop.** Only `shutdown`, Esc, or session end break it.
- **The app owns the deterministic part.** Don't duplicate file scaffolding it already did; finish
  the intelligent part and route. Read-only pages (`session-log`, `afk-tasks`) emit no events —
  they just work while the app is up.
- **Teardown is automatic.** The `SessionEnd` hook stops the container; you don't run
  `docker compose down` yourself.

## Notes

- This skill supersedes launching the per-form skills individually, but those still work on their
  own (their `UserPromptExpansion` hooks now reuse the same persistent container).
- For a one-off single edit you can still use `/afk`, `/create-skill`, etc. directly; use
  `/ai-tools` when you want a sustained editing session.
