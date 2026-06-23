import { createServerFn } from "@tanstack/react-start";
import fs from "fs";
import path from "path";
import { readCwd, mountedProjectPath, parseFrontmatter } from "./afk-fs";

export interface ProjectRule {
  id: string;
  description: string;
  body: string;
  dir: string; // project-relative dir whose .claude/rules holds this file; "" = project root
}

const IGNORE = ["node_modules", ".git", "dist", "build", ".next", ".turbo", ".output"];
const MAX_DEPTH = 4;

// Rules can live in any directory's `.claude/rules/` — they start at the project root
// but afk-apply-rules.js moves them into assigned directories on save, so we scan the
// whole tree (not just the root) to keep moved rules discoverable in the picker.
export const getProjectRules = createServerFn({ method: "GET" }).handler(async (): Promise<ProjectRule[]> => {
  const cwd = mountedProjectPath(readCwd());
  if (!cwd) return [];
  const out: ProjectRule[] = [];
  collectRules(cwd, cwd, 0, out);
  return out.sort((a, b) => a.id.localeCompare(b.id));
});

function collectRules(base: string, dir: string, depth: number, out: ProjectRule[]): void {
  const rulesDir = path.join(dir, ".claude", "rules");
  let ruleFiles: string[] = [];
  try {
    ruleFiles = fs.readdirSync(rulesDir);
  } catch {
    ruleFiles = [];
  }
  for (const entry of ruleFiles) {
    if (!entry.endsWith(".md")) continue;
    try {
      const text = fs.readFileSync(path.join(rulesDir, entry), "utf8");
      const fm = parseFrontmatter(text);
      const body = text.replace(/^---[\s\S]*?---\s*\n?/, "");
      out.push({
        id: fm.name || entry.replace(/\.md$/, ""),
        description: fm.description ?? "",
        body,
        dir: path.relative(base, dir),
      });
    } catch {
      // skip unreadable file
    }
  }

  if (depth >= MAX_DEPTH) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    // Skip ignored dirs and `.claude` itself (its rules are read directly above).
    if (IGNORE.includes(e.name) || e.name === ".claude") continue;
    collectRules(base, path.join(dir, e.name), depth + 1, out);
  }
}
