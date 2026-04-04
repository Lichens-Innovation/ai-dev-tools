import { builtinModules } from "node:module";
import { defineConfig } from "vite";

const nodeBuiltins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "node20",
    minify: false,
    lib: {
      entry: "src/mcp-server.ts",
      name: "codeCrawler",
      fileName: () => "mcp-server.js",
      formats: ["es"],
    },
    rollupOptions: {
      external: (id) => nodeBuiltins.has(id) || id.startsWith("node:"),
      output: {
        banner: "#!/usr/bin/env node",
      },
    },
  },
});
