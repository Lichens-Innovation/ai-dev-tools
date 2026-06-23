import { createServerFn } from "@tanstack/react-start";
import fs from "fs";
import path from "path";
import { readCwd, mountedProjectPath } from "./afk-fs";

export interface SessionLogEntry {
  ts: string;
  origin: string;
  log: string;
  // Set on dispatch/handoff entries written by afk-subagent-log.js:
  kind?: "dispatch" | "handoff";
  agent?: string;      // dispatch: the subagent's agent_type
  agent_id?: string;   // shared key linking a dispatch↔handoff pair
  // dispatch only:
  input?: string;      // full spawning message (main session → agent)
  // handoff only:
  status?: "success" | "condition" | "unknown";
  label?: string | null;
  output?: string;     // full final message (agent → main session)
}

/** Resolve the absolute path to afk_session.log.jsonl, or null if cwd is unavailable. */
export function resolveLogFile(): string | null {
  const cwd = mountedProjectPath(readCwd());
  if (!cwd) return null;
  return path.join(cwd, ".claude", "afk_session.log.jsonl");
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

export const getAfkSessionLog = createServerFn({ method: "GET" }).handler(
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
