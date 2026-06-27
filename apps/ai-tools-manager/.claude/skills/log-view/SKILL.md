---
name: log-view
description: "Explains how the /session-log view in ai-tools-manager is built end-to-end: the thin left step list, the center framed log pane, the right Input/Process/Output detail panel, how log entries map to Instance segments, and how the maestro-session-log.js / maestro-subagent-log.js hooks write the maestro_session.log.jsonl it reads. Use when the user is working inside apps/ai-tools-manager and asks how the session-log view works, how cards/instances are derived, where SUCCESS/FAILURE comes from, why the log is empty, why a step has no status icon, or how dispatch/handoff entries are produced by the hooks."
---

# Log View

The `/session-log` route (`src/routes/session-log.tsx`) is a **read-only debugger** for Maestro workflow sessions. It reads `<cwd>/.claude/maestro_session.log.jsonl` and presents it in three panes: a **thin left step list** (step names with status icons), a **center framed log** (humanized tool calls per step in rounded bordered sections), and a **right detail panel** (Input/Process/Output for the selected step). Clicking a step in any pane selects it across all three.

This is the **read side** of the Maestro runtime: it displays what the hook scripts write. See the `maestro-architecture` skill for the **write side** (how the log is produced and the full HANDOFF routing contract). See the `workflow-view` skill for the sibling `/workflows` authoring view.

## Layout

```
┌──────────────────────────────── TopNav (top-nav.tsx) ────────────────────────────────┐
│ Workflows | Rules | Session Log                                                  ☀    │
├────────────┬─────────────────────────────────────┬──────────────────────────────────┤
│ Left       │ Center — SessionLogView              │ Right — SessionLogDetail          │
│ Cards      │ (session-log-view.tsx)               │ (session-log-detail.tsx)          │
│ (cards.tsx)│                                      │                                   │
│            │  Agents Flow                 ● live  │  Logs: Backend (1)                │
│ Workflow   │                                      │                                   │
│            │  ┌────────────────────────────────┐  │  Input                            │
│ ✓ Main Ses │  │ Main Session                   │  │  Create a button component…       │
│ ✓ Backend  │  │ - calling `backend` agent      │  │                                   │
│ ✓ Human R  │  │ - …                            │  │  Process                          │
│ ✗ Test     │  └────────────────────────────────┘  │  - [Backend]: read file `…`       │
│ ✓ Backend  │                                      │  - [Backend]: wrote file `…`      │
│ ✓ Test     │  ┌════════════════════════════════┐  │  - …                              │
│ ⚠ Reviewer │  ║ Backend (1)          «green»   ║  │                                   │
│ ✓ Scribe   │  ║ - calling backend agent        ║  │  Output                           │
│            │  ║ - [Backend]: read file `…`     ║  │  Created a button component …     │
│            │  ║ - [Backend]: wrote file `…`    ║  │                                   │
│            │  └════════════════════════════════┘  │                                   │
│            │                                      │                                   │
│            │  ┌────────────────────────────────┐  │                                   │
│            │  │ Human Review                   │  │                                   │
│            │  │ - …                            │  │                                   │
│            │  └────────────────────────────────┘  │                                   │
│            │                                      │                                   │
└────────────┴─────────────────────────────────────┴──────────────────────────────────┘
   180px                     1fr                                320px
```

**No workflow selector and no YAML preview toggle** — TopNav is rendered bare (no `workflowSelector` or `onPreviewToggle` props). When the log file is absent the whole three-pane layout is replaced by an **empty state**: a centred `ScrollText` icon + "No session log found" message + a `● live / ○ connecting…` indicator (the log is ephemeral, so this is the normal between-sessions condition).

## Data flow

