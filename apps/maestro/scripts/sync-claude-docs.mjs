#!/usr/bin/env node
// Copies the ai-dev-tools repo-root docs/ that the maestro-help skill's topic table (and
// super-help's, which it mirrors) references into apps/maestro/resources/claude-code-docs/.
//
// Why this exists: those docs live outside apps/maestro's own tree, so they aren't swept into a
// packaged build's asar the way apps/maestro/docs/app/*.md is. This gives the packaged branch of
// claudeCodeDocsDir() (src/main/bundled-assets.ts) something to find at
// `<resourcesPath>/claude-code-docs`. In dev/build (unpackaged) that resolver instead finds the
// monorepo's docs/ directly by walking up from app.getAppPath(), so this script only matters once
// the app is actually packaged — but it's cheap and safe to run on every build regardless.
//
//   node apps/maestro/scripts/sync-claude-docs.mjs
//
// The output directory is a gitignored build artifact, not source — regenerated on every build,
// never hand-edited, never committed.

import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const repoRoot = path.resolve(appRoot, "../..");
const srcDir = path.join(repoRoot, "docs");
const outDir = path.join(appRoot, "resources", "claude-code-docs");

// Kept in sync with plugins/ai-tools-manager/skills/super-help/SKILL.md's topic table, which
// maestro-help/SKILL.md mirrors for the same Claude Code concept docs.
const DOCS = [
  "plugins.md",
  "skills.md",
  "subagents.md",
  "hooks.md",
  "marketplace.md",
  "rules.md",
  "mcp.md",
  "memory.md",
  "skills-cli.md",
  "claude-code.md",
];

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const name of DOCS) {
  copyFileSync(path.join(srcDir, name), path.join(outDir, name));
  process.stdout.write(`synced ${path.relative(repoRoot, path.join(outDir, name))}\n`);
}
