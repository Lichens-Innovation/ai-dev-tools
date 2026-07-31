import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

/**
 * `electron` must be externalized explicitly, via `rollupOptions.external`.
 *
 * `externalizeDepsPlugin` derives its externals from package.json `dependencies`, and `electron`
 * is a devDependency — correctly so, since the runtime comes from the Electron binary rather than
 * being shipped in the app. So the plugin does not cover it, and what then gets bundled is the
 * npm package's Node-side shim: a module whose entire body is `module.exports = getElectronPath()`,
 * resolving `path.txt` relative to `__dirname`. Inlined into `out/main/index.js` that runs at
 * import time, finds no `path.txt` beside the bundle, and throws "Electron failed to install
 * correctly, please delete node_modules/electron and try installing again" — which sends you off
 * to reinstall node_modules for what is purely a bundling mistake. The app cannot start at all.
 *
 * The plugin's own `include` option is the documented lever for this and does NOT work here
 * (verified under vite 8.0.0 / electron-vite 4: it mutates `config.build` from inside the
 * `config` hook, and that no longer reaches the resolved ssr environment). Hence the direct
 * `external` below. `test/isolation.test.ts` asserts the built bundles import electron rather
 * than inlining the shim, because this failure is invisible until the app is launched.
 */
const ELECTRON_EXTERNAL = ["electron"];

export default defineConfig({
  main: {
    // @repo/maestro-core is a workspace source package, so it must be BUNDLED rather than
    // externalized — there is no built artifact for `require` to resolve at runtime.
    plugins: [externalizeDepsPlugin({ exclude: ["@repo/maestro-core", "@repo/claude-fs"] })],
    build: {
      rollupOptions: {
        external: ELECTRON_EXTERNAL,
        input: { index: resolve(__dirname, "src/main/index.ts") },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: ELECTRON_EXTERNAL,
        input: { index: resolve(__dirname, "src/preload/index.ts") },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    plugins: [
      tailwindcss(),
      tanstackRouter({
        target: "react",
        routesDirectory: resolve(__dirname, "src/renderer/src/routes"),
        generatedRouteTree: resolve(__dirname, "src/renderer/src/routeTree.gen.ts"),
        // Routes are plain components under a hash history — there is no SSR shell in Electron.
        //
        // Split, because the landing route is the project picker and it needs neither React Flow
        // + dagre nor react-markdown: startup parses 593 kB of shared chunk instead of a single
        // 2,346 kB bundle, and /workflows (772 kB) and /maestro-tasks (802 kB) load on first
        // navigation. Chunks resolve relatively (`base: "./"`), which is what makes this safe for
        // the packaged `file://` load — a build that regressed `base` to "/" would leave routes
        // blank in the packaged app while dev, served over http, stayed perfectly happy.
        autoCodeSplitting: true,
      }),
      viteReact(),
    ],
    build: {
      rollupOptions: { input: { index: resolve(__dirname, "src/renderer/index.html") } },
    },
  },
});