```
App-wide (src/routes/__root.tsx)
  <SessionLogProvider>  (src/utils/session-log-context.tsx)
    └── EventSource("/api/session-log-stream")  ← one persistent SSE connection
          server: src/routes/api/session-log-stream.ts
            polls maestro_session.log.jsonl every 1 s (server-side)
            emits: init (full snapshot) / entry (new line) / reset (file deleted)
          events update: entries[], connected
                                     │
       ┌─────────────────────────────┘
       ▼
SessionLogPage (src/routes/session-log.tsx)
  const { entries, connected } = useSessionLog()
  instances = useMemo(() => buildInstances(entries))  → Instance[]
  activeId state (which step is selected)
  activeInstance = instances.find(id === activeId)
  sectionRefs: Record<id, HTMLDivElement|null>  (one per instance section in the center pane)
       │
       ├──▶ SessionLogCards (left)
       │      renders Instance[] as a compact step list with status icons
       │      onSelect(id): setActiveId(id) + sectionRefs[id].scrollIntoView()
       │
       ├──▶ SessionLogView (center)
       │      renders per-instance sections in rounded bordered frames
       │      onClick on a frame: onSelect(id) → selects step across all panes
       │      selected frame gets border-2 colored by status (green/red/yellow)
       │      header shows "● live" / "○ reconnecting…" from connected
       │
       └──▶ SessionLogDetail (right)
              shows Input / Process / Output for the activeInstance
              Input = instance.input (spawning message from dispatch entry)
              Process = humanized log lines (same as center pane)
              Output = instance.output (final message from handoff entry)

TopNav (every Maestro page): "● Session Log" dot driven by useSessionLog().connected
```

**Upstream — where the log comes from:**

```
Active Maestro session
  PreToolUse hook   → maestro-session-log.js  → tool-call entry (ts, origin, log)
  SubagentStart     → maestro-subagent-log.js → dispatch entry  (kind:"dispatch", agent, agent_id, input)
  SubagentStop      → maestro-subagent-log.js → handoff entry   (kind:"handoff", agent_id, status, label, output)
  SessionEnd        → maestro-session-cleanup.sh → DELETE maestro_session.log.jsonl
```

All three hooks append to the same file. All are no-ops when `maestro.json` is absent. The file is deleted at SessionEnd, so the empty state is normal.

## File-by-file map

| Concern | File |
|---|---|
| Route, state, 3-pane grid, scroll-sync, empty state | `src/routes/session-log.tsx` |
| Left step list with status icons (CircleCheck/CircleX/AlertTriangle) | `src/components/session-log-cards.tsx` |
| Center framed log pane, click-to-select, live indicator, per-section anchors | `src/components/session-log-view.tsx` |
| Right detail panel: Input/Process/Output sections | `src/components/session-log-detail.tsx` |
| SSE server route — tails the JSONL and pushes init/entry/reset | `src/routes/api/session-log-stream.ts` |
| App-wide SSE context: `SessionLogProvider`, `useSessionLog()` | `src/utils/session-log-context.tsx` |
| Log reader server fn + `resolveLogFile` + `parseLogLines` + `SessionLogEntry` | `src/utils/maestro-session-log.ts` |
| Pure transforms `buildInstances` + `humanizeLog` + `parseSkillsTriage` + `unaccountedSkills` + `Instance`/`SkillsTriage` types | `src/utils/session-log.ts` |
| Top bar — nav links incl. `ScrollText` + global `●` live dot | `src/components/top-nav.tsx` |
| Docker-aware cwd helpers (`readCwd`, `mountedProjectPath`) | `src/utils/maestro-fs.ts` |
| `titleFromName` — origin string → display name | `src/utils/text.ts` |
| Yellow color tokens (`--yellow`, `--yellow-dim`) | `packages/styles/scss/abstracts/_tokens.scss` |
| **Writer — tool-call entries** (PreToolUse, matcher `.*`) | `plugins/ai-tools-manager/scripts/maestro-session-log.js` |
| **Writer — dispatch + handoff entries** (SubagentStart/Stop, matcher `.*`) | `plugins/ai-tools-manager/scripts/maestro-subagent-log.js` |
| Shared append helper (`appendSessionLog`, `readStdin`) | `plugins/ai-tools-manager/scripts/lib/maestro-session.cjs` |
| Hook registration (all three hooks registered here) | `plugins/ai-tools-manager/hooks/hooks.json` |
| Source file (ephemeral, append-only, gitignored) | `<cwd>/.claude/maestro_session.log.jsonl` |

## The data model

### `SessionLogEntry` — what the JSONL file contains

Every line is a JSON object with at least `{ ts, origin, log }`. Additional fields are present only on `dispatch`/`handoff` entries:

