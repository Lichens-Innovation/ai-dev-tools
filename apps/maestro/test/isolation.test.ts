// Guards on the process boundary.
//
// The whole premise of the desktop migration is that the renderer has no node access and reaches
// the filesystem only through the enumerated IPC channels. That is a property of configuration,
// not of code that would fail loudly if it regressed — flipping `nodeIntegration` to true or
// adding a generic `invoke(channel, ...)` to the preload bridge would work fine and silently
// undo it. Hence these assertions.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IPC, IPC_EVENTS } from "../src/shared/ipc.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const read = (rel: string) => fs.readFileSync(path.join(appRoot, rel), "utf8");

/** Every .ts/.tsx under a src subtree, excluding generated files. */
function sourcesUnder(rel: string): string[] {
  const root = path.join(appRoot, rel);
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e.name) && e.name !== "routeTree.gen.ts") out.push(full);
    }
  };
  if (fs.existsSync(root)) walk(root);
  return out;
}

describe("BrowserWindow security flags", () => {
  const main = read("src/main/index.ts");

  it("disables node integration in the renderer", () => {
    expect(main).toMatch(/nodeIntegration:\s*false/);
  });

  it("keeps context isolation on", () => {
    expect(main).toMatch(/contextIsolation:\s*true/);
  });

  it("routes external links to the OS browser instead of opening app frames", () => {
    expect(main).toContain("setWindowOpenHandler");
    expect(main).toMatch(/action:\s*"deny"/);
  });
});

