import { createServerFn } from "@tanstack/react-start";
import { execFileSync } from "child_process";
import fs from "fs";

// Installable rules from the local vibe-rules store (`vibe-rules list`). Selecting one
// and assigning it to a path makes the host-side apply step run
// `vibe-rules load <id> claude-code -t <dir>/.claude/rules/<id>.md` on save.
//
// vibe-rules is a host CLI, absent inside the container, so under Docker we read the
// list the hook pre-computed into marketplace-data.json (same pattern as readCwd).
export const getVibeRules = createServerFn({ method: "GET" }).handler(async (): Promise<string[]> => {
  if (process.env.RUNNING_IN_DOCKER === "true") {
    try {
      const data = JSON.parse(fs.readFileSync("/tmp/marketplace-data.json", "utf8")) as { vibeRules?: string[] };
      return data.vibeRules ?? [];
    } catch {
      return [];
    }
  }
  try {
    const out = execFileSync("vibe-rules", ["list"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return parseVibeList(out);
  } catch {
    return [];
  }
});

// `vibe-rules list` prints a header line then one `- <name>` per rule; ignore everything else.
export function parseVibeList(out: string): string[] {
  const ids: string[] = [];
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^\s*-\s+(.+?)\s*$/);
    if (m) ids.push(m[1]);
  }
  return ids;
}
