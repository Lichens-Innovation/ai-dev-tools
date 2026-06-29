import { createServerFn } from "@tanstack/react-start";
import fs from "fs";
import path from "path";
import { readCwd, mountedProjectPath } from "./maestro-fs";

export interface SessionLogEntry {
  ts: string;
  origin: string;
  log: string;
  // Set on dispatch/handoff entries written by maestro-subagent-log.js:
  kind?: "dispatch" | "handoff" | "transition";
  agent?: string;      // dispatch: the subagent's agent_type
  agent_id?: string;   // shared key linking a dispatch↔handoff pair
  // dispatch only:
  input?: string;      // full spawning message (main session → agent)
  offered_skills?: { loaded: string[]; referenced: string[] };  // skills the SubagentStart hook surfaced
  // handoff only:
  status?: "success" | "condition" | "unknown";
  label?: string | null;
  output?: string;     // full final message (agent → main session)
}

/** Resolve the absolute path to maestro_session.log.jsonl, or null if cwd is unavailable. */
export function resolveLogFile(): string | null {
  const cwd = mountedProjectPath(readCwd());
  if (!cwd) return null;
  return path.join(cwd, ".claude", "maestro_session.log.jsonl");
}

/** Parse a JSONL string into SessionLogEntry[], skipping malformed lines. */
export function parseLogLines(raw: string): SessionLogEntry[] {
  return raw
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l) as SessionLogEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is SessionLogEntry => !!e && typeof e.origin === "string");
}

/** The host working directory — used client-side to display log file paths relative to it. */
export const getProjectCwd = createServerFn({ method: "GET" }).handler(
  async (): Promise<string> => readCwd()
);

export const getMaestroSessionLog = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionLogEntry[]> => {
    const file = resolveLogFile();
    if (!file) return [];
    let raw: string;
    try {
      raw = fs.readFileSync(file, "utf8");
    } catch {
      return [];
    }
    return parseLogLines(raw);
  }
);
