import fs from "fs";
import path from "path";

// Re-exported from the shared package so existing `./maestro-fs` imports keep working.
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

// Map a host project path to one reachable inside the container. The ensure script
// mounts the target project at /project and records its host path as `cwd` in
// marketplace-data.json, so any path under that root lives at /project/<subpath>.
// Used for ALL project-scoped file I/O (read and write) under Docker. Outside Docker,
// a no-op.
export function mountedProjectPath(cwd: string): string {
  if (process.env.RUNNING_IN_DOCKER !== "true" || !cwd) return cwd;
  try {
    const data = JSON.parse(fs.readFileSync("/tmp/marketplace-data.json", "utf8")) as { cwd?: string };
    const base = data.cwd;
    if (base && (cwd === base || cwd.startsWith(base + path.sep))) {
      return path.join("/project", cwd.slice(base.length));
    }
  } catch {
    // fall through to the raw cwd
  }
  return cwd;
}
