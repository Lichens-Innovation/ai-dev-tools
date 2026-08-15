// Where the files the app SHIPS live, decided from the app's own path.
//
// The node-side core deliberately has no default for this. Resolving it from a module's own
// location is what was wrong before: electron-vite bundles `src/main` into `out/main` for `dev`
// as well as `build`, so `import.meta.dirname` is the build output directory rather than any
// source tree, and in a packaged app it is a path inside `app.asar`. A walk up from there found
// the plugin in exactly one of those three modes and returned null in the others — which shows up
// only as an agent picker that has quietly lost the bundled Maestro subagents.
//
// `app.getAppPath()` is the fixed point instead: `apps/maestro` in the monorepo (dev, build and
// `electron .` alike, because it is the directory holding the package.json Electron was pointed
// at), and `…/resources/app.asar` when packaged. Both are the app's own location, not its
// compiler's output.

import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { BUNDLED_AGENTS_REL, findUpBundledAgents } from "../core/discovery.js";

/**
 * The Maestro plugin's bundled subagents, or null if this build does not ship them.
 *
 * Three sources, in order:
 *
 * 1. `MAESTRO_BUNDLED_AGENTS_DIR` — the explicit override, so a probe or a packaging layout we
 *    have not met can name the directory outright.
 * 2. The packaged app's unpacked resources. `plugins/` is data read with `fs.readdirSync`, so it
 *    ships beside `app.asar` rather than inside it — an asar path is not a real directory.
 * 3. A search upward from the app path, which is what finds `plugins/ai-tools-manager/agents`
 *    two levels above `apps/maestro` when running from this repo.
 */
export function bundledAgentsDir(): string | null {
  const fromEnv = process.env.MAESTRO_BUNDLED_AGENTS_DIR;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  if (app.isPackaged) {
    const packaged = path.join(process.resourcesPath, BUNDLED_AGENTS_REL);
    if (fs.existsSync(packaged)) return packaged;
  }

  return findUpBundledAgents(app.getAppPath());
}

/**
 * The bundled Maestro PLUGIN's root — the directory `plugins/ai-tools-manager` itself.
 *
 * Why the pane needs it, and why declaring skill names was not enough. A pane session runs with
 * `settingSources: []`, which loads no user, project or local settings — and therefore no
 * installed plugins. `skills: ['super-help', 'create-skill', …]` names skills the CLI then cannot
 * resolve, and the `Skill` tool answers "Unknown skill" for every one of them. Measured in the
 * window; nothing failed and nothing was logged, which is what makes it worth this comment.
 *
 * So the plugin is loaded PROGRAMMATICALLY instead, which is the same trade `settingSources: []`
 * makes everywhere else in this app: everything the session gets is passed in by name from here,
 * rather than merged in from files nobody looked at. The one this app ships is the one it loads —
 * a plugin the user installed globally still does not reach a pane session.
 *
 * MEASURED, BECAUSE THE OBVIOUS OBJECTION IS RIGHT ABOUT `settingSources` AND WRONG HERE. This
 * plugin also ships `hooks/hooks.json`, whose `PreToolUse` entry appends every tool call to
 * `<project>/.claude/maestro_session.log.jsonl` — which is exactly the pollution SESSION-PANE-PLAN
 * names as a reason not to load project settings, since `/session-log` is a view built for
 * orchestrator runs. Checked in the window against a fixture that HAS a `maestro.json` (the hook
 * no-ops without one, so a fixture without one would have proved nothing): after a turn that read
 * a file, no log file exists. A plugin loaded through this option contributes its skills, agents
 * and commands; its hooks do not run.
 *
 * Derived from `bundledAgentsDir()` rather than searched for separately, so the two cannot end up
 * pointing at different checkouts: the agents directory is `<plugin>/agents`.
 */
export function bundledPluginDir(): string | null {
  const agents = bundledAgentsDir();
  return agents ? path.dirname(agents) : null;
}
