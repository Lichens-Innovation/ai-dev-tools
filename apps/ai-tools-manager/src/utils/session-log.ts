import { titleFromName } from "./text";
import type { SessionLogEntry } from "./afk-session-log";

export interface Instance {
  id: number;
  origin: string;
  displayName: string;
  /** Index of the first entry in the flat entries array that belongs to this segment. */
  startIndex: number;
  entries: SessionLogEntry[];
  /** null for the main_session — status only applies to subagent instances. */
  status: "success" | "condition" | "unknown" | null;
  /** The HANDOFF label (e.g. "tests_failed"), null when status is success or no handoff. */
  label: string | null;
  /** Full spawning message sent by the main session (from the matching dispatch entry). */
  input: string | null;
  /** Full final message the agent sent back (from the handoff entry of this segment). */
  output: string | null;
}

/**
 * Segment the flat log entries into ordered instance runs.
 * A new segment starts whenever `origin` changes — so the same agent appearing
 * a second time yields a second card, matching the design.
 * dispatch/handoff entries are included in the segment they belong to, but are
 * also used to populate the input/output/status fields.
 */
export function buildInstances(entries: SessionLogEntry[]): Instance[] {
  const instances: Instance[] = [];
  let current: Instance | null = null;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    if (!current || entry.origin !== current.origin) {
      current = {
        id: instances.length,
        origin: entry.origin,
        displayName:
          entry.origin === "main_session"
            ? "Main Session"
            : titleFromName(entry.origin),
        startIndex: i,
        entries: [],
        status: null,
        label: null,
        input: null,
        output: null,
      };
      instances.push(current);
    }

    current.entries.push(entry);

    // Populate status/label/output from handoff entries within this segment.
    if (entry.kind === "handoff" && current.origin === entry.origin) {
      current.status = entry.status ?? "unknown";
      current.label = entry.label ?? null;
      current.output = entry.output ?? null;
    }
  }

  // Second pass: correlate input from dispatch entries (matched by agent_id).
  // The dispatch entry lives in the main_session segment but its agent_id links
  // it to the subagent segment it spawned.
  const dispatchByAgentId = new Map<string, SessionLogEntry>();
  for (const entry of entries) {
    if (entry.kind === "dispatch" && entry.agent_id) {
      dispatchByAgentId.set(entry.agent_id, entry);
    }
  }

  // For each subagent segment, find the dispatch entry whose agent_id matches
  // the handoff entry in that segment.
  for (const inst of instances) {
    if (inst.origin === "main_session") continue;
    const handoff = inst.entries.find((e) => e.kind === "handoff" && e.agent_id);
    if (handoff?.agent_id) {
      const dispatch = dispatchByAgentId.get(handoff.agent_id);
      if (dispatch) inst.input = dispatch.input ?? null;
    }
    // Fallback: try matching dispatch by agent type when there's only one run.
    if (inst.input === null) {
      for (const entry of entries) {
        if (entry.kind === "dispatch" && entry.agent === inst.origin && entry.input) {
          inst.input = entry.input;
          break;
        }
      }
    }
  }

  return instances;
}

/**
 * Produce a human-readable one-liner for a log entry.
 * Returns null for entries that are covered by a richer dispatch/handoff line
 * (the bare PreToolUse "Agent" tool-call lines), which the view should filter out.
 */
export function humanizeLog(entry: SessionLogEntry): string | null {
  if (entry.kind === "dispatch") {
    return `calling \`${entry.agent}\` agent`;
  }
  if (entry.kind === "handoff") {
    const label = entry.label ?? "none";
    const status = entry.status ?? "unknown";
    return `handed off — ${label} (${status})`;
  }

  const log = entry.log ?? "";

  // Suppress the bare "Agent" / "Task(...)" PreToolUse entries; the richer
  // dispatch entry from afk-subagent-log.js covers the same event.
  if (log === "Agent" || log === "Task" || /^Task\(/.test(log)) {
    return null;
  }

  // Parse "ToolName(arg)" format.
  const m = log.match(/^(\w+)\((.*)?\)$/s);
  if (m) {
    const [, tool, arg] = m;
    const a = (arg ?? "").trim();
    switch (tool) {
      case "Read":
        return `read file \`${a}\``;
      case "Write":
        return `wrote file \`${a}\``;
      case "Edit":
      case "NotebookEdit":
        return `edited file \`${a}\``;
      case "Glob":
        return `searched files \`${a}\``;
      case "Grep":
        return `searched for \`${a}\``;
      case "Bash":
        return `ran \`${a}\``;
      case "Skill":
        return `used skill \`${a}\``;
      case "TaskCreate":
        return `created task \`${a}\``;
      default:
        return log;
    }
  }

  return log || null;
}