describe("preload bridge", () => {
  const preload = read("src/preload/index.ts");

  it("exposes exactly one namespace", () => {
    const exposed = [...preload.matchAll(/exposeInMainWorld\(\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(exposed).toEqual(["maestro"]);
  });

  it("offers no generic invoke escape hatch", () => {
    // A passthrough like `invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)`
    // would hand the renderer every channel in the app, including future ones.
    expect(preload).not.toMatch(/invoke:\s*\(\s*channel/);
    expect(preload).not.toMatch(/ipcRenderer\.invoke\(\s*channel/);
  });

  it("only invokes channels declared in the shared contract", () => {
    const used = [...preload.matchAll(/ipcRenderer\.(?:invoke|on|removeListener)\(\s*IPC(_EVENTS)?\.(\w+)/g)].map(
      (m) => `${m[1] ? "IPC_EVENTS" : "IPC"}.${m[2]}`,
    );
    const declared = new Set([
      ...Object.keys(IPC).map((k) => `IPC.${k}`),
      ...Object.keys(IPC_EVENTS).map((k) => `IPC_EVENTS.${k}`),
    ]);
    for (const u of used) expect(declared).toContain(u);
    // And no raw string channels anywhere.
    expect(preload).not.toMatch(/ipcRenderer\.(invoke|on)\(\s*["'`]/);
  });

  it("does not re-export node or electron internals to the window", () => {
    expect(preload).not.toContain("exposeInMainWorld(\"require\"");
    expect(preload).not.toMatch(/exposeInMainWorld\([^)]*\bprocess\b/);
  });
});

describe("@repo/maestro-core boundary", () => {
  // src/shared/ipc.ts pulls its types from the `/contracts` subpath rather than the package
  // barrel. The barrel re-exports modules that import fs, child_process and import.meta.dirname;
  // a type pulled from it drags all of that into the renderer's type graph, and a value pulled
  // from it drags it into the renderer's BUNDLE. The failure is quiet — types still resolve and
  // tsc still passes whenever @types/node happens to be in scope — so nothing but an assertion
  // catches the day someone writes `from "@repo/maestro-core"` in shared/.
  const outsideMain = [...sourcesUnder("src/shared"), ...sourcesUnder("src/preload"), ...sourcesUnder("src/renderer")];

  it("has files to check", () => {
    expect(outsideMain.length).toBeGreaterThan(0);
  });

  it("never imports the package barrel outside the main process", () => {
    const offenders = outsideMain.filter((file) =>
      /from\s*["'`]@repo\/maestro-core["'`]|require\(\s*["'`]@repo\/maestro-core["'`]/.test(
        fs.readFileSync(file, "utf8"),
      ),
    );
    expect(offenders.map((f) => path.relative(appRoot, f))).toEqual([]);
  });

  it("never imports @repo/claude-fs outside the main process", () => {
    // Same hazard, one layer down: claude-fs is the package maestro-core reads the filesystem with.
    const offenders = outsideMain.filter((file) =>
      /["'`]@repo\/claude-fs/.test(fs.readFileSync(file, "utf8")),
    );
    expect(offenders.map((f) => path.relative(appRoot, f))).toEqual([]);
  });

  it("imports no node builtins outside the main process", () => {
    const offenders = outsideMain.filter((file) =>
      /from\s*["'`]node:/.test(fs.readFileSync(file, "utf8")),
    );
    // The preload is a node context, but it deliberately imports nothing but electron — keeping
    // it that way is what makes the bridge auditable at a glance.
    expect(offenders.map((f) => path.relative(appRoot, f))).toEqual([]);
  });
});

describe("session log tail ownership", () => {
  // The main process keeps one tail per webContents id and stops the old one before starting a
  // new one, so `log.subscribe` is single-owner by construction. A second subscriber anywhere in
  // the renderer would steal the tail from the first, and whichever unsubscribed first would
  // stop it for both — silently, with the other view simply going quiet.
  it("has exactly one subscriber in the renderer", () => {
    const callSites = sourcesUnder("src/renderer")
      .filter((f) => /maestro\.log\.subscribe\(/.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(appRoot, f));
    expect(callSites).toEqual(["src/renderer/src/utils/session-log-context.tsx"]);
  });
});

describe("built main and preload bundles", () => {
  // `electron` is a devDependency, so externalizeDepsPlugin (which reads `dependencies`) does not
  // cover it, and electron.vite.config.ts externalizes it by hand. If that ever comes out, the
  // npm package's Node-side shim gets inlined instead — its body is `module.exports =
  // getElectronPath()`, which runs at import time, fails to find `path.txt` beside the bundle and
  // throws "Electron failed to install correctly". The app then cannot start at all, and the
  // message points at node_modules rather than at the config. Nothing but launching the app
  // catches it, so: assert it here.
  const built = ["out/main/index.js", "out/preload/index.js"]
    .map((rel) => ({ rel, full: path.join(appRoot, rel) }))
    .filter(({ full }) => fs.existsSync(full));

  it.runIf(built.length > 0)("import electron rather than inlining its path shim", () => {
    for (const { rel, full } of built) {
      const src = fs.readFileSync(full, "utf8");
      expect(src, `${rel} inlined the electron npm shim`).not.toContain("getElectronPath");
      expect(src, `${rel} does not import electron`).toMatch(/from\s*["']electron["']/);
    }
  });
});

describe("built renderer bundle", () => {
  const outDir = path.join(appRoot, "out", "renderer", "assets");
  const bundles = fs.existsSync(outDir)
    ? fs.readdirSync(outDir).filter((f) => f.endsWith(".js")).map((f) => path.join(outDir, f))
    : [];

  /**
   * Drop comments before scanning. Bundled dependencies ship JSDoc containing lines like
   * `* import process from 'node:process'`, which is documentation, not a resolved import —
   * matching it would fail this test for a bundle that is actually clean.
   */
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

  it.runIf(bundles.length > 0)("imports no node builtins and no electron", () => {
    for (const file of bundles) {
      const src = stripComments(fs.readFileSync(file, "utf8"));
      expect(src).not.toMatch(/(?:from|import|require\()\s*["'`]node:/);
      expect(src).not.toMatch(/(?:from|require\()\s*["'`]electron["'`]/);
      // Vite's marker for a node builtin stubbed out for the browser — the exact failure mode
      // that used to blank a route in the web app.
      expect(src).not.toContain("__vite-browser-external");
    }
  });
});