```ts
interface SessionLogEntry {
  ts: string;      // ISO-8601 UTC timestamp
  origin: string;  // "main_session" | agent_type (e.g. "backend", "Explore")
  log: string;     // human-readable one-liner: "Read(/path)", "Bash(cmd)", "→ backend", "HANDOFF: success"

  // Present only on dispatch entries (SubagentStart):
  kind?: "dispatch";
  agent?: string;      // the subagent's agent_type
  agent_id?: string;   // unique identifier — links this dispatch to its matching handoff
  input?: string;      // full spawning message (what the main session said to spawn this agent)
  offered_skills?: { loaded: string[]; referenced: string[] };  // skills the SubagentStart hook surfaced to this agent

  // Present only on handoff entries (SubagentStop with an agent_type):
  kind?: "handoff";
  agent_id?: string;   // matches the dispatch entry for this run
  status?: "success" | "condition" | "unknown";
  label?: string | null;  // raw HANDOFF label; null for "success" outcome
  output?: string;     // full final message (agent's last message, incl. HANDOFF: line + payload)

  // Present only on transition entries (SubagentStop with NO agent_type):
  kind?: "transition";
  output?: string;     // the final message of the non-workflow turn (e.g. "waiting on the user")
}
```

A missing `kind` = a plain tool-call entry from `maestro-session-log.js`. The schema is **backward compatible**: old logs (tool-call-only) parse and display correctly; `dispatch`/`handoff`/`transition` fields simply don't appear.

**Transition vs handoff.** A `SubagentStop` only carries an `agent_type` when a real workflow agent is handing off. When `agent_type` is empty — e.g. the `/ai-tools` listen-loop pausing for the user to submit a form — there is no HANDOFF contract to parse, so `maestro-subagent-log.js` writes a `kind:"transition"` entry with `origin:"transition"` instead of letting it fall back to `origin:"unknown"` + `status:"unknown"`. This is what keeps non-workflow boundaries from masquerading as failed/unknown agent runs.

### `Instance` — the derived client model

`buildInstances` in `src/utils/session-log.ts` groups entries into segments:

```ts
interface Instance {
  id: number;           // position in the ordered list (stable key for all three panes)
  origin: string;       // raw origin string
  displayName: string;  // "Main Session" | titleFromName(origin)
  startIndex: number;   // index of first entry in the flat entries[] array
  entries: SessionLogEntry[];

  status: "success" | "condition" | "unknown" | "transition" | null;  // null = main_session; "transition" = non-workflow boundary
  label: string | null;   // condition label, e.g. "tests_failed" (null for success)
  input: string | null;   // spawning message from the matching dispatch entry
  output: string | null;  // final message from this segment's handoff entry
  skillsTriage: SkillsTriage | null;  // parsed { loaded[], skipped[{id,reason}] } from the agent's report
  offeredSkills: { loaded: string[]; referenced: string[] } | null;  // from the dispatch entry's offered_skills
}
```

