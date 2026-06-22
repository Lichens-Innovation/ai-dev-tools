import { createServerFn } from "@tanstack/react-start";
import fs from "fs";
import path from "path";
import { readCwd, mountedProjectPath } from "./afk-fs";

export interface AfkTask {
  // The bare filename, e.g. "001-add-login-form.md"
  filename: string;
  // Path relative to the project root, e.g. ".claude/afk-tasks/001-add-login-form.md"
  // — this is what the copy-prompt tells Claude Code to implement.
  relativePath: string;
  // First "# " heading in the file, or the filename if there is none.
  title: string;
  // Sibling task files referenced under "## Blocked by" (e.g. ["002-other-slice.md"]).
  blockedBy: string[];
  // The full markdown body.
  content: string;
}

const TASKS_SUBDIR = path.join(".claude", "afk-tasks");

function parseTitle(content: string, filename: string): string {
  const m = content.match(/^#\s+(.+?)\s*$/m);
  return m ? m[1] : filename.replace(/\.md$/, "");
}

// Pull the sibling filenames referenced in the "## Blocked by" section. The skill
// writes them as backtick-wrapped names (e.g. `002-other-slice.md`); "None" → [].
function parseBlockedBy(content: string): string[] {
  const start = content.search(/^##\s+Blocked by\s*$/m);
  if (start === -1) return [];
  // Take from the heading to the next "## " section (or end of file).
  const rest = content.slice(start);
  const nextHeading = rest.slice(1).search(/^##\s/m);
  const body = nextHeading === -1 ? rest : rest.slice(0, nextHeading + 1);
  const refs = body.match(/`(\d{3}-[\w-]+\.md)`/g) ?? [];
  return Array.from(new Set(refs.map((r) => r.replace(/`/g, ""))));
}

export const getAfkTasks = createServerFn({ method: "GET" }).handler(
  async (): Promise<AfkTask[]> => {
    const cwd = readCwd();
    if (!cwd) return [];
    const dir = path.join(mountedProjectPath(cwd), TASKS_SUBDIR);

    let files: string[];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
    } catch {
      return [];
    }

    // Numbered files sort lexicographically into their topological run order.
    files.sort((a, b) => a.localeCompare(b));

    return files.map((filename) => {
      let content = "";
      try {
        content = fs.readFileSync(path.join(dir, filename), "utf8");
      } catch {
        content = "";
      }
      return {
        filename,
        relativePath: path.posix.join(".claude", "afk-tasks", filename),
        title: parseTitle(content, filename),
        blockedBy: parseBlockedBy(content),
        content,
      };
    });
  }
);
