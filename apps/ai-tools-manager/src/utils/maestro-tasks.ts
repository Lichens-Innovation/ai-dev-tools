import { createServerFn } from "@tanstack/react-start";
import fs from "fs";
import path from "path";
import { readCwd, mountedProjectPath } from "./maestro-fs";

export type TaskStatus = "done" | "ready" | "blocked";

export interface MaestroTask {
  // The bare filename, e.g. "001-add-login-form.md"
  filename: string;
  // Path relative to the project root, e.g. ".claude/maestro-tasks/001-add-login-form.md"
  // — this is what the copy-prompt tells Claude Code to implement.
  relativePath: string;
  // First "# " heading in the file, or the filename if there is none.
  title: string;
  // Sibling task files referenced under "## Blocked by" (e.g. ["002-other-slice.md"]).
  blockedBy: string[];
  // done = completed; ready = all blockers done; blocked = a blocker is still open.
  // Read from status.json (the committed source of truth maintained by
  // maestro-task-status.cjs); derived live as a fallback when status.json is
  // absent or missing this file (e.g. a manually-added task not yet synced).
  status: TaskStatus;
  // The full markdown body.
  content: string;
}

const TASKS_SUBDIR = path.join(".claude", "maestro-tasks");
const STATUS_FILE = "status.json";

interface StatusEntry {
  status?: TaskStatus;
  blockedBy?: string[];
}
type StatusMap = Record<string, StatusEntry>;

function parseTitle(content: string, filename: string): string {
  const m = content.match(/^#\s+(.+?)\s*$/m);
  return m ? m[1] : filename.replace(/\.md$/, "");
}

// Pull the sibling filenames referenced in the "## Blocked by" section. The skill
// writes them as backtick-wrapped names (e.g. `002-other-slice.md`); "None" → [].
// Kept byte-for-byte in sync with the tracker's parser in
// plugins/ai-tools-manager/scripts/lib/maestro-tasks.cjs.
function parseBlockedBy(content: string): string[] {
  const start = content.search(/^##\s+Blocked by\s*$/m);
  if (start === -1) return [];
  const rest = content.slice(start);
  const nextHeading = rest.slice(1).search(/^##\s/m);
  const body = nextHeading === -1 ? rest : rest.slice(0, nextHeading + 1);
  const refs = body.match(/`(\d{3}-[\w-]+\.md)`/g) ?? [];
  return Array.from(new Set(refs.map((r) => r.replace(/`/g, ""))));
}

function readStatusMap(dir: string): StatusMap {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(dir, STATUS_FILE), "utf8")) as unknown;
    return data && typeof data === "object" ? (data as StatusMap) : {};
  } catch {
    return {};
  }
}

// Atomic write, sorted keys — mirrors writeStatus() in
// plugins/ai-tools-manager/scripts/lib/maestro-tasks.cjs so a save from either
// side produces a stable, reviewable diff.
function writeStatusMap(dir: string, statusMap: StatusMap): void {
  fs.mkdirSync(dir, { recursive: true });
  const ordered: StatusMap = {};
  for (const k of Object.keys(statusMap).sort((a, b) => a.localeCompare(b))) {
    ordered[k] = statusMap[k];
  }
  const target = path.join(dir, STATUS_FILE);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(ordered, null, 2)}\n`);
  fs.renameSync(tmp, target);
}

function listTaskFiles(dir: string): string[] {
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }
  // Numbered files sort lexicographically into their topological run order.
  return files.sort((a, b) => a.localeCompare(b));
}

// Recompute the full status map from the files on disk plus an authoritative
// done-set — the single source of cascade logic, kept in sync with
// buildStatusMap() in lib/maestro-tasks.cjs.
function buildStatusMap(dir: string, files: string[], doneSet: Set<string>): StatusMap {
  const fileSet = new Set(files);
  const out: StatusMap = {};
  for (const filename of files) {
    let content = "";
    try {
      content = fs.readFileSync(path.join(dir, filename), "utf8");
    } catch {
      content = "";
    }
    const blockedBy = parseBlockedBy(content);
    const status: TaskStatus = doneSet.has(filename)
      ? "done"
      : blockedBy.every((b) => doneSet.has(b) || !fileSet.has(b))
        ? "ready"
        : "blocked";
    out[filename] = { status, blockedBy };
  }
  return out;
}

function tasksFromFiles(dir: string, files: string[], statusMap: StatusMap): MaestroTask[] {
  const fileSet = new Set(files);
  const doneSet = new Set(files.filter((f) => statusMap[f]?.status === "done"));

  return files.map((filename) => {
    let content = "";
    try {
      content = fs.readFileSync(path.join(dir, filename), "utf8");
    } catch {
      content = "";
    }
    const entry = statusMap[filename];
    const blockedBy = entry?.blockedBy ?? parseBlockedBy(content);
    let status: TaskStatus;
    if (entry?.status) {
      status = entry.status; // materialized in status.json — read it directly
    } else if (doneSet.has(filename)) {
      status = "done";
    } else {
      // Derive: ready when every blocker is done or no longer exists.
      const satisfied = blockedBy.every((b) => doneSet.has(b) || !fileSet.has(b));
      status = satisfied ? "ready" : "blocked";
    }
    return {
      filename,
      relativePath: path.posix.join(".claude", "maestro-tasks", filename),
      title: parseTitle(content, filename),
      blockedBy,
      status,
      content,
    };
  });
}

function tasksDirFor(cwd: string): string {
  return path.join(mountedProjectPath(cwd), TASKS_SUBDIR);
}

export const getMaestroTasks = createServerFn({ method: "GET" }).handler(
  async (): Promise<MaestroTask[]> => {
    const cwd = readCwd();
    if (!cwd) return [];
    const dir = tasksDirFor(cwd);
    const files = listTaskFiles(dir);
    return tasksFromFiles(dir, files, readStatusMap(dir));
  }
);

// Mark one task file done, then recompute the ready/blocked cascade for every
// task (a dependent whose only blocker just closed flips to ready) and persist
// to status.json — the same operation `maestro-task-status.cjs done` performs,
// so a close from the UI and one from the orchestrator can't disagree.
export const closeMaestroTask = createServerFn({ method: "POST" })
  .inputValidator((data: { filename: string }) => data)
  .handler(async ({ data }): Promise<MaestroTask[]> => {
    const cwd = readCwd();
    if (!cwd) return [];
    const dir = tasksDirFor(cwd);
    const files = listTaskFiles(dir);
    const existingStatus = readStatusMap(dir);
    const filename = path.basename(data.filename);
    if (!files.includes(filename)) return tasksFromFiles(dir, files, existingStatus);

    const doneSet = new Set(files.filter((f) => existingStatus[f]?.status === "done"));
    doneSet.add(filename);
    const statusMap = buildStatusMap(dir, files, doneSet);
    writeStatusMap(dir, statusMap);
    return tasksFromFiles(dir, files, statusMap);
  });