`skillsTriage` is parsed from `output` by `parseSkillsTriage` (pure, in `session-log.ts`): it grabs the last fenced ```` ```json ```` block, `JSON.parse`s it, and reads the `skillsTriage` field every skill-receiving agent emits in its final report (see `plugins/ai-tools-manager/agents/*.md`). Any parse/shape failure yields `null`, so the section is simply omitted — fully backward compatible with older logs and agents that don't emit it. The triage data is already in `output`; that parse is a pure read-side interpretation.

`offeredSkills` is the *other* side of the diff: the skills the `SubagentStart` hook actually surfaced, written onto the **dispatch** entry by `maestro-subagent-log.js` (correlated to the instance by `agent_id`, same as `input`). `unaccountedSkills(inst)` is the diff — skills that were offered but appear in neither `triage.loaded` nor `triage.skipped`, i.e. the agent **silently dropped** them. It returns `[]` unless both sides are present (a diff is only meaningful when we know what was offered *and* what was reported). This is what makes the triage auditable rather than self-reported: a hollow *reason* flags a lazy skip, but an unaccounted skill catches a skill the agent omitted from its report entirely.

## Left pane — step list (`session-log-cards.tsx`)

A thin (180px) vertical list of step names with status icons. Each row:

- **Status icon** (from `lucide-react`):
  - `"success"` → `CircleCheck` in `text-(--green)`
  - `"condition"` → `CircleX` in `text-(--red)`
  - `"unknown"` → `AlertTriangle` in `text-(--yellow)`
  - `"transition"` → hollow `Circle` in `text-(--ink-3)` (neutral — a non-workflow boundary, not an error)
  - Main Session (`status: null`) → `CircleCheck` in `text-(--green)` (default)
- **Click** → `onSelect(id)` → `setActiveId(id)` + `scrollIntoView` on the matching center-pane section.
- **Active step** → `font-medium` + a `border-b-2` underline colored by status (green/red/yellow).
- **Skills badge** (right-aligned, only when `inst.skillsTriage` is set) → compact `<loaded>` in `--green`, `/<skipped>` in `--yellow`, and `/<unaccounted>` in `--red`. Lets you scan which steps skipped or silently dropped skills without opening each detail panel.

## Center pane — framed log (`session-log-view.tsx`)

A header row ("Agents Flow" + `● live` indicator) above a scrollable body of per-instance sections. Each section is wrapped in a **rounded bordered frame** (`border rounded-lg p-4`):

- **Click** anywhere in the frame → `onSelect(id)` → selects the step across all panes.
- **Selected frame** → `border-2` colored by status: `border-[var(--green)]` / `border-[var(--red)]` / `border-[var(--yellow)]` / `border-[var(--line-2)]` (transition, neutral).
- **Default frame** → `border border-(--line)`.
- Content: humanized log lines via `humanizeLog(entry)`, same as before.
- **Section header** shows the `displayName` and, when `inst.skillsTriage` is set, a `<N> loaded · <N> skipped · <N> unaccounted` badge (green / yellow / red — each segment shown only when non-zero).

## Right pane — detail panel (`session-log-detail.tsx`)

Shows the selected instance's data in three sections:

- **Header:** "Logs: {displayName}"
- **Input:** the instance's `input` field — the full spawning message sent by the main session. Shows "No input captured" for main_session instances or when no dispatch entry exists.
- **Process:** the humanized log lines (same content as the center pane section for this step).
- **Skills Triage:** (only when `instance.skillsTriage` is set) the agent's own account of which injected skills it loaded vs deliberately skipped, audited against what was offered. **Loaded** render as green chips; **Unaccounted** (`unaccountedSkills(instance)` — offered but reported in neither loaded nor skipped) render as red chips; **Skipped** render as `id — reason`, with a hollow reason (`< 8` chars) flagged in `--yellow`. Hollow reasons surface lazy *explicit* skips; the red unaccounted group surfaces skills the agent dropped *silently* — caught by diffing the dispatch entry's `offered_skills` against the report.
- **Output:** the instance's `output` field — the agent's full final message including the HANDOFF line. Shows "No output captured" for main_session or when no handoff entry exists.
- When no step is selected, shows "Select a step to view details".

## Deriving instances (`buildInstances`)

`buildInstances` in `src/utils/session-log.ts` (pure, no Node imports) walks entries in order and starts a **new segment whenever `origin` changes**. This means:

- The same agent appearing after a main-session interlude becomes a **separate step** (correct — it's a second invocation).
- The main session itself segments into multiple "Main Session" steps when subagents interleave (normal for sequential Maestro dispatch).
- Parallel subagents would fragment, but Maestro runs agents sequentially, so interleaving is rare.

**Status/label/output** are populated from the first `kind:"handoff"` entry found within the segment (matching `origin`); a `kind:"transition"` entry instead sets `status:"transition"` and keeps its message as `output`. **Input** is correlated by `agent_id`: find the handoff's `agent_id`, then find the dispatch entry with the same `agent_id` anywhere in the full `entries[]`. Fallback: if no handoff entry exists (agent didn't produce one), search for a dispatch entry matching by `agent` type.

## Runtime — how the log gets written

This is the relationship between the page and the custom hooks/scripts.

### `maestro-session-log.js` — tool-call entries (PreToolUse)

- **Hook event:** `PreToolUse`, matcher `.*` — fires on every tool call from any agent.
- **What it writes:** `{ ts, origin, log }`. `origin = p.agent_type || "main_session"`. `log` is a compact summary: `Read(/path)`, `Bash(cmd[:60])`, `Write(/path)`, `Skill(name)`, bare tool name for unknowns.
- **Gate:** exits immediately if `<cwd>/.claude/maestro.json` doesn't exist (Maestro not configured).
- **Append-only** (`fs.appendFileSync`) — parallel subagents can write concurrently without race conditions.
- Run from `${CLAUDE_PLUGIN_ROOT}/scripts/` — edits take effect immediately without reinstall.

### `maestro-subagent-log.js` — dispatch + handoff entries (SubagentStart/Stop)

- **Hook events:** both `SubagentStart` and `SubagentStop`, matcher `.*` — the same script handles both, branching on `hook_event_name`.
- **On SubagentStart** → writes a `kind:"dispatch"` entry:
  ```json
  { "ts": "…", "origin": "main_session", "kind": "dispatch",
    "agent": "<agent_type>", "agent_id": "<agent_id>",
    "input": "<last_assistant_message>", "log": "→ <agent_type>" }
  ```
  `last_assistant_message` on SubagentStart = the main session's message that triggered the subagent spawn. This is the **Input** shown in the right detail panel.
- **On SubagentStop with an `agent_type`** → parses `last_assistant_message` for a `HANDOFF:` line (last occurrence, tolerant of surrounding backticks/asterisks), writes a `kind:"handoff"` entry:
  ```json
  { "ts": "…", "origin": "<agent_type>", "kind": "handoff",
    "agent_id": "<agent_id>", "status": "success|condition|unknown",
    "label": "<label|null>", "output": "<last_assistant_message>",
    "log": "HANDOFF: <label>" }
  ```
  `last_assistant_message` on SubagentStop = the agent's entire final message, including `HANDOFF:` + any `handoff_details` payload. This is the **Output** shown in the right detail panel. `agent_id` is shared across both entries for correlation.
- **On SubagentStop with NO `agent_type`** → not a real workflow handoff (e.g. the `/ai-tools` listen-loop pausing for the user). Writes a `kind:"transition"` entry instead, so it can't masquerade as a failed/unknown agent run:
  ```json
  { "ts": "…", "origin": "transition", "kind": "transition",
    "output": "<last_assistant_message>", "log": "transition" }
  ```
  `buildInstances` segments this as its own neutral card (`status:"transition"`, displayName "Transition" via `titleFromName`); the message is kept as `output` for the detail panel.
- **`parseHandoff`:** takes the last `HANDOFF:` match; `"success"` (case-insensitive) → `status:"success"`, any other label → `status:"condition"`, no match → `status:"unknown"`.
- Same gate and append-only pattern as `maestro-session-log.js`.

### Hook registration (`hooks.json`)

```json
"SubagentStart": [{ "matcher": ".*", "hooks": [
  { "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/maestro-inject-agent-context.js"] },
  { "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/maestro-subagent-log.js"] }
]}],
"SubagentStop": [{ "matcher": ".*", "hooks": [
  { "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/maestro-subagent-log.js"] }
]}],
"PreToolUse":  [{ "matcher": ".*", "hooks": [
  { "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/maestro-session-log.js"] }
]}]
```

`maestro-inject-agent-context.js` and `maestro-subagent-log.js` are both registered under SubagentStart — order is irrelevant since they write to different logical concerns (additionalContext vs. the log file). `maestro-subagent-log.js` runs from the plugin dir (not the project copy), so edits to it are immediate.

### SessionEnd cleanup

`maestro-session-cleanup.sh` (SessionEnd hook) deletes both `maestro_session.log.jsonl` and `maestro_session.json`. The page's empty state is therefore the expected condition when no Maestro session is active — it is not an error.

### Why SUCCESS/FAILURE requires `maestro-subagent-log.js`

The plain tool-call log from `maestro-session-log.js` has **no outcome data** — it records only that a tool was called. The subagent's `HANDOFF:` line lives in its transcript (the `last_assistant_message` at SubagentStop time), which is only accessible to a SubagentStop hook. Without `maestro-subagent-log.js`, all instance `status` fields would be `null` and no icons would render status colors. See `maestro-architecture` for the full HANDOFF routing contract and how the orchestrator uses the same label to route the workflow.

## Things that bite

- **The log is ephemeral.** Deleted at SessionEnd by `maestro-session-cleanup.sh` (the same hook now also tears down the persistent ai-tools-manager container — so this view, like the app, is up only for the session). An empty page is the normal between-sessions state, not an error. The file only exists during and immediately after an active Maestro session.
- **Status comes exclusively from the SubagentStop handoff entry.** If `maestro-subagent-log.js` is not registered, all steps will have `status: null` and default to green checkmarks. If a real workflow agent (has an `agent_type`) exits without a parseable `HANDOFF:` line (crash, force-stop, broken Maestro contract), the status will be `"unknown"` (shown as yellow warning icon). A `SubagentStop` with **no `agent_type`** is instead logged as `kind:"transition"` (a neutral grey card) — that's the `/ai-tools` listen-loop pausing for the user, not a failed agent, so it deliberately does **not** show a yellow warning.
- **Reads use `mountedProjectPath(readCwd())`**, not `process.cwd()`. Inside Docker, `readCwd()` returns the host path from `/tmp/marketplace-data.json`; `mountedProjectPath` maps it to the container-visible `/app/…` path. Pattern is shared with `maestro-tree.ts` and `maestro-rules.ts`.
- **The SSE route polls server-side, not with `fs.watch`.** `inotify`/FSEvents is unreliable across Docker Desktop bind mounts on macOS. The route uses `setInterval` + `fs.readFileSync` + line-count diff instead. Each open browser connection runs its own poll loop; close the tab to kill the loop (the `request.signal` abort cleans up).
- **`reset` event on SessionEnd.** When the JSONL file disappears (deleted by `maestro-session-cleanup.sh`), the server emits `reset: {}` and `lineCount` drops to 0. The provider clears `entries`, the page shows the empty state. A new session's `init` event re-fills it. This is the normal SessionEnd → new session cycle without a page reload.
- **EventSource auto-reconnects.** On network hiccup or dev-server restart, the browser `EventSource` reconnects automatically. The server handler then sends a fresh `init` (the whole current log) — `setEntries(replacement)` handles it idempotently.
- **Live stream is app-wide.** `SessionLogProvider` mounts in `__root.tsx`'s `RootLayout`, so the SSE connection is maintained on every page. Entries accumulate in context even while the user is on `/workflows` or `/rules`; `/session-log` sees the full current state when you navigate to it.
- **`getMaestroSessionLog` server fn is kept for SSR.** On a hard reload the provider starts with `entries: []` until the first `init` event arrives. The route no longer uses a `loader`, so there is a brief empty state flash on page load — acceptable for a debugging tool.
- **Instances segment by origin change.** The same agent appearing twice in the log produces two steps — that's intentional (second run = second step). Parallel subagents would interleave their tool-call lines, fragmenting into many steps. Maestro runs subagents sequentially, so this is normally not an issue in practice. `agent_id` correlation keeps input↔output paired correctly even in edge-case interleaving.
- **`humanizeLog` returns `null` for bare `Agent`/`Task(...)` lines.** These PreToolUse entries capture the tool dispatch from the main session, but the richer `kind:"dispatch"` entry from `maestro-subagent-log.js` covers the same event more informatively. The nulls are intentionally filtered in `session-log-view.tsx`. Do not "fix" them.
- **`session-log.ts` must remain node-free.** It is imported client-side by the route. All `fs`/`path` usage belongs in `maestro-session-log.ts` (the server fn). Adding a Node import to `session-log.ts` will cause a client-bundle error.
- **`maestro-subagent-log.js` runs from the plugin dir, not the project copy.** Unlike `maestro-set-session-workflow.cjs` and `maestro-render-orchestrator.cjs` (which are copied into `.claude/scripts/` at install time), the SubagentStart/Stop scripts run directly from `${CLAUDE_PLUGIN_ROOT}/scripts/`. Editing `maestro-subagent-log.js` takes effect immediately for all projects. Adding or removing the hook registration in `hooks.json` requires a new Claude session to pick up.
- **Large messages in `input`/`output`.** A spawning message that includes injected skills + handoff templates can be several kilobytes. The right detail panel sections are scrollable. The JSONL file stores the full messages; that's intentional for debugging fidelity.
- **`--yellow` color token.** Added in `packages/styles/scss/abstracts/_tokens.scss` alongside `--green`/`--red`. Used for "unknown" status (subagent with no parseable HANDOFF line). Both light and dark mode variants exist.
