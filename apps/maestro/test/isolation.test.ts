// Guards on the process boundary.
//
// The whole premise of the desktop migration is that the renderer has no node access and reaches
// the filesystem only through the enumerated IPC channels. That is a property of configuration,
// not of code that would fail loudly if it regressed — flipping `nodeIntegration` to true or
// adding a generic `invoke(channel, ...)` to the preload bridge would work fine and silently
// undo it. Hence these assertions.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
// The barrel, deliberately: this is a node-side test, and the point of the prompt-drift check
// below is to compare the renderer's literal against what the MAIN process actually builds.
import { previewClaudeRun } from "../src/core/index.js";
import { IPC, IPC_EVENTS } from "../src/shared/ipc.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const read = (rel: string) => fs.readFileSync(path.join(appRoot, rel), "utf8");

/**
 * Drop comments before scanning for imports.
 *
 * Prose talks about imports: a JSDoc line reading ``derives one from `idea` `` matches an
 * import-specifier pattern exactly as well as a real import line does, and so does a comment
 * naming the very module a check exists to forbid. Line comments only for `//`, so a `"https://"`
 * inside a string survives.
 */
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

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
      (m) => `${m[1] ? "IPC_EVENTS" : "IPC"}.${m[2]}`
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
    expect(preload).not.toContain('exposeInMainWorld("require"');
    expect(preload).not.toMatch(/exposeInMainWorld\([^)]*\bprocess\b/);
  });
});

