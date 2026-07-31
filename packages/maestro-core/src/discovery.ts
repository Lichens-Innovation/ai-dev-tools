// Discovery of the agents, skills, rules, and directory tree a project can choose from.
//
// PORTED FROM apps/ai-tools-manager/src/utils/{maestro.ts,maestro-rules.ts,maestro-tree.ts,
// maestro-vibe.ts}. The Docker branches are gone: there is no /project mount to rebase onto and
// no pre-computed /tmp/marketplace-data.json to fall back to, because the desktop app runs on the
// host and can just read the filesystem.

import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  parseFrontmatter,
  readAgentsFromDir,
  readSkillsFromDir,
  getUserAgents,
  getUserSkills,
  getInstalledPluginAgents,
  getInstalledPluginSkills,
} from "@repo/claude-fs";
import { IGNORE_DIRS, walkDirs, rulesFilesIn, ruleSearchDirs } from "./fs-scan.js";

import type { DiscoveredDefinition, ProjectRule, TreeNode } from "./contracts.js";
export type { DiscoveredDefinition, ProjectRule, TreeNode };

const execFileAsync = promisify(execFile);

/** Dedupe by id, keeping the first occurrence — callers push sources in priority order. */
function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  return out;
}

/** Where the plugin's agents live, relative to whichever repo root we find. */
const BUNDLED_AGENTS_REL = path.join("plugins", "ai-tools-manager", "agents");

/**
 * Walk up from `start` looking for `plugins/ai-tools-manager/agents`.
 *
 * A fixed `../../../` from `import.meta.dirname` does NOT work: this module runs from
 * `packages/maestro-core/src/` under vitest but from `apps/maestro/out/main/index.js` once
 * electron-vite has bundled it into the main process — including in `dev`, since electron-vite
 * builds main to `out/` there too. Those are different depths, and the fixed hop silently
 * resolved to `apps/plugins/…`, so the bundled subagents vanished from the picker in every
 * launched build. Searching upward is depth-independent.
 *
 * Exported so a test can drive it from the depth the bundle actually runs at, which is the only
 * thing that was ever wrong here.
 */
export function findUpBundledAgents(start: string): string | null {
  let dir = start;
  for (;;) {
    const candidate = path.join(dir, BUNDLED_AGENTS_REL);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * The Maestro plugin's bundled subagents.
 *
 * Found by walking up to the monorepo root when running from source or from a `dev`/`build`
 * bundle. A packaged desktop build ships the plugin inside its resources directory, outside any
 * such tree — it sets MAESTRO_BUNDLED_AGENTS_DIR instead. Deliberately env-driven rather than
 * reading Electron's `process.resourcesPath`, so this package stays free of Electron types.
 */
export function defaultBundledAgentsDir(): string | null {
  const fromEnv = process.env.MAESTRO_BUNDLED_AGENTS_DIR;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  return findUpBundledAgents(import.meta.dirname);
}

/**
 * All agents the user can choose from: project-scoped, global (~/.claude), the bundled Maestro
 * subagents, and every installed plugin's agents — each tagged with its `source`.
 */
export async function discoverAgents(
  projectRoot: string,
  bundledDir: string | null = defaultBundledAgentsDir(),
): Promise<DiscoveredDefinition[]> {
  const [project, user, bundled, plugins] = await Promise.all([
    projectRoot ? readAgentsFromDir(path.join(projectRoot, ".claude", "agents")) : Promise.resolve([]),
    getUserAgents(),
    bundledDir ? readAgentsFromDir(bundledDir) : Promise.resolve([]),
    getInstalledPluginAgents(),
  ]);
  return dedupeById([
    ...project.map((a) => ({ id: a.name, description: a.description, source: "project" })),
    ...user.map((a) => ({ id: a.name, description: a.description, source: "user" })),
    ...bundled.map((a) => ({ id: a.name, description: a.description, source: "ai-tools-manager" })),
    ...plugins.map((a) => ({ id: a.name, description: a.description, source: a.plugin })),
  ]).sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * All skills the user can choose from: project-scoped, global (~/.claude), and every installed
 * plugin's skills — each tagged with its `source`.
 */
export async function discoverSkills(projectRoot: string): Promise<DiscoveredDefinition[]> {
  const [project, user, plugins] = await Promise.all([
    projectRoot ? readSkillsFromDir(path.join(projectRoot, ".claude", "skills")) : Promise.resolve([]),
    getUserSkills(),
    getInstalledPluginSkills(),
  ]);
  return dedupeById([
    ...project.map((s) => ({ id: s.name, description: s.description, source: "project" })),
    ...user.map((s) => ({ id: s.name, description: s.description, source: "user" })),
    ...plugins.map((s) => ({ id: s.name, description: s.description, source: s.plugin })),
  ]).sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Every rule file under any `.claude/rules/` in the project, with the directory it currently
 * lives in. Scanning the whole tree (not just the root) is what keeps rules that a previous save
 * MOVED into a subdirectory visible in the picker.
 */
export function discoverProjectRules(projectRoot: string): ProjectRule[] {
  if (!projectRoot) return [];
  const out: ProjectRule[] = [];
  for (const dir of ruleSearchDirs(projectRoot)) {
    for (const file of rulesFilesIn(dir)) {
      let text: string;
      try {
        text = fs.readFileSync(file, "utf8");
      } catch {
        continue;
      }
      const fm = parseFrontmatter(text);
      out.push({
        id: fm.name || path.basename(file).replace(/\.md$/, ""),
        description: fm.description ?? "",
        body: text.replace(/^---[\s\S]*?---\s*\n?/, ""),
        dir: path.relative(projectRoot, dir),
      });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** Directory tree used by the /rules view to assign rules to paths. */
export function discoverProjectTree(projectRoot: string): TreeNode[] {
  if (!projectRoot) return [];
  return Array.from(walkDirs(projectRoot, { ignore: IGNORE_DIRS }), (d) => ({
    path: d.relative,
    name: d.name,
    depth: d.depth,
  }));
}

/**
 * `vibe-rules list` prints a header line then one `- <name>` per rule; ignore everything else.
 * Exported for tests — the CLI is not available in CI.
 */
export function parseVibeList(out: string): string[] {
  const ids: string[] = [];
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^\s*-\s+(.+?)\s*$/);
    if (m) ids.push(m[1]);
  }
  return ids;
}

/**
 * Installable rules from the local vibe-rules store. Selecting one and assigning it to a path
 * makes the save step run `vibe-rules load <id> claude-code -t <dir>/.claude/rules/<id>.md`.
 *
 * Returns [] when the CLI isn't installed — the /rules view degrades to project rules only.
 */
export async function discoverVibeRules(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("vibe-rules", ["list"], { encoding: "utf8" });
    return parseVibeList(stdout);
  } catch {
    return [];
  }
}

/** Whether the `vibe-rules` CLI is on PATH, so the UI can say so instead of silently listing nothing. */
export async function hasVibeRules(): Promise<boolean> {
  try {
    await execFileAsync("vibe-rules", ["--version"], { encoding: "utf8" });
    return true;
  } catch {
    return false;
  }
}
