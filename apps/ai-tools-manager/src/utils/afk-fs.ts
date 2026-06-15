import fs from "fs";
import path from "path";

// Re-exported from the shared package so existing `./afk-fs` imports keep working.
export { parseFrontmatter } from "@repo/claude-fs";

// Resolve the Claude working directory. In Docker the host cwd is passed via the
// pre-computed marketplace-data.json (the container's process.cwd() is /app, not
// the user's project). Locally, process.cwd() is the project directory.
export function readCwd(): string {
  if (process.env.RUNNING_IN_DOCKER === "true") {
    try {
      const data = JSON.parse(fs.readFileSync("/tmp/marketplace-data.json", "utf8")) as { cwd?: string };
      return data.cwd ?? "";
    } catch {
      return "";
    }
  }
  return process.cwd();
}

// Map a host project path to one reachable inside the container. The hook mounts the
// repo root (the dir containing turbo.json) at /app and records it as `repoRoot` in
// marketplace-data.json, so a project under that root lives at /app/<subpath>. Used
// for READING project-scoped files (agents/skills/afk.json) under Docker — the host
// cwd is still what we display and write back through. Outside Docker, a no-op.
export function mountedProjectPath(cwd: string): string {
  if (process.env.RUNNING_IN_DOCKER !== "true" || !cwd) return cwd;
  try {
    const data = JSON.parse(fs.readFileSync("/tmp/marketplace-data.json", "utf8")) as { repoRoot?: string };
    const root = data.repoRoot;
    if (root && (cwd === root || cwd.startsWith(root + path.sep))) {
      return path.join("/app", cwd.slice(root.length));
    }
  } catch {
    // fall through to the raw cwd
  }
  return cwd;
}
