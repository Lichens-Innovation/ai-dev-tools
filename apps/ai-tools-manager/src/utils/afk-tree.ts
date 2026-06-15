import { createServerFn } from "@tanstack/react-start";
import fs from "fs";
import path from "path";
import { readCwd, mountedProjectPath } from "./afk-fs";

export interface TreeNode {
  path: string; // relative to cwd
  name: string;
  depth: number;
}

export const getProjectTree = createServerFn({ method: "GET" }).handler(async (): Promise<TreeNode[]> => {
  const cwd = mountedProjectPath(readCwd());
  if (!cwd) return [];
  return walkDir(cwd, cwd, 0, 4, ["node_modules", ".git", "dist", "build", ".next", ".turbo", ".output"]);
});

function walkDir(base: string, dir: string, depth: number, maxDepth: number, ignore: string[]): TreeNode[] {
  if (depth > maxDepth) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const result: TreeNode[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (ignore.includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    const rel = path.relative(base, fullPath);
    result.push({ path: rel, name: entry.name, depth });
    result.push(...walkDir(base, fullPath, depth + 1, maxDepth, ignore));
  }
  return result;
}