describe("src/core boundary", () => {
  // THE REPLACEMENT FOR A PACKAGE EXPORT.
  //
  // `src/core` was `packages/maestro-core`, and the renderer-safe surface used to be enforced by
  // the package's `exports` map: the renderer imported `@repo/maestro-core/contracts`, and
  // reaching for the barrel instead was a different-looking import line that a reviewer would
  // catch. Both are relative paths now, and `../core/contracts.js` differs from
  // `../core/index.js` by one word. That is a real loss of safety, and this is what replaces it.
  //
  // What it costs to get wrong: the barrel re-exports modules that import fs and child_process.
  // A type pulled from it drags all of that into the renderer's type graph, and a value pulled
  // from it drags it into the renderer's BUNDLE. Quietly — types still resolve and tsc still
  // passes whenever @types/node is in scope — so nothing but an assertion catches it.
  //
  // Exactly two modules are renderer-safe, and both are self-contained by construction:
  // `contracts.ts` is interfaces only, `text.ts` has no imports at all. Adding a third means
  // proving it imports nothing that reaches the filesystem, so the list is deliberately short and
  // deliberately here rather than derived.
  const RENDERER_SAFE = ["contracts", "text"];

  const outsideMain = [...sourcesUnder("src/shared"), ...sourcesUnder("src/preload"), ...sourcesUnder("src/renderer")];
  const coreDir = path.join(appRoot, "src", "core");

  /** Every module specifier in `file`, from static imports, `export … from`, and `require()`. */
  function specifiersIn(file: string): string[] {
    const src = stripComments(fs.readFileSync(file, "utf8"));
    return [
      ...[...src.matchAll(/(?:from|import)\s*\(?\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]),
      ...[...src.matchAll(/require\(\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]),
    ];
  }

  /**
   * The module under src/core a specifier names, or null if it points elsewhere.
   *
   * Resolved on the filesystem rather than pattern-matched, so `../core/index.js`,
   * `../../../core/index.js` and a `./` chain that happens to land in core are all the same
   * finding — the check must not be evadable by writing the path differently.
   */
  function coreModule(fromFile: string, spec: string): string | null {
    if (!spec.startsWith(".")) return null;
    const resolved = path.resolve(path.dirname(fromFile), spec);
    const rel = path.relative(coreDir, resolved);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
    return rel.replace(/\.(js|ts|tsx)$/, "");
  }

  it("has files to check", () => {
    expect(outsideMain.length).toBeGreaterThan(0);
  });

  it("reaches src/core only through the renderer-safe modules", () => {
    const offenders: string[] = [];
    for (const file of outsideMain) {
      for (const spec of specifiersIn(file)) {
        const mod = coreModule(file, spec);
        if (mod !== null && !RENDERER_SAFE.includes(mod)) {
          offenders.push(`${path.relative(appRoot, file)} → src/core/${mod}`);
        }
      }
    }
    // Named in the failure so the message says which file and which module, not just "false".
    expect(offenders, `only src/core/{${RENDERER_SAFE.join(",")}} may be imported outside src/main`).toEqual([]);
  });

  it("still finds the imports it is supposed to be checking", () => {
    // A guard that silently stopped matching anything would pass forever. src/shared/ipc.ts
    // imports contracts and src/renderer/src/utils/text.ts re-exports text; if the resolver
    // regressed, this is what notices before the check above quietly becomes a no-op.
    const seen = new Set<string>();
    for (const file of outsideMain) {
      for (const spec of specifiersIn(file)) {
        const mod = coreModule(file, spec);
        if (mod !== null) seen.add(mod);
      }
    }
    expect([...seen].sort()).toEqual(RENDERER_SAFE);
  });

  it("keeps the renderer-safe modules free of imports that could reach the filesystem", () => {
    // The other half of the boundary. `contracts.ts` and `text.ts` are safe to import only for as
    // long as they stay self-contained — a `import fs from "node:fs"` added to either would let
    // node through the front door with every import line in the app still looking correct.
    for (const mod of RENDERER_SAFE) {
      const specs = specifiersIn(path.join(coreDir, `${mod}.ts`));
      // ./types.js is the model contracts re-exports; it is interfaces only, same as this file.
      const allowed = new Set(["./types.js"]);
      expect(
        specs.filter((s) => !allowed.has(s)),
        `src/core/${mod}.ts imports something new`
      ).toEqual([]);
    }
  });

  it("never imports @repo/claude-fs outside the main process", () => {
    // Same hazard, one layer down: claude-fs is the package src/core reads the filesystem with.
    const offenders = outsideMain.filter((file) => /["'`]@repo\/claude-fs/.test(fs.readFileSync(file, "utf8")));
    expect(offenders.map((f) => path.relative(appRoot, f))).toEqual([]);
  });

  it("imports no node builtins outside the main process", () => {
    const offenders = outsideMain.filter((file) => /from\s*["'`]node:/.test(fs.readFileSync(file, "utf8")));
    // The preload is a node context, but it deliberately imports nothing but electron — keeping
    // it that way is what makes the bridge auditable at a glance.
    expect(offenders.map((f) => path.relative(appRoot, f))).toEqual([]);
  });
});

describe("the claude bridge across the process boundary", () => {
  // The bridge's guarantee — the only executable prompts are ones the user was shown — rests on
  // `claude:run` accepting a token AND NOTHING ELSE. `test/core/claude.test.ts` covers the core
  // half (preview cannot spawn; a forged or replayed token is refused). What it cannot see is this
  // side of the wire: a preload that helpfully forwarded a prompt, an argv or a cwd alongside the
  // token would reopen the hole in a diff that looks like a convenience, and every core test would
  // still pass.
  const preload = read("src/preload/index.ts");
  const main = read("src/main/ipc.ts");

  it("sends the token and nothing else on the run channel", () => {
    const invoke = preload.match(/ipcRenderer\s*\n?\s*\.invoke\(IPC\.claudeRun[^)]*\)/);
    expect(invoke, "preload does not invoke IPC.claudeRun").not.toBeNull();
    expect(invoke![0]).toMatch(/invoke\(IPC\.claudeRun,\s*token\s*\)/);
  });

  it("never lets the renderer supply prompt text to either channel", () => {
    // preview takes a REQUEST (a shape main knows how to build a prompt from), never a prompt.
    expect(preload).toMatch(/invoke\(IPC\.claudePreview,\s*request\s*\)/);
    expect(preload).not.toMatch(/claudePreview,\s*(prompt|argv|cwd)/);
  });

  it("builds the prompt in the main process, from the open project", () => {
    // `previewClaudeRun(root, request)` — the cwd comes from main's project state, so a renderer
    // cannot aim a run at a directory the window is not showing.
    expect(main).toMatch(/previewClaudeRun\(root,\s*request\)/);
    expect(main).toMatch(/const root = currentRoot\(\);/);
  });

  it("drops outstanding preview tokens when the project changes", () => {
    // A token names the OUTGOING project's cwd. Left live, a modal open across a switch could
    // still spawn Claude against the repo the window has moved off.
    const announce = main.slice(main.indexOf("function announce("), main.indexOf("export function registerIpc"));
    expect(announce).toContain("clearInvocations()");
  });

  it("offers a Copy prompt identical to the prompt that would execute", () => {
    // The sentence exists twice on purpose. /maestro-tasks' Copy prompt is the paste-into-your-own-
    // session path and lives in the renderer; the executable one is built in the main process,
    // because the renderer must never be the source of a prompt the app will run. The cost of that
    // is silent drift — a reworded Copy prompt would quietly stop matching what Run does, and a
    // user comparing the two would be looking at a lie. So the two are compared here rather than
    // deduplicated: this asserts the renderer's LITERAL against what the builder actually returns,
    // not against a third copy of the string.
    const literal = read("src/renderer/src/routes/maestro-tasks.tsx").match(/`(Use \/maestro[^`]*)`/);
    expect(literal, "no Use /maestro template literal in the route").not.toBeNull();

    const project = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-prompt-drift-"));
    try {
      const filename = "001-a-task.md";
      const tasksDir = path.join(project, ".claude", "maestro-tasks");
      fs.mkdirSync(tasksDir, { recursive: true });
      fs.writeFileSync(path.join(tasksDir, filename), "# A task\n");

      const relativePath = path.posix.join(".claude", "maestro-tasks", filename);
      const fromRenderer = literal![1].replace("${task.relativePath}", relativePath);
      // No CLI is needed: preview returns the prompt whether or not one was found.
      const { prompt } = previewClaudeRun(project, { kind: "maestro-task", filename });

      expect(fromRenderer).toBe(prompt);
    } finally {
      fs.rmSync(project, { recursive: true, force: true });
    }
  });

  it("kills runs in flight when the app quits", () => {
    // The child is spawned detached so its process group can be signalled; the flip side is that
    // it outlives the app unless something kills it.
    expect(main).toMatch(/export function disposeIpc[\s\S]*disposeClaudeRuns\(\)/);
  });
});

describe("the create-* routes", () => {
  const routes = ["create-skill", "create-subagent", "create-plugin", "create-marketplace"] as const;
  const routeSrc = (name: string) => read(`src/renderer/src/routes/${name}.tsx`);

  it("are reachable from the app's navigation", () => {
    // Every other route in the app is a link in the top bar; a route with no way in is a route
    // nobody finds. The four live behind the Create menu there.
    const nav = read("src/renderer/src/components/top-nav.tsx");
    for (const route of routes) expect(nav, `no nav entry for /${route}`).toContain(`"/${route}"`);
  });

  it("reach a model only through the bridge, never through a spawn of their own", () => {
    // The acceptance criterion, asserted where it can regress. The renderer has no child_process to
    // reach for (the bundle test above), so what this actually guards is the OTHER way to lose the
    // confirmation: a route that called some future "just run it" channel instead of previewing.
    // `useCreateFlow` is the one place that touches `window.maestro.claude`, and it previews first.
    const flow = read("src/renderer/src/utils/create-flow.tsx");
    expect(flow).toContain("window.maestro.claude.preview(request)");
    expect(flow).toContain("ClaudeRunDialog");

    for (const route of routes) {
      const src = routeSrc(route);
      expect(src, `${route} talks to window.maestro.claude directly`).not.toMatch(/window\.maestro\.claude/);
      expect(src, `${route} builds an invocation`).not.toMatch(/claude\s+-p\b|--permission-mode|child_process/);
    }
  });

  it("send a request to the scaffold channel, never a destination path", () => {
    // Main resolves every path it writes from the open project plus a marketplace NAME. A preload
    // that forwarded a path would let a renderer aim a write anywhere on disk, and no test in
    // test/core/ can see this side of the wire.
    const preload = read("src/preload/index.ts");
    expect(preload).toMatch(/invoke\(IPC\.createScaffold,\s*request\s*\)/);
    expect(preload).not.toMatch(/createScaffold,\s*(path|dir|target|cwd)/);
  });

  it("preview the same description the scaffold writes, from one implementation", () => {
    // `buildDesc` decides the `description:` frontmatter. The preview pane shows it before the file
    // exists and the node-side scaffold writes it — two copies means a preview that can lie. The
    // renderer's text module must therefore only RE-EXPORT.
    const text = read("src/renderer/src/utils/text.ts");
    expect(text).toContain("../../../core/text.js");
    expect(text).not.toMatch(/function\s+buildDesc/);

    const reimplemented = sourcesUnder("src/renderer")
      .filter((f) => /function\s+(buildDesc|clip|firstSentence|joinOxford)\b/.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(appRoot, f));
    expect(reimplemented).toEqual([]);
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

describe("saving refreshes loader data", () => {
  // `seeded` is decided by the loader from whether maestro.json existed at load time, and nothing
  // re-runs a loader on its own after a save: saving doesn't navigate, and the `project:changed`
  // broadcast ProjectProvider invalidates on doesn't fire. Without an explicit invalidation the
  // "starter configuration, not saved" banner stays up after a successful save — telling the user
  // their config is unsaved while it sits on disk. Verified in a running window; there is no
  // render test that would catch it, hence this source-level guard.
  for (const route of ["workflows", "rules"] as const) {
    it(`/${route} invalidates the router after a successful save`, () => {
      const src = read(`src/renderer/src/routes/${route}.tsx`);
      expect(src).toMatch(/useRouter/);
      expect(src).toMatch(/router\.invalidate\(\)/);
      // The invalidation must be on the success path — after the `!res.ok` bail-out, so a
      // rejected save doesn't re-run the loader and stomp the editor's state.
      const bail = src.indexOf("if (!res.ok)");
      const invalidate = src.indexOf("router.invalidate()");
      expect(bail).toBeGreaterThan(-1);
      expect(invalidate).toBeGreaterThan(bail);
    });
  }
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
    ? fs
        .readdirSync(outDir)
        .filter((f) => f.endsWith(".js"))
        .map((f) => path.join(outDir, f))
    : [];

  // stripComments (module scope) matters doubly here: bundled dependencies ship JSDoc containing
  // lines like `* import process from 'node:process'`, which is documentation, not a resolved
  // import — matching it would fail this test for a bundle that is actually clean.

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

describe("built renderer stylesheets", () => {
  // The renderer CSP is `default-src 'self'`, so any remote reference that reaches the built CSS
  // is not a slow load — it is a hard block plus a console error, and the app silently renders in
  // fallback fonts. That is exactly what `@repo/styles`' Google Fonts `@import` did until the
  // families were vendored into the package. Restoring it, or adding any other CDN reference,
  // looks perfectly fine in a browser and breaks only here.
  const outDir = path.join(appRoot, "out", "renderer", "assets");
  const sheets = fs.existsSync(outDir)
    ? fs
        .readdirSync(outDir)
        .filter((f) => f.endsWith(".css"))
        .map((f) => path.join(outDir, f))
    : [];

  it.runIf(sheets.length > 0)("reference nothing off-origin", () => {
    for (const file of sheets) {
      const src = fs.readFileSync(file, "utf8");
      const remote = [...src.matchAll(/url\(\s*["']?(https?:)?\/\/[^)]*\)/g)].map((m) => m[0]);
      expect(remote, `${path.basename(file)} loads a remote asset`).toEqual([]);
      expect(src).not.toContain("fonts.googleapis.com");
      expect(src).not.toContain("fonts.gstatic.com");
    }
  });

  it.runIf(sheets.length > 0)("emit the vendored font files alongside them", () => {
    // A `@font-face` whose file never got emitted resolves to nothing and falls back silently.
    const emitted = fs.readdirSync(outDir).filter((f) => f.endsWith(".woff2"));
    expect(emitted.length).toBeGreaterThan(0);
    for (const family of ["inter", "bodoni-moda", "ibm-plex-mono"]) {
      expect(
        emitted.some((f) => f.startsWith(family)),
        `no ${family} woff2 emitted`
      ).toBe(true);
    }
  });
});
