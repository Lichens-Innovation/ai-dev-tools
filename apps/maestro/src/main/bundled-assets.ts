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
