---
name: log-view
description: "Explains how the /session-log view in ai-tools-manager is built end-to-end: the left instance card-diagram, the right humanized log pane, the hover input/output popup, how log entries map to Instance segments, and how the maestro-session-log.js / maestro-subagent-log.js hooks write the maestro_session.log.jsonl it reads. Use when the user is working inside apps/ai-tools-manager and asks how the session-log view works, how cards/instances are derived, where SUCCESS/FAILURE comes from, why the log is empty, why a card has no status badge, or how dispatch/handoff entries are produced by the hooks."
---

# Log View

The `/session-log` route (`src/routes/session-log.tsx`) is a **read-only debugger** for Maestro workflow sessions. It reads `<cwd>/.claude/maestro_session.log.jsonl` and presents it in two panes: a **left vertical card diagram** (one card per instance occurrence — main session + each subagent run, with a SUCCESS/FAILURE badge) and a **right humanized log** (tool calls as readable English, grouped by instance). Clicking a card scrolls the log to where that instance started. Hovering a subagent card opens a popup showing the full input message (what the main session told the agent) and output message (the agent's full final message including its `HANDOFF:` line) — the primary debugging view.

This is the **read side** of the Maestro runtime: it displays what the hook scripts write. See the `maestro-architecture` skill for the **write side** (how the log is produced and the full HANDOFF routing contract). See the `workflow-view` skill for the sibling `/workflows` authoring view.

## Layout

```
┌────────────────────────────── TopNav (top-nav.tsx) ──────────────────────────────┐
│ Workflows | Rules | Session Log                                              ☀    │
├──────────────────────────────┬───────────────────────────────────────────────────┤
│ Left — SessionLogCards        │ Right — SessionLogView                            │
│ (session-log-cards.tsx)       │ (session-log-view.tsx)                            │
│                               │                                                   │
│  Agents Flow                  │  Logs                              ● live          │
│                               │                                                   │
│  ┌──────────────────┐         │  MAIN SESSION                                     │
│  │  Main Session    │         │  - calling `backend` agent                        │
│  └────────┬─────────┘         │                                                   │
│           ↓                   │  BACKEND                                          │
│  ┌──────────────────┐         │  - [Backend]: read file `/src/…`                  │
│  │  Backend         │         │  - [Backend]: edited file `/src/…`                │
│  │  success ← green │  hover→ │  - [Backend]: handed off — success                │
│  └────────┬─────────┘  popup  │                                                   │
│           ↓            shows  │  MAIN SESSION                                     │
│  ┌──────────────────┐  Input  │  - calling `test` agent                           │
│  │  Test            │ /Output │                                                   │
│  │  failure · …←red │         │  TEST                                             │
│  └────────┬─────────┘         │  - [Test]: ran `npm test`                         │
│           ↓                   │  - [Test]: handed off — tests_failed (condition)  │
│          ...                  │  …                                                │
│                               │                                                   │
└──────────────────────────────┴───────────────────────────────────────────────────┘
   360px                                    1fr
```

**No workflow selector and no YAML preview toggle** — TopNav is rendered bare (no `workflowSelector` or `onPreviewToggle` props). When the log file is absent the whole two-pane layout is replaced by an **empty state**: a centred `ScrollText` icon + "No session log found" message + a `● live / ○ connecting…` indicator (the log is ephemeral, so this is the normal between-sessions condition).

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
  activeId state (which card is selected)
  sectionRefs: Record<id, HTMLDivElement|null>  (one per instance section in the right pane)
       │
       ├──▶ SessionLogCards (left)
       │      renders Instance[] as a vertical card list with ArrowDown connectors
       │      onSelect(id): setActiveId(id) + sectionRefs[id].scrollIntoView()
       │
       └──▶ SessionLogView (right)
              renders per-instance sections; each section anchors its sectionRef
              calls humanizeLog(entry) per entry, filters nulls, prefixes subagent lines
              header shows "● live" / "○ reconnecting…" from connected

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
| Route, state, scroll-sync, empty state | `src/routes/session-log.tsx` |
| Left card diagram, status badge, hover input/output popup | `src/components/session-log-cards.tsx` |
| Right humanized log pane, live indicator, per-section anchors | `src/components/session-log-view.tsx` |
| SSE server route — tails the JSONL and pushes init/entry/reset | `src/routes/api/session-log-stream.ts` |
| App-wide SSE context: `SessionLogProvider`, `useSessionLog()` | `src/utils/session-log-context.tsx` |
| Log reader server fn + `resolveLogFile` + `parseLogLines` + `SessionLogEntry` | `src/utils/maestro-session-log.ts` |
| Pure transforms `buildInstances` + `humanizeLog` + `Instance` type | `src/utils/session-log.ts` |
| Top bar — nav links incl. `ScrollText` + global `●` live dot | `src/components/top-nav.tsx` |
| Docker-aware cwd helpers (`readCwd`, `mountedProjectPath`) | `src/utils/maestro-fs.ts` |
| `titleFromName` — origin string → display name | `src/utils/text.ts` |
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

  // Present only on handoff entries (SubagentStop):
  kind?: "handoff";
  agent_id?: string;   // matches the dispatch entry for this run
  status?: "success" | "condition" | "unknown";
  label?: string | null;  // raw HANDOFF label; null for "success" outcome
  output?: string;     // full final message (agent's last message, incl. HANDOFF: line + payload)
}
```

A missing `kind` = a plain tool-call entry from `maestro-session-log.js`. The schema is **backward compatible**: old logs (tool-call-only) parse and display correctly; `dispatch`/`handoff` fields simply don't appear.

### `Instance` — the derived client model

`buildInstances` in `src/utils/session-log.ts` groups entries into segments:

```ts
interface Instance {
  id: number;           // position in the ordered list (stable card key + sectionRef key)
  origin: string;       // raw origin string
  displayName: string;  // "Main Session" | titleFromName(origin)
  startIndex: number;   // index of first entry in the flat entries[] array
  entries: SessionLogEntry[];

  status: "success" | "condition" | "unknown" | null;  // null = main_session
  label: string | null;   // condition label, e.g. "tests_failed" (null for success)
  input: string | null;   // spawning message from the matching dispatch entry
  output: string | null;  // final message from this segment's handoff entry
}
```

## Left pane — card diagram (`session-log-cards.tsx`)

One card per `Instance`, stacked vertically with `<ArrowDown size={16} />` connectors (last card omits the arrow). Each card:

- **Click** → `onSelect(id)` → `setActiveId(id)` + `scrollIntoView` on the matching right-pane section.
- **Active card** → `border-primary bg-(--primary-dim)` highlight; default → `border-(--line) bg-(--bg-elev)`.
- **Status badge** (subagent cards only, `status !== null`):
  - `"success"` → `text-(--green)` "success"
  - `"condition"` → `text-(--red)` "failure · `<label>`"
  - `"unknown"` → `text-(--ink-3)` "—"
  - Main Session → no badge
- **Hover popup** — only rendered for subagent cards where `inst.input || inst.output` is non-null (needs dispatch/handoff entries from `maestro-subagent-log.js`). Implemented via `hoveredId` state + `onMouseEnter`/`onMouseLeave` on both the card wrapper and the popup (so moving from card to popup doesn't dismiss it). Popup has two scrollable `<pre>` sections — **Input** and **Output** — styled `max-h-[80vh] overflow-y-auto w-[30rem] bg-(--bg) border border-(--line) rounded-lg shadow-xl`. Shows "no message captured" when a side is null.

## Right pane — humanized log (`session-log-view.tsx`)

A fixed header row (title + `● live` / `○ reconnecting…` indicator driven by the `connected` prop) above a `flex-1 overflow-y-auto` scroll body. Per-instance sections:

```tsx
<div ref={(el) => { sectionRefs.current[inst.id] = el; }}
     className={`scroll-mt-4 mb-4 ${isActive ? "bg-(--primary-dim) rounded-md px-2 -mx-2" : ""}`}>
  <div className="text-(--ink-3) text-[10px] font-semibold uppercase tracking-wider py-1 mb-0.5">
    {inst.displayName}
  </div>
  {lines.map(line => (
    <div className="whitespace-pre-wrap break-words text-(--ink-2)">
      - {isMainSession ? line : `[${inst.displayName}]: ${line}`}
    </div>
  ))}
</div>
```

The active-card section gets a `--primary-dim` tinted background. When a card is clicked, `scrollIntoView({ behavior:"smooth", block:"start" })` brings its section into view; `scroll-mt-4` adds top clearance so the section label isn't obscured.

## Deriving instances (`buildInstances`)

`buildInstances` in `src/utils/session-log.ts` (pure, no Node imports) walks entries in order and starts a **new segment whenever `origin` changes**. This means:

- The same agent appearing after a main-session interlude becomes a **separate card** (correct — it's a second invocation).
- The main session itself segments into multiple "Main Session" cards when subagents interleave (normal for sequential Maestro dispatch).
- Parallel subagents would fragment, but Maestro runs agents sequentially, so interleaving is rare.

**Status/label/output** are populated from the first `kind:"handoff"` entry found within the segment (matching `origin`). **Input** is correlated by `agent_id`: find the handoff's `agent_id`, then find the dispatch entry with the same `agent_id` anywhere in the full `entries[]`. Fallback: if no handoff entry exists (agent didn't produce one), search for a dispatch entry matching by `agent` type.

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
  `last_assistant_message` on SubagentStart = the main session's message that triggered the subagent spawn. This is the **Input** shown in the hover popup.
- **On SubagentStop** → parses `last_assistant_message` for a `HANDOFF:` line (last occurrence, tolerant of surrounding backticks/asterisks), writes a `kind:"handoff"` entry:
  ```json
  { "ts": "…", "origin": "<agent_type>", "kind": "handoff",
    "agent_id": "<agent_id>", "status": "success|condition|unknown",
    "label": "<label|null>", "output": "<last_assistant_message>",
    "log": "HANDOFF: <label>" }
  ```
  `last_assistant_message` on SubagentStop = the agent's entire final message, including `HANDOFF:` + any `handoff_details` payload. This is the **Output** shown in the hover popup. `agent_id` is shared across both entries for correlation.
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

The plain tool-call log from `maestro-session-log.js` has **no outcome data** — it records only that a tool was called. The subagent's `HANDOFF:` line lives in its transcript (the `last_assistant_message` at SubagentStop time), which is only accessible to a SubagentStop hook. Without `maestro-subagent-log.js`, all instance `status` fields would be `null` and no badges would render. See `maestro-architecture` for the full HANDOFF routing contract and how the orchestrator uses the same label to route the workflow.

## Things that bite

- **The log is ephemeral.** Deleted at SessionEnd by `maestro-session-cleanup.sh` (the same hook now also tears down the persistent ai-tools-manager container — so this view, like the app, is up only for the session). An empty page is the normal between-sessions state, not an error. The file only exists during and immediately after an active Maestro session.
- **Status comes exclusively from the SubagentStop handoff entry.** If `maestro-subagent-log.js` is not registered, all cards will have `status: null` and no badge. If a subagent exits without a parseable `HANDOFF:` line (crash, force-stop, no Maestro contract), the status will be `"unknown"` (shown as "—").
- **Reads use `mountedProjectPath(readCwd())`**, not `process.cwd()`. Inside Docker, `readCwd()` returns the host path from `/tmp/marketplace-data.json`; `mountedProjectPath` maps it to the container-visible `/app/…` path. Pattern is shared with `maestro-tree.ts` and `maestro-rules.ts`.
- **The SSE route polls server-side, not with `fs.watch`.** `inotify`/FSEvents is unreliable across Docker Desktop bind mounts on macOS. The route uses `setInterval` + `fs.readFileSync` + line-count diff instead. Each open browser connection runs its own poll loop; close the tab to kill the loop (the `request.signal` abort cleans up).
- **`reset` event on SessionEnd.** When the JSONL file disappears (deleted by `maestro-session-cleanup.sh`), the server emits `reset: {}` and `lineCount` drops to 0. The provider clears `entries`, the page shows the empty state. A new session's `init` event re-fills it. This is the normal SessionEnd → new session cycle without a page reload.
- **EventSource auto-reconnects.** On network hiccup or dev-server restart, the browser `EventSource` reconnects automatically. The server handler then sends a fresh `init` (the whole current log) — `setEntries(replacement)` handles it idempotently.
- **Live stream is app-wide.** `SessionLogProvider` mounts in `__root.tsx`'s `RootLayout`, so the SSE connection is maintained on every page. Entries accumulate in context even while the user is on `/workflows` or `/rules`; `/session-log` sees the full current state when you navigate to it.
- **`getMaestroSessionLog` server fn is kept for SSR.** On a hard reload the provider starts with `entries: []` until the first `init` event arrives. The route no longer uses a `loader`, so there is a brief empty state flash on page load — acceptable for a debugging tool.
- **Instances segment by origin change.** The same agent appearing twice in the log produces two cards — that's intentional (second run = second card). Parallel subagents would interleave their tool-call lines, fragmenting into many cards. Maestro runs subagents sequentially, so this is normally not an issue in practice. `agent_id` correlation keeps input↔output paired correctly even in edge-case interleaving.
- **`humanizeLog` returns `null` for bare `Agent`/`Task(...)` lines.** These PreToolUse entries capture the tool dispatch from the main session, but the richer `kind:"dispatch"` entry from `maestro-subagent-log.js` covers the same event more informatively. The nulls are intentionally filtered in `session-log-view.tsx`. Do not "fix" them.
- **`session-log.ts` must remain node-free.** It is imported client-side by the route. All `fs`/`path` usage belongs in `maestro-session-log.ts` (the server fn). Adding a Node import to `session-log.ts` will cause a client-bundle error.
- **`maestro-subagent-log.js` runs from the plugin dir, not the project copy.** Unlike `maestro-set-session-workflow.cjs` and `maestro-render-orchestrator.cjs` (which are copied into `.claude/scripts/` at install time), the SubagentStart/Stop scripts run directly from `${CLAUDE_PLUGIN_ROOT}/scripts/`. Editing `maestro-subagent-log.js` takes effect immediately for all projects. Adding or removing the hook registration in `hooks.json` requires a new Claude session to pick up.
- **The hover popup uses `onMouseEnter`/`onMouseLeave` state, not CSS `group-hover`.** Pure CSS `group-hover` loses the popup when the pointer briefly leaves the card on its way to the popup. The React state approach (`hoveredId`) keeps it open through that gap.
- **Large messages in `input`/`output`.** A spawning message that includes injected skills + handoff templates can be several kilobytes. The hover popup has `max-h-[80vh] overflow-y-auto` — scroll within the popup to read it all. The JSONL file stores the full messages; that's intentional for debugging fidelity.
